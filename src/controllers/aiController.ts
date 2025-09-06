import { Request, Response } from 'express';
import { 
  IAIChatSession, 
  IStartAIChatRequest, 
  ISendMessageRequest,
  ISymptomAnalysisRequest,
  IChatMessage 
} from '../types';
import AIChatSession from '../models/AIChatSession';
import User from '../models/User';
import Consultation from '../models/Consultation';
import AIService from '../services/aiService';
import PaymentService from '../services/paymentService';
import { AuthRequest } from '../middleware/auth';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  generateId,
  calculatePagination,
  getPaginationQuery,
  logInfo,
  logError
} from '../utils/helpers';
import { 
  HTTP_STATUS, 
  DEFAULT_PAGE_SIZE,
  AI_CONSULTATION_BASE_FEE 
} from '../utils/constants';

class AIController {
  /**
   * Start a new AI chat session
   * POST /api/ai/start-session
   */
  async startSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const sessionData: IStartAIChatRequest = req.body;

      // Calculate session cost
      const sessionCost = AI_CONSULTATION_BASE_FEE;
      const gasFee = 0.0001; // Minimal gas fee for AI consultations
      const platformFee = sessionCost * 0.05; // 5% platform fee

      // Create payment transaction
      const paymentTransaction = await PaymentService.createPaymentTransaction({
        userId: req.user._id.toString(),
        type: 'ai_consultation',
        amount: sessionCost,
        currency: sessionData.paymentCurrency,
        blockchainNetwork: 'ethereum',
        fromAddress: req.user.walletAddress,
        metadata: {
          description: 'AI health consultation session',
          category: 'ai_consultation'
        }
      });

      // Create AI chat session
      const session = new AIChatSession({
        sessionId: generateId('ai_session'),
        userId: req.user._id,
        symptoms: sessionData.symptoms,
        status: 'active',
        totalCost: sessionCost,
        language: sessionData.language || 'en',
        payment: {
          amount: sessionCost,
          currency: sessionData.paymentCurrency,
          gasFee,
          platformFee,
          doctorEarnings: 0, // No doctor earnings for AI sessions
          status: 'pending',
          blockchainNetwork: 'ethereum',
          paymentMethod: 'wallet'
        },
        messages: []
      });

      await session.save();

      // Generate initial AI response
      const initialMessage = `Hello! I'm your AI health assistant. I understand you're experiencing: ${sessionData.symptoms.join(', ')}. 

${sessionData.description}

I'm here to help you understand your symptoms and provide guidance. Let me ask you a few questions to better assess your situation.

Please note: I'm an AI assistant and not a replacement for professional medical care. If you have severe symptoms or feel this is an emergency, please seek immediate medical attention.

Let's start with: How long have you been experiencing these symptoms?`;

      // Add initial AI message
      const aiMessage: IChatMessage = {
        messageId: generateId('msg'),
        sender: 'ai',
        content: initialMessage,
        timestamp: new Date(),
        messageType: 'question',
        metadata: {
          confidence: 0.9,
          suggestedQuestions: [
            "How long have you been experiencing these symptoms?",
            "On a scale of 1-10, how would you rate your discomfort?",
            "Have you tried any treatments or medications?",
            "Do you have any known allergies or medical conditions?"
          ],
          riskAssessment: 'low',
          requiresFollowUp: true
        }
      };

      session.messages.push(aiMessage);
      await session.save();

      logInfo('AI chat session started', { 
        sessionId: session.sessionId,
        userId: req.user._id,
        symptoms: sessionData.symptoms 
      });

