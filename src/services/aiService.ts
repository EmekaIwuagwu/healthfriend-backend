import OpenAI from 'openai';
import { 
  IAIAnalysis, 
  IChatMessage, 
  ISymptomAnalysisRequest, 
  IAIChatResponse 
} from '../types';
import { 
  AI_MODELS, 
  AI_ANALYSIS_VERSION, 
  AI_CONFIDENCE_THRESHOLD, 
  AI_MAX_TOKENS, 
  AI_TEMPERATURE 
} from '../utils/constants';
import { generateId, logError, logInfo } from '../utils/helpers';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class AIService {
  private static readonly MODEL = AI_MODELS.GPT_4;
  private static readonly MAX_TOKENS = AI_MAX_TOKENS;
  private static readonly TEMPERATURE = AI_TEMPERATURE;

  // System prompts for different AI tasks
  private static readonly SYSTEM_PROMPTS = {
    SYMPTOM_ANALYSIS: `You are an experienced medical AI assistant for HealthFriend, a telemedicine platform. Your role is to analyze patient symptoms and provide preliminary assessments.

IMPORTANT GUIDELINES:
- You are NOT a replacement for professional medical diagnosis
- Always recommend seeing a doctor for serious symptoms
- Provide risk levels: low, medium, high
- Give specific, actionable advice
- Be empathetic and reassuring while being medically responsible
- Focus on common conditions but mention when specialist consultation is needed
- Consider patient age, gender, and medical history when provided

Your response should be structured and include:
1. Risk assessment (low/medium/high)
2. Possible conditions (most likely first)
3. Suggested immediate actions
4. When to seek medical attention
5. Confidence level in assessment

Always err on the side of caution for patient safety.`,

    MEDICAL_CHAT: `You are a friendly, knowledgeable medical AI assistant for HealthFriend. Help patients understand their symptoms and guide them appropriately.

Guidelines:
- Ask clarifying questions to better understand symptoms
- Provide educational information about conditions
- Guide patients on when to seek immediate care
- Be supportive and reduce anxiety when appropriate
- Give practical self-care advice for minor issues
- Always maintain professional boundaries

Remember: You're providing information and guidance, not medical diagnoses.`,

    TRIAGE: `You are a medical triage AI for HealthFriend. Your primary role is to assess urgency and guide patients to appropriate care levels.

Triage Levels:
- EMERGENCY: Life-threatening, needs immediate emergency care
- URGENT: Needs medical attention within hours
- ROUTINE: Can wait for regular appointment

Consider these red flags for emergency care:
- Chest pain, difficulty breathing
- Severe bleeding, trauma
- Loss of consciousness, severe headache
- Signs of stroke, heart attack
- Severe abdominal pain
- High fever with confusion

Always prioritize patient safety over convenience.`
  };

  // Emergency keywords that trigger high-risk assessment
  private static readonly EMERGENCY_KEYWORDS = [
    'chest pain', 'difficulty breathing', 'can\'t breathe', 'heart attack',
    'stroke', 'unconscious', 'seizure', 'severe bleeding', 'suicide',
    'overdose', 'severe headache', 'vision loss', 'paralysis',
    'severe abdominal pain', 'vomiting blood', 'black stool'
  ];

  // High-risk symptom combinations
  private static readonly HIGH_RISK_COMBINATIONS = [
    ['fever', 'neck stiffness', 'headache'],
    ['chest pain', 'shortness of breath'],
    ['severe headache', 'vision changes'],
    ['abdominal pain', 'fever', 'vomiting']
  ];

  /**
   * Analyze patient symptoms and provide AI assessment
   */
  static async analyzeSymptoms(request: ISymptomAnalysisRequest): Promise<IAIAnalysis> {
    try {
      const {
        symptoms,
        chatHistory,
        patientAge,
        patientGender,
        medicalHistory = [],
        currentMedications = [],
        allergies = []
      } = request;

      logInfo('Starting AI symptom analysis', { 
        symptoms: symptoms.slice(0, 5), // Log first 5 symptoms only
        hasHistory: chatHistory.length > 0 
      });

      // Pre-analysis risk assessment
      const emergencyDetected = this.detectEmergencySymptoms(symptoms);
      
      // Build context for AI
      const context = this.buildAnalysisContext({
        symptoms,
        chatHistory,
        patientAge,
        patientGender,
        medicalHistory,
        currentMedications,
        allergies
      });

      // Create analysis prompt
      const analysisPrompt = this.createAnalysisPrompt(context);

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPTS.SYMPTOM_ANALYSIS },
          { role: 'user', content: analysisPrompt }
        ],
        max_tokens: this.MAX_TOKENS,
        temperature: this.TEMPERATURE,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('No response from AI service');
      }

      // Parse AI response
      const aiResponse = JSON.parse(response);
      
      // Create structured analysis
      const analysis: IAIAnalysis = {
        riskLevel: emergencyDetected ? 'high' : (aiResponse.riskLevel || 'medium'),
        suggestedActions: aiResponse.suggestedActions || [],
        recommendSeeDoctor: emergencyDetected || aiResponse.recommendSeeDoctor || false,
        confidence: aiResponse.confidence || 0.7,
        possibleConditions: aiResponse.possibleConditions || [],
        urgencyLevel: emergencyDetected ? 'emergency' : (aiResponse.urgencyLevel || 'routine'),
        timestamp: new Date(),
        aiModel: this.MODEL,
        analysisVersion: AI_ANALYSIS_VERSION
      };

      // Validate and enhance analysis
      this.validateAnalysis(analysis);
      this.enhanceAnalysis(analysis, symptoms);

      logInfo('AI symptom analysis completed', { 
        riskLevel: analysis.riskLevel,
        confidence: analysis.confidence,
        urgencyLevel: analysis.urgencyLevel 
      });

      return analysis;

    } catch (error) {
      logError('AI symptom analysis failed', error);
      
      // Return safe fallback analysis
      return this.createFallbackAnalysis(request.symptoms);
    }
  }

  /**
   * Generate AI chat response
   */
  static async generateChatResponse(
    sessionId: string,
    userMessage: string,
    chatHistory: IChatMessage[],
    context?: any
  ): Promise<IAIChatResponse> {
    try {
      logInfo('Generating AI chat response', { 
        sessionId,
        messageLength: userMessage.length,
        historyLength: chatHistory.length 
      });

      // Build conversation context
      const conversationHistory = this.buildConversationHistory(chatHistory);
      
      // Create chat prompt
      const chatPrompt = this.createChatPrompt(userMessage, context);

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPTS.MEDICAL_CHAT },
          ...conversationHistory,
          { role: 'user', content: chatPrompt }
        ],
        max_tokens: this.MAX_TOKENS,
        temperature: this.TEMPERATURE
      });

      const aiMessage = completion.choices[0].message.content;
      if (!aiMessage) {
        throw new Error('No response from AI service');
      }

      // Create chat message
      const chatMessage: IChatMessage = {
        messageId: generateId('msg'),
        sender: 'ai',
        content: aiMessage,
        timestamp: new Date(),
        messageType: 'text',
        metadata: {
          confidence: 0.8,
          suggestedQuestions: await this.generateSuggestedQuestions(userMessage, chatHistory),
          riskAssessment: this.assessMessageRisk(userMessage),
          requiresFollowUp: this.requiresFollowUp(userMessage, aiMessage)
        }
      };

      // Check if escalation is needed
      const shouldEscalate = this.shouldEscalateToDoctor(userMessage, chatHistory);
      const escalationReason = shouldEscalate ? this.getEscalationReason(userMessage, chatHistory) : undefined;

      const response: IAIChatResponse = {
        sessionId,
        message: chatMessage,
        suggestedQuestions: chatMessage.metadata?.suggestedQuestions,
        shouldEscalate,
        escalationReason,
        sessionStatus: shouldEscalate ? 'escalated_to_doctor' : 'active',
        cost: this.calculateChatCost(chatHistory.length + 1)
      };

      logInfo('AI chat response generated', { 
        sessionId,
        shouldEscalate,
        messageId: chatMessage.messageId 
      });

      return response;

    } catch (error) {
      logError('AI chat response generation failed', error);
      throw new Error('AI service temporarily unavailable');
    }
  }

  /**
   * Perform medical triage assessment
   */
  static async performTriage(
    symptoms: string[],
    urgencyIndicators: string[]
  ): Promise<{ urgencyLevel: 'routine' | 'urgent' | 'emergency'; reasoning: string }> {
    try {
      const triagePrompt = `
        Perform medical triage for the following symptoms and urgency indicators:
        
        Symptoms: ${symptoms.join(', ')}
        Additional indicators: ${urgencyIndicators.join(', ')}
        
        Determine urgency level and provide reasoning.
        Return as JSON with: { "urgencyLevel": "routine|urgent|emergency", "reasoning": "explanation" }
      `;

      const completion = await openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPTS.TRIAGE },
          { role: 'user', content: triagePrompt }
        ],
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('No triage response from AI');
      }

      return JSON.parse(response);

    } catch (error) {
      logError('AI triage assessment failed', error);
      
      // Safe fallback
      const hasEmergencySymptoms = this.detectEmergencySymptoms(symptoms);
      return {
        urgencyLevel: hasEmergencySymptoms ? 'emergency' : 'routine',
        reasoning: 'Automated assessment based on symptom keywords'
      };
    }
  }

  /**
   * Generate follow-up questions for better symptom assessment
   */
  static async generateFollowUpQuestions(
    symptoms: string[],
    responses: string[]
  ): Promise<string[]> {
    try {
      const prompt = `
        Based on these symptoms: ${symptoms.join(', ')}
        And previous responses: ${responses.join(' | ')}
        
        Generate 3-5 relevant follow-up questions to better understand the patient's condition.
        Focus on:
        - Symptom severity and duration
        - Associated symptoms
        - Triggers or patterns
        - Impact on daily activities
        
        Return as JSON array of questions.
      `;

      const completion = await openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          { role: 'system', content: 'Generate helpful medical follow-up questions.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        return this.getDefaultFollowUpQuestions();
      }

      const parsed = JSON.parse(response);
      return parsed.questions || this.getDefaultFollowUpQuestions();

    } catch (error) {
      logError('Follow-up question generation failed', error);
      return this.getDefaultFollowUpQuestions();
    }
  }

  // Helper Methods

  private static detectEmergencySymptoms(symptoms: string[]): boolean {
    const symptomsText = symptoms.join(' ').toLowerCase();
    
    // Check for emergency keywords
    const hasEmergencyKeywords = this.EMERGENCY_KEYWORDS.some(keyword =>
      symptomsText.includes(keyword)
    );

    // Check for high-risk symptom combinations
    const hasHighRiskCombination = this.HIGH_RISK_COMBINATIONS.some(combination =>
      combination.every(symptom => symptomsText.includes(symptom))
    );

    return hasEmergencyKeywords || hasHighRiskCombination;
  }

  private static buildAnalysisContext(data: any): string {
    const {
      symptoms,
      chatHistory,
      patientAge,
      patientGender,
      medicalHistory,
      currentMedications,
      allergies
    } = data;

    let context = `Patient presenting with: ${symptoms.join(', ')}\n`;
    
    if (patientAge) context += `Age: ${patientAge}\n`;
    if (patientGender) context += `Gender: ${patientGender}\n`;
    if (medicalHistory.length) context += `Medical History: ${medicalHistory.join(', ')}\n`;
    if (currentMedications.length) context += `Current Medications: ${currentMedications.join(', ')}\n`;
    if (allergies.length) context += `Allergies: ${allergies.join(', ')}\n`;
    
    if (chatHistory.length > 0) {
      context += `\nPrevious conversation:\n`;
      chatHistory.slice(-5).forEach(msg => {
        context += `${msg.sender}: ${msg.content}\n`;
      });
    }

    return context;
  }

  private static createAnalysisPrompt(context: string): string {
    return `
      ${context}
      
      Please provide a comprehensive analysis in JSON format with the following structure:
      {
        "riskLevel": "low|medium|high",
        "possibleConditions": ["condition1", "condition2"],
        "suggestedActions": ["action1", "action2"],
        "urgencyLevel": "routine|urgent|emergency",
        "recommendSeeDoctor": boolean,
        "confidence": 0.0-1.0,
        "reasoning": "Brief explanation of assessment"
      }
    `;
  }

  private static createChatPrompt(userMessage: string, context?: any): string {
    let prompt = userMessage;
    
    if (context) {
      prompt = `Context: ${JSON.stringify(context)}\n\nUser message: ${userMessage}`;
    }
    
    return prompt;
  }

  private static buildConversationHistory(chatHistory: IChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    return chatHistory.slice(-10).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
  }

  private static async generateSuggestedQuestions(
    userMessage: string,
    chatHistory: IChatMessage[]
  ): Promise<string[]> {
    // Simple implementation - can be enhanced with AI
    const commonQuestions = [
      "Can you describe the pain scale from 1-10?",
      "How long have you been experiencing this?",
      "Does anything make it better or worse?",
      "Have you tried any treatments?",
      "Is this affecting your daily activities?"
    ];
    
    return commonQuestions.slice(0, 3);
  }

  private static assessMessageRisk(message: string): 'low' | 'medium' | 'high' {
    const lowerMessage = message.toLowerCase();
    
    if (this.EMERGENCY_KEYWORDS.some(keyword => lowerMessage.includes(keyword))) {
      return 'high';
    }
    
    const mediumRiskKeywords = ['severe', 'persistent', 'worsening', 'concerning', 'worried'];
    if (mediumRiskKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  }

  private static requiresFollowUp(userMessage: string, aiMessage: string): boolean {
    const followUpIndicators = [
      'see a doctor',
      'medical attention',
      'monitor',
      'follow up',
      'track symptoms'
    ];
    
    return followUpIndicators.some(indicator =>
      aiMessage.toLowerCase().includes(indicator)
    );
  }

  private static shouldEscalateToDoctor(userMessage: string, chatHistory: IChatMessage[]): boolean {
    // Check for emergency symptoms
    if (this.detectEmergencySymptoms([userMessage])) {
      return true;
    }
    
    // Check conversation length (escalate after many exchanges)
    if (chatHistory.length > 20) {
      return true;
    }
    
    // Check for user expressing concern or dissatisfaction
    const escalationPhrases = [
      'not helping',
      'need a real doctor',
      'very worried',
      'getting worse',
      'emergency'
    ];
    
    return escalationPhrases.some(phrase =>
      userMessage.toLowerCase().includes(phrase)
    );
  }

  private static getEscalationReason(userMessage: string, chatHistory: IChatMessage[]): string {
    if (this.detectEmergencySymptoms([userMessage])) {
      return 'Emergency symptoms detected';
    }
    
    if (chatHistory.length > 20) {
      return 'Extended conversation requires human oversight';
    }
    
    return 'Patient request for doctor consultation';
  }

  private static calculateChatCost(messageCount: number): number {
    const baseCost = 0.001; // Base cost in ETH
    const costPerMessage = 0.0001; // Cost per message
    return baseCost + (messageCount * costPerMessage);
  }

  private static validateAnalysis(analysis: IAIAnalysis): void {
    // Ensure confidence is within valid range
    if (analysis.confidence < 0 || analysis.confidence > 1) {
      analysis.confidence = 0.7; // Default confidence
    }
    
    // Ensure we have suggested actions
    if (!analysis.suggestedActions || analysis.suggestedActions.length === 0) {
      analysis.suggestedActions = ['Monitor symptoms and rest'];
    }
    
    // High-risk cases should recommend seeing a doctor
    if (analysis.riskLevel === 'high') {
      analysis.recommendSeeDoctor = true;
      analysis.urgencyLevel = 'urgent';
    }
  }

  private static enhanceAnalysis(analysis: IAIAnalysis, symptoms: string[]): void {
    // Add emergency flag for specific symptoms
    if (this.detectEmergencySymptoms(symptoms)) {
      analysis.riskLevel = 'high';
      analysis.urgencyLevel = 'emergency';
      analysis.recommendSeeDoctor = true;
      analysis.suggestedActions.unshift('Seek immediate medical attention');
    }
  }

  private static createFallbackAnalysis(symptoms: string[]): IAIAnalysis {
    const hasEmergencySymptoms = this.detectEmergencySymptoms(symptoms);
    
    return {
      riskLevel: hasEmergencySymptoms ? 'high' : 'medium',
      suggestedActions: hasEmergencySymptoms 
        ? ['Seek immediate medical attention', 'Do not delay treatment']
        : ['Monitor symptoms', 'Rest and stay hydrated', 'Consider consulting a healthcare provider'],
      recommendSeeDoctor: true,
      confidence: 0.5,
      possibleConditions: ['Multiple conditions possible - requires professional assessment'],
      urgencyLevel: hasEmergencySymptoms ? 'emergency' : 'routine',
      timestamp: new Date(),
      aiModel: 'fallback',
      analysisVersion: AI_ANALYSIS_VERSION
    };
  }

  private static getDefaultFollowUpQuestions(): string[] {
    return [
      "How would you rate your pain on a scale of 1-10?",
      "When did these symptoms first start?",
      "Have you noticed any patterns or triggers?",
      "Are you taking any medications currently?",
      "How are these symptoms affecting your daily life?"
    ];
  }

  /**
   * Health check for AI service
   */
  static async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const testCompletion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 10
      });

      return {
        status: 'healthy',
        details: {
          model: 'gpt-3.5-turbo',
          responseTime: Date.now(),
          tokensUsed: testCompletion.usage?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

export default AIService;