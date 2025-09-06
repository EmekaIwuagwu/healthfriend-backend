import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import aiController from '../controllers/aiController';
import { 
  authenticateToken, 
  optionalAuth,
  doctorOrPatient 
} from '../middleware/auth';
import { 
  validate
} from '../middleware/validation';
import { catchAsync } from '../middleware/errorHandler';
import { AI_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../utils/constants';
import Joi from 'joi';

const router = Router();

// Stricter rate limiting for AI endpoints due to computational cost
const aiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW, // 15 minutes
  max: AI_RATE_LIMIT_MAX || 30, // 30 AI requests per window
  message: {
    success: false,
    message: 'Too many AI requests, please try again later',
    error: 'AI_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return req.user?.id || req.ip;
  }
});

// Very strict rate limiting for symptom checking
const symptomCheckLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 symptom checks per hour
  message: {
    success: false,
    message: 'Symptom check limit exceeded, please try again later',
    error: 'SYMPTOM_CHECK_LIMIT_EXCEEDED'
  }
});

// Validation schemas
const chatSessionSchema = Joi.object({
  type: Joi.string()
    .valid('general_health', 'symptom_check', 'medication_info', 'lifestyle', 'mental_health')
    .required()
    .messages({
      'any.only': 'Session type must be one of: general_health, symptom_check, medication_info, lifestyle, mental_health',
      'any.required': 'Session type is required'
    }),
  initialMessage: Joi.string()
    .min(3)
    .max(1000)
    .optional()
    .messages({
      'string.min': 'Initial message must be at least 3 characters',
      'string.max': 'Initial message cannot exceed 1000 characters'
    })
});

const sendMessageSchema = Joi.object({
  message: Joi.string()
    .required()
    .min(1)
    .max(1000)
    .messages({
      'string.min': 'Message cannot be empty',
      'string.max': 'Message cannot exceed 1000 characters',
      'any.required': 'Message is required'
    }),
  attachments: Joi.array()
    .items(Joi.string())
    .max(5)
    .optional()
    .messages({
      'array.max': 'Cannot attach more than 5 files'
    })
});

const symptomCheckSchema = Joi.object({
  symptoms: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        severity: Joi.number().min(1).max(10).required(),
        duration: Joi.string().required(),
        location: Joi.string().optional()
      })
    )
    .min(1)
    .max(20)
    .required()
    .messages({
      'array.min': 'At least one symptom is required',
      'array.max': 'Cannot analyze more than 20 symptoms at once',
      'any.required': 'Symptoms are required'
    }),
  patientInfo: Joi.object({
    age: Joi.number().min(0).max(150).required(),
    gender: Joi.string().valid('male', 'female', 'other').required(),
    medicalHistory: Joi.array().items(Joi.string()).max(50).optional(),
    currentMedications: Joi.array().items(Joi.string()).max(50).optional(),
    allergies: Joi.array().items(Joi.string()).max(50).optional()
  }).required()
});

const healthAssessmentSchema = Joi.object({
  assessmentType: Joi.string()
    .valid('general', 'cardiovascular', 'diabetes', 'mental_health', 'nutrition')
    .required(),
  responses: Joi.object()
    .pattern(Joi.string(), Joi.alternatives().try(
      Joi.string(),
      Joi.number(),
      Joi.boolean(),
      Joi.array().items(Joi.string())
    ))
    .required()
    .messages({
      'object.pattern.match': 'Invalid response format'
    })
});

const medicationInfoSchema = Joi.object({
  medicationName: Joi.string()
    .required()
    .min(2)
    .max(100)
    .messages({
      'string.min': 'Medication name must be at least 2 characters',
      'string.max': 'Medication name cannot exceed 100 characters',
      'any.required': 'Medication name is required'
    }),
  dosage: Joi.string()
    .max(50)
    .optional(),
  queryType: Joi.string()
    .valid('side_effects', 'interactions', 'usage', 'alternatives', 'general_info')
    .required()
});

const lifestyleAnalysisSchema = Joi.object({
  data: Joi.object({
    diet: Joi.object({
      meals: Joi.array().items(Joi.string()).optional(),
      restrictions: Joi.array().items(Joi.string()).optional(),
      goals: Joi.array().items(Joi.string()).optional()
    }).optional(),
    exercise: Joi.object({
      frequency: Joi.string().optional(),
      type: Joi.array().items(Joi.string()).optional(),
      duration: Joi.string().optional()
    }).optional(),
    sleep: Joi.object({
      hoursPerNight: Joi.number().min(0).max(24).optional(),
      quality: Joi.string().valid('poor', 'fair', 'good', 'excellent').optional(),
      schedule: Joi.string().optional()
    }).optional(),
    stress: Joi.object({
      level: Joi.number().min(1).max(10).optional(),
      sources: Joi.array().items(Joi.string()).optional()
    }).optional()
  }).required()
});

/**
 * @route   POST /api/v1/ai/chat/start
 * @desc    Start new AI chat session
 * @access  Private
 */