      res.status(HTTP_STATUS.CREATED).json(
        createSuccessResponse({
          sessionId: session.sessionId,
          status: session.status,
          estimatedCost: sessionCost,
          message: aiMessage,
          paymentDetails: {
            transactionId: paymentTransaction.transactionId,
            amount: sessionCost,
            currency: sessionData.paymentCurrency
          }
        }, 'AI chat session started successfully')
      );
    } catch (error) {
      logError('Start AI session failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to start AI session', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Send message to AI chat session
   * POST /api/ai/sessions/:sessionId/message
   */
  async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const { sessionId } = req.params;
      const messageData: ISendMessageRequest = req.body;

      // Find session
      const session = await AIChatSession.findOne({ 
        sessionId, 
        userId: req.user._id 
      });

      if (!session) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('AI chat session not found', 'NOT_FOUND')
        );
        return;
      }

      if (!session.canAddMessage()) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Session is not active or message limit reached', 'VALIDATION_ERROR')
        );
        return;
      }

      // Add user message
      const userMessage: IChatMessage = {
        messageId: generateId('msg'),
        sender: 'user',
        content: messageData.content,
        timestamp: new Date(),
        messageType: messageData.messageType || 'text',
        attachments: messageData.attachments
      };

      await session.addMessage(
        userMessage.messageId,
        userMessage.sender,
        userMessage.content,
        userMessage.messageType,
        undefined,
        userMessage.attachments
      );

      // Generate AI response
      const aiResponse = await AIService.generateChatResponse(
        sessionId,
        messageData.content,
        session.messages,
        {
          symptoms: session.symptoms,
          userId: req.user._id,
          sessionData: session
        }
      );

      // Add AI response to session
      await session.addMessage(
        aiResponse.message.messageId,
        aiResponse.message.sender,
        aiResponse.message.content,
        aiResponse.message.messageType,
        aiResponse.message.metadata
      );

      // Handle escalation if needed
      if (aiResponse.shouldEscalate) {
        session.status = 'escalated_to_doctor';
        session.escalationReason = aiResponse.escalationReason;
        await session.save();
      }

      logInfo('AI message exchange completed', { 
        sessionId,
        userId: req.user._id,
        shouldEscalate: aiResponse.shouldEscalate 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          sessionId,
          userMessage,
          aiResponse: aiResponse.message,
          suggestedQuestions: aiResponse.suggestedQuestions,
          shouldEscalate: aiResponse.shouldEscalate,
          escalationReason: aiResponse.escalationReason,
          sessionStatus: aiResponse.sessionStatus,
          totalCost: aiResponse.cost
        }, 'Message sent successfully')
      );
    } catch (error) {
      logError('Send AI message failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to send message', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Analyze symptoms with AI
   * POST /api/ai/analyze-symptoms
   */
  async analyzeSymptoms(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const analysisRequest: ISymptomAnalysisRequest = {
        ...req.body,
        patientAge: req.user.dateOfBirth ? 
          Math.floor((Date.now() - req.user.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 
          undefined,
        patientGender: req.user.gender,
        medicalHistory: req.user.medicalHistory?.map(h => h.condition) || [],
        currentMedications: req.user.currentMedications || [],
        allergies: req.user.allergies || []
      };

      // Perform AI analysis
      const analysis = await AIService.analyzeSymptoms(analysisRequest);

      // Create consultation record if high risk
      let consultationId: string | undefined;
      if (analysis.riskLevel === 'high' || analysis.recommendSeeDoctor) {
        try {
          const consultation = new Consultation({
            consultationId: generateId('consultation'),
            type: 'ai_chat',
            patientId: req.user._id,
            symptoms: analysisRequest.symptoms,
            description: analysisRequest.chatHistory.map(msg => msg.content).join(' '),
            status: 'completed',
            aiAnalysis: analysis,
            followUpRequired: analysis.recommendSeeDoctor,
            payment: {
              amount: AI_CONSULTATION_BASE_FEE,
              currency: 'ETH',
              gasFee: 0.0001,
              platformFee: AI_CONSULTATION_BASE_FEE * 0.05,
              doctorEarnings: 0,
              status: 'pending',
              blockchainNetwork: 'ethereum',
              paymentMethod: 'wallet'
            }
          });

          await consultation.save();
          consultationId = consultation.consultationId;
        } catch (consultationError) {
          logError('Failed to create consultation record:', consultationError);
        }
      }

      logInfo('Symptom analysis completed', { 
        userId: req.user._id,
        riskLevel: analysis.riskLevel,
        recommendSeeDoctor: analysis.recommendSeeDoctor,
        consultationCreated: !!consultationId 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          analysis,
          consultationId,
          recommendations: {
            urgency: analysis.urgencyLevel,
            suggestedActions: analysis.suggestedActions,
            followUpQuestions: await AIService.generateFollowUpQuestions(
              analysisRequest.symptoms,
              analysisRequest.chatHistory.map(msg => msg.content)
            )
          }
        }, 'Symptom analysis completed successfully')
      );
    } catch (error) {
      logError('Analyze symptoms failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to analyze symptoms', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get AI chat session details
   * GET /api/ai/sessions/:sessionId
   */
  async getSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const { sessionId } = req.params;

      const session = await AIChatSession.findOne({ 
        sessionId, 
        userId: req.user._id 
      }).lean();

      if (!session) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('AI chat session not found', 'NOT_FOUND')
        );
        return;
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(session, 'AI chat session retrieved successfully')
      );
    } catch (error) {
      logError('Get AI session failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve AI session', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get user's AI chat sessions
   * GET /api/ai/sessions
   */
  async getUserSessions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const { 
        page = 1, 
        limit = DEFAULT_PAGE_SIZE,
        status,
        dateFrom,
        dateTo 
      } = req.query;

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      // Build query
      const query: any = { userId: req.user._id };
      
      if (status) {
        query.status = status;
      }
      
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
        if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
      }

      // Get total count
      const totalSessions = await AIChatSession.countDocuments(query);

      // Get sessions
      const sessions = await AIChatSession.find(query)
        .select('-messages') // Exclude messages for performance
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(queryLimit)
        .lean();

      const pagination = calculatePagination(
        Number(page),
        Number(limit),
        totalSessions
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          sessions,
          pagination
        }, 'AI chat sessions retrieved successfully')
      );
    } catch (error) {
      logError('Get user AI sessions failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve AI sessions', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Complete AI chat session
   * POST /api/ai/sessions/:sessionId/complete
   */
  async completeSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const { sessionId } = req.params;
      const { feedback } = req.body;

      const session = await AIChatSession.findOne({ 
        sessionId, 
        userId: req.user._id 
      });

      if (!session) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('AI chat session not found', 'NOT_FOUND')
        );
        return;
      }

      // Complete session
      await session.completeSession();

      // Add feedback if provided
      if (feedback) {
        await session.addFeedback(feedback);
      }

      // Perform final symptom analysis
      let finalAnalysis;
      if (session.messages.length > 2) {
        try {
          finalAnalysis = await AIService.analyzeSymptoms({
            symptoms: session.symptoms,
            chatHistory: session.messages,
            patientAge: req.user.dateOfBirth ? 
              Math.floor((Date.now() - req.user.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 
              undefined,
            patientGender: req.user.gender,
            medicalHistory: req.user.medicalHistory?.map(h => h.condition) || [],
            currentMedications: req.user.currentMedications || [],
            allergies: req.user.allergies || []
          });

          session.finalAnalysis = finalAnalysis;
          await session.save();
        } catch (analysisError) {
          logError('Final analysis failed:', analysisError);
        }
      }

      logInfo('AI chat session completed', { 
        sessionId,
        userId: req.user._id,
        messageCount: session.messageCount,
        duration: session.sessionDuration 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          sessionId,
          status: session.status,
          finalAnalysis,
          summary: {
            totalMessages: session.messageCount,
            duration: session.sessionDuration,
            symptoms: session.symptoms,
            cost: session.totalCost
          }
        }, 'AI chat session completed successfully')
      );
    } catch (error) {
      logError('Complete AI session failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to complete AI session', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Escalate AI session to doctor
   * POST /api/ai/sessions/:sessionId/escalate
   */
  async escalateToDoctor(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const { sessionId } = req.params;
      const { reason, doctorId, urgency, scheduledDateTime } = req.body;

      const session = await AIChatSession.findOne({ 
        sessionId, 
        userId: req.user._id 
      });

      if (!session) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('AI chat session not found', 'NOT_FOUND')
        );
        return;
      }

      if (session.status !== 'active') {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Only active sessions can be escalated', 'VALIDATION_ERROR')
        );
        return;
      }

      // Create doctor consultation
      const consultation = new Consultation({
        consultationId: generateId('consultation'),
        type: 'video_call',
        patientId: req.user._id,
        doctorId: doctorId,
        scheduledDateTime: scheduledDateTime ? new Date(scheduledDateTime) : undefined,
        symptoms: session.symptoms,
        description: `Escalated from AI chat session: ${session.messages.slice(-3).map(m => m.content).join(' ')}`,
        status: 'pending',
        aiAnalysis: session.finalAnalysis,
        followUpRequired: false,
        payment: {
          amount: 0.05, // Standard video consultation fee
          currency: 'ETH',
          gasFee: 0.002,
          platformFee: 0.0025,
          doctorEarnings: 0.045,
          status: 'pending',
          blockchainNetwork: 'ethereum',
          paymentMethod: 'wallet'
        },
        videoCallDetails: {
          sessionId: `escalated_${sessionId}`,
          roomId: `room_${generateId('escalation')}`,
          participantsJoined: []
        }
      });

      await consultation.save();

      // Update AI session
      await session.escalateToDoctor(reason, consultation.consultationId);

      logInfo('AI session escalated to doctor', { 
        sessionId,
        consultationId: consultation.consultationId,
        doctorId,
        userId: req.user._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          sessionId,
          consultationId: consultation.consultationId,
          escalationReason: reason,
          status: 'escalated_to_doctor',
          doctorConsultation: {
            consultationId: consultation.consultationId,
            doctorId,
            scheduledDateTime: consultation.scheduledDateTime,
            type: consultation.type
          }
        }, 'Session escalated to doctor successfully')
      );
    } catch (error) {
      logError('Escalate AI session failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to escalate session', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get AI service health check
   * GET /api/ai/health
   */
  async getHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const healthCheck = await AIService.healthCheck();

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(healthCheck, 'AI service health check completed')
      );
    } catch (error) {
      logError('AI health check failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('AI health check failed', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get AI statistics
   * GET /api/ai/stats
   */
  async getAIStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Get AI usage statistics
      const [stats] = await AIChatSession.getSessionStats(
        req.user?.role === 'admin' ? undefined : req.user?._id.toString()
      );

      // Get common symptoms
      const commonSymptoms = await AIChatSession.getCommonSymptoms(10);

      // Get escalation analysis
      const escalationStats = await this.getEscalationStats();

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          sessionStats: stats || {
            totalSessions: 0,
            activeSessions: 0,
            completedSessions: 0,
            escalatedSessions: 0,
            abandonedSessions: 0,
            averageSessionDuration: 0,
            averageMessageCount: 0,
            totalRevenue: 0,
            escalationRate: 0,
            completionRate: 0,
            abandonmentRate: 0
          },
          commonSymptoms,
          escalationStats
        }, 'AI statistics retrieved successfully')
      );
    } catch (error) {
      logError('Get AI stats failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve AI statistics', 'INTERNAL_ERROR')
      );
    }
  }

  // Private helper methods

  private async getEscalationStats(): Promise<any> {
    try {
      const escalationReasons = await AIChatSession.aggregate([
        { $match: { status: 'escalated_to_doctor' } },
        { $group: { _id: '$escalationReason', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      const escalationsByRisk = await AIChatSession.aggregate([
        { $match: { status: 'escalated_to_doctor', 'finalAnalysis.riskLevel': { $exists: true } } },
        { $group: { _id: '$finalAnalysis.riskLevel', count: { $sum: 1 } } }
      ]);

      return {
        reasons: escalationReasons,
        byRiskLevel: escalationsByRisk
      };
    } catch (error) {
      logError('Get escalation stats failed:', error);
      return {
        reasons: [],
        byRiskLevel: []
      };
    }
  }
}

export default new AIController();