router.post('/chat/start',
  aiLimiter,
  authenticateToken,
  validate(chatSessionSchema),
  catchAsync(aiController.startChatSession)
);

/**
 * @route   GET /api/v1/ai/chat/sessions
 * @desc    Get user's AI chat sessions
 * @access  Private
 */
router.get('/chat/sessions',
  authenticateToken,
  catchAsync(aiController.getChatSessions)
);

/**
 * @route   GET /api/v1/ai/chat/:sessionId
 * @desc    Get specific chat session
 * @access  Private
 */
router.get('/chat/:sessionId',
  authenticateToken,
  catchAsync(aiController.getChatSession)
);

/**
 * @route   POST /api/v1/ai/chat/:sessionId/message
 * @desc    Send message to AI chat
 * @access  Private
 */
router.post('/chat/:sessionId/message',
  aiLimiter,
  authenticateToken,
  validate(sendMessageSchema),
  catchAsync(aiController.sendMessage)
);

/**
 * @route   DELETE /api/v1/ai/chat/:sessionId
 * @desc    Delete chat session
 * @access  Private
 */
router.delete('/chat/:sessionId',
  authenticateToken,
  catchAsync(aiController.deleteChatSession)
);

/**
 * @route   POST /api/v1/ai/symptom-check
 * @desc    AI-powered symptom analysis
 * @access  Private
 */
router.post('/symptom-check',
  symptomCheckLimiter,
  aiLimiter,
  authenticateToken,
  validate(symptomCheckSchema),
  catchAsync(aiController.performSymptomCheck)
);

/**
 * @route   POST /api/v1/ai/health-assessment
 * @desc    Comprehensive AI health assessment
 * @access  Private
 */
router.post('/health-assessment',
  aiLimiter,
  authenticateToken,
  validate(healthAssessmentSchema),
  catchAsync(aiController.performHealthAssessment)
);

/**
 * @route   GET /api/v1/ai/health-assessment/templates
 * @desc    Get available health assessment templates
 * @access  Private
 */
router.get('/health-assessment/templates',
  authenticateToken,
  catchAsync(aiController.getAssessmentTemplates)
);

/**
 * @route   POST /api/v1/ai/medication-info
 * @desc    Get AI-powered medication information
 * @access  Private
 */
router.post('/medication-info',
  aiLimiter,
  authenticateToken,
  validate(medicationInfoSchema),
  catchAsync(aiController.getMedicationInfo)
);

/**
 * @route   POST /api/v1/ai/lifestyle-analysis
 * @desc    AI lifestyle and wellness analysis
 * @access  Private
 */
router.post('/lifestyle-analysis',
  aiLimiter,
  authenticateToken,
  validate(lifestyleAnalysisSchema),
  catchAsync(aiController.analyzeLifestyle)
);

/**
 * @route   GET /api/v1/ai/health-insights
 * @desc    Get personalized health insights
 * @access  Private
 */
router.get('/health-insights',
  authenticateToken,
  catchAsync(aiController.getHealthInsights)
);

/**
 * @route   POST /api/v1/ai/risk-assessment
 * @desc    AI-powered health risk assessment
 * @access  Private
 */
router.post('/risk-assessment',
  aiLimiter,
  authenticateToken,
  validate(Joi.object({
    factors: Joi.object({
      age: Joi.number().min(0).max(150).required(),
      gender: Joi.string().valid('male', 'female', 'other').required(),
      familyHistory: Joi.array().items(Joi.string()).optional(),
      lifestyle: Joi.object({
        smoking: Joi.boolean().optional(),
        alcohol: Joi.string().valid('none', 'light', 'moderate', 'heavy').optional(),
        exercise: Joi.string().valid('none', 'light', 'moderate', 'heavy').optional()
      }).optional(),
      vitals: Joi.object({
        bloodPressure: Joi.string().optional(),
        cholesterol: Joi.number().optional(),
        bloodSugar: Joi.number().optional(),
        bmi: Joi.number().optional()
      }).optional()
    }).required()
  })),
  catchAsync(aiController.performRiskAssessment)
);

/**
 * @route   POST /api/v1/ai/emergency-triage
 * @desc    AI emergency triage assessment
 * @access  Private
 */
router.post('/emergency-triage',
  authenticateToken,
  validate(Joi.object({
    symptoms: Joi.array().items(Joi.string()).min(1).required(),
    severity: Joi.string().valid('mild', 'moderate', 'severe', 'critical').required(),
    duration: Joi.string().required(),
    vitalSigns: Joi.object({
      consciousness: Joi.string().valid('alert', 'confused', 'unconscious').optional(),
      breathing: Joi.string().valid('normal', 'difficulty', 'stopped').optional(),
      pulse: Joi.string().valid('normal', 'weak', 'absent').optional()
    }).optional(),
    location: Joi.object({
      lat: Joi.number().optional(),
      lng: Joi.number().optional()
    }).optional()
  })),
  catchAsync(aiController.performEmergencyTriage)
);

/**
 * @route   GET /api/v1/ai/recommendations
 * @desc    Get AI health recommendations
 * @access  Private
 */
router.get('/recommendations',
  authenticateToken,
  catchAsync(aiController.getHealthRecommendations)
);

/**
 * @route   POST /api/v1/ai/drug-interaction-check
 * @desc    Check for drug interactions
 * @access  Private
 */
router.post('/drug-interaction-check',
  aiLimiter,
  authenticateToken,
  validate(Joi.object({
    medications: Joi.array()
      .items(Joi.string())
      .min(2)
      .max(20)
      .required()
      .messages({
        'array.min': 'At least 2 medications required for interaction check',
        'array.max': 'Cannot check more than 20 medications at once'
      }),
    newMedication: Joi.string().optional()
  })),
  catchAsync(aiController.checkDrugInteractions)
);

/**
 * @route   POST /api/v1/ai/mental-health-screening
 * @desc    AI mental health screening
 * @access  Private
 */
router.post('/mental-health-screening',
  aiLimiter,
  authenticateToken,
  validate(Joi.object({
    responses: Joi.object().required(),
    screeningType: Joi.string()
      .valid('depression', 'anxiety', 'stress', 'general')
      .required()
  })),
  catchAsync(aiController.performMentalHealthScreening)
);

/**
 * @route   GET /api/v1/ai/wellness-score
 * @desc    Get AI-calculated wellness score
 * @access  Private
 */
router.get('/wellness-score',
  authenticateToken,
  catchAsync(aiController.getWellnessScore)
);

/**
 * @route   POST /api/v1/ai/nutrition-analysis
 * @desc    AI nutrition and diet analysis
 * @access  Private
 */
router.post('/nutrition-analysis',
  aiLimiter,
  authenticateToken,
  validate(Joi.object({
    meals: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().required(),
          ingredients: Joi.array().items(Joi.string()).optional(),
          calories: Joi.number().optional(),
          time: Joi.string().optional()
        })
      )
      .required(),
    goals: Joi.array().items(Joi.string()).optional(),
    restrictions: Joi.array().items(Joi.string()).optional()
  })),
  catchAsync(aiController.analyzeNutrition)
);

/**
 * @route   GET /api/v1/ai/health-tips
 * @desc    Get personalized AI health tips
 * @access  Private
 */
router.get('/health-tips',
  authenticateToken,
  catchAsync(aiController.getPersonalizedHealthTips)
);

/**
 * @route   POST /api/v1/ai/image-analysis
 * @desc    AI medical image analysis (limited scope)
 * @access  Private (Doctor or Patient)
 */
router.post('/image-analysis',
  aiLimiter,
  authenticateToken,
  doctorOrPatient,
  validate(Joi.object({
    imageType: Joi.string()
      .valid('skin_condition', 'rash', 'general')
      .required(),
    imageUrl: Joi.string().uri().required(),
    symptoms: Joi.string().max(500).optional(),
    disclaimer: Joi.boolean().valid(true).required().messages({
      'any.only': 'Must acknowledge AI analysis disclaimer'
    })
  })),
  catchAsync(aiController.analyzeImage)
);

/**
 * @route   GET /api/v1/ai/analysis-history
 * @desc    Get user's AI analysis history
 * @access  Private
 */
router.get('/analysis-history',
  authenticateToken,
  catchAsync(aiController.getAnalysisHistory)
);

/**
 * @route   POST /api/v1/ai/feedback
 * @desc    Submit feedback on AI response
 * @access  Private
 */
router.post('/feedback',
  authenticateToken,
  validate(Joi.object({
    sessionId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    messageId: Joi.string().optional(),
    rating: Joi.number().min(1).max(5).required(),
    feedback: Joi.string().max(1000).optional(),
    type: Joi.string().valid('helpful', 'not_helpful', 'inaccurate', 'inappropriate').required()
  })),
  catchAsync(aiController.submitFeedback)
);

/**
 * @route   GET /api/v1/ai/capabilities
 * @desc    Get AI service capabilities and limitations
 * @access  Public
 */
router.get('/capabilities',
  optionalAuth,
  catchAsync(aiController.getCapabilities)
);

/**
 * @route   GET /api/v1/ai/health
 * @desc    AI service health check
 * @access  Public
 */
router.get('/health',
  catchAsync(async (req, res, next) => {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        chatbot: 'operational',
        symptomChecker: 'operational',
        healthAssessment: 'operational',
        imageAnalysis: 'operational',
        riskAssessment: 'operational'
      },
      limitations: [
        'AI analysis is not a substitute for professional medical advice',
        'Emergency situations require immediate medical attention',
        'Results should be discussed with healthcare providers'
      ]
    };

    res.status(200).json({
      success: true,
      message: 'AI service is healthy',
      data: healthStatus
    });
  })
);

export default router;