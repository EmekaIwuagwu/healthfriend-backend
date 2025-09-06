import { Router } from 'express';
import consultationController from '../controllers/consultationController';
import { 
  authenticateToken, 
  adminOnly,
  doctorOnly,
  doctorOrPatient,
  verifiedDoctorOnly,
  requireResourceOwnership
} from '../middleware/auth';
import { 
  validateConsultationRequest,
  validateConsultationUpdate,
  validateRating,
  validatePagination,
  validateListQuery,
  validateObjectId,
  validate
} from '../middleware/validation';
import { 
  medicalDocsUpload,
  handleUploadError,
  validateFileUpload
} from '../middleware/upload';
import { catchAsync } from '../middleware/errorHandler';
import Consultation from '../models/Consultation';
import Joi from 'joi';

const router = Router();

// Validation schemas for specific endpoints
const consultationCancelSchema = Joi.object({
  reason: Joi.string()
    .min(10)
    .max(500)
    .required()
    .messages({
      'string.min': 'Cancellation reason must be at least 10 characters',
      'string.max': 'Cancellation reason cannot exceed 500 characters',
      'any.required': 'Cancellation reason is required'
    })
});

const consultationCompleteSchema = Joi.object({
  doctorNotes: Joi.string()
    .max(2000)
    .optional()
    .messages({
      'string.max': 'Doctor notes cannot exceed 2000 characters'
    }),
  prescription: Joi.array()
    .items(Joi.object({
      medication: Joi.string().required(),
      dosage: Joi.string().required(),
      frequency: Joi.string().required(),
      duration: Joi.string().required(),
      instructions: Joi.string().required(),
      startDate: Joi.date().default(Date.now),
      endDate: Joi.date().optional(),
      refillsRemaining: Joi.number().integer().min(0).default(0)
    }))
    .optional(),
  diagnosis: Joi.string()
    .max(500)
    .optional(),
  followUpRequired: Joi.boolean()
    .default(false),
  followUpDate: Joi.date()
    .min('now')
    .when('followUpRequired', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .messages({
      'date.min': 'Follow-up date must be in the future'
    })
});

const escalationSchema = Joi.object({
  reason: Joi.string()
    .min(10)
    .max(500)
    .required(),
  doctorId: Joi.string()
    .optional(),
  urgency: Joi.string()
    .valid('routine', 'urgent', 'emergency')
    .default('routine'),
  scheduledDateTime: Joi.date()
    .min('now')
    .optional()
});

/**
 * @route   POST /api/v1/consultations
 * @desc    Create a new consultation
 * @access  Private
 */
router.post('/',
  authenticateToken,
  validateConsultationRequest,
  catchAsync(consultationController.createConsultation)
);

/**
 * @route   GET /api/v1/consultations
 * @desc    Get user's consultations (filtered by role)
 * @access  Private
 */
router.get('/',
  authenticateToken,
  validateListQuery,
  catchAsync(consultationController.getUserConsultations)
);

/**
 * @route   GET /api/v1/consultations/upcoming
 * @desc    Get upcoming consultations
 * @access  Private
 */
router.get('/upcoming',
  authenticateToken,
  catchAsync(consultationController.getUpcomingConsultations)
);

/**
 * @route   GET /api/v1/consultations/stats
 * @desc    Get consultation statistics
 * @access  Private (Doctor/Admin)
 */
router.get('/stats',
  authenticateToken,
  catchAsync(consultationController.getConsultationStats)
);

/**
 * @route   GET /api/v1/consultations/:id
 * @desc    Get consultation by ID
 * @access  Private (Participant or Admin)
 */
router.get('/:id',
  authenticateToken,
  validateObjectId(),
  catchAsync(consultationController.getConsultationById)
);

/**
 * @route   PUT /api/v1/consultations/:id
 * @desc    Update consultation (doctors only)
 * @access  Private (Doctor/Admin)
 */
router.put('/:id',
  authenticateToken,
  validateObjectId(),
  validateConsultationUpdate,
  catchAsync(consultationController.updateConsultation)
);

/**
 * @route   POST /api/v1/consultations/:id/rate
 * @desc    Rate a consultation (patients only)
 * @access  Private (Patient)
 */
router.post('/:id/rate',
  authenticateToken,
  validateObjectId(),
  validateRating,
  catchAsync(consultationController.rateConsultation)
);

/**
 * @route   POST /api/v1/consultations/:id/cancel
 * @desc    Cancel a consultation
 * @access  Private (Participant or Admin)
 */
router.post('/:id/cancel',
  authenticateToken,
  validateObjectId(),
  validate(consultationCancelSchema),
  catchAsync(consultationController.cancelConsultation)
);

/**
 * @route   POST /api/v1/consultations/:id/complete
 * @desc    Complete a consultation (doctors only)
 * @access  Private (Doctor/Admin)
 */
router.post('/:id/complete',
  authenticateToken,
  validateObjectId(),
  validate(consultationCompleteSchema),
  catchAsync(consultationController.completeConsultation)
);

/**
 * @route   POST /api/v1/consultations/:id/start
 * @desc    Start a consultation
 * @access  Private (Doctor/Patient)
 */
router.post('/:id/start',
  authenticateToken,
  validateObjectId(),
  catchAsync(async (req, res, next) => {
    // This would mark consultation as started/in-progress
    res.status(501).json({
      success: false,
      message: 'Start consultation feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/consultations/:id/join
 * @desc    Join a consultation (for video calls)
 * @access  Private (Doctor/Patient)
 */
router.post('/:id/join',
  authenticateToken,
  validateObjectId(),
  doctorOrPatient,
  catchAsync(async (req, res, next) => {
    // This would handle joining video consultations
    res.status(501).json({
      success: false,
      message: 'Join consultation feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/consultations/:id/leave
 * @desc    Leave a consultation
 * @access  Private (Doctor/Patient)
 */
router.post('/:id/leave',
  authenticateToken,
  validateObjectId(),
  doctorOrPatient,
  catchAsync(async (req, res, next) => {
    // This would handle leaving video consultations
    res.status(501).json({
      success: false,
      message: 'Leave consultation feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/consultations/:id/escalate
 * @desc    Escalate AI consultation to doctor
 * @access  Private (Patient)
 */
router.post('/:id/escalate',
  authenticateToken,
  validateObjectId(),
  validate(escalationSchema),
  catchAsync(async (req, res, next) => {
    // This would be handled by the AI controller's escalateToDoctor method
    res.status(501).json({
      success: false,
      message: 'Consultation escalation should use AI routes',
      error: 'USE_AI_ROUTES'
    });
  })
);

/**
 * @route   POST /api/v1/consultations/:id/reschedule
 * @desc    Reschedule a consultation
 * @access  Private (Participant or Admin)
 */
router.post('/:id/reschedule',
  authenticateToken,
  validateObjectId(),
  validate(Joi.object({
    newDateTime: Joi.date()
      .min('now')
      .required()
      .messages({
        'date.min': 'New date time must be in the future',
        'any.required': 'New date time is required'
      }),
    reason: Joi.string()
      .min(5)
      .max(500)
      .required()
      .messages({
        'string.min': 'Reason must be at least 5 characters',
        'string.max': 'Reason cannot exceed 500 characters',
        'any.required': 'Reason for rescheduling is required'
      })
  })),
  catchAsync(async (req, res, next) => {
    // This would handle consultation rescheduling
    res.status(501).json({
      success: false,
      message: 'Consultation rescheduling feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/consultations/:id/documents
 * @desc    Upload consultation documents
 * @access  Private (Participant)
 */
router.post('/:id/documents',
  authenticateToken,
  validateObjectId(),
  medicalDocsUpload,
  handleUploadError,
  validateFileUpload,
  catchAsync(async (req, res, next) => {
    // This would handle document uploads for consultations
    res.status(501).json({
      success: false,
      message: 'Consultation document upload feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/consultations/:id/documents
 * @desc    Get consultation documents
 * @access  Private (Participant or Admin)
 */
router.get('/:id/documents',
  authenticateToken,
  validateObjectId(),
  catchAsync(async (req, res, next) => {
    // This would retrieve consultation documents
    res.status(501).json({
      success: false,
      message: 'Get consultation documents feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   DELETE /api/v1/consultations/:id/documents/:documentId
 * @desc    Delete consultation document
 * @access  Private (Owner or Admin)
 */
router.delete('/:id/documents/:documentId',
  authenticateToken,
  validateObjectId(),
  validateObjectId('documentId'),
  catchAsync(async (req, res, next) => {
    // This would handle document deletion
    res.status(501).json({
      success: false,
      message: 'Delete consultation document feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/consultations/:id/prescription
 * @desc    Get consultation prescription
 * @access  Private (Participant or Admin)
 */
router.get('/:id/prescription',
  authenticateToken,
  validateObjectId(),
  catchAsync(async (req, res, next) => {
    // This would retrieve consultation prescription
    res.status(501).json({
      success: false,
      message: 'Get prescription feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   PUT /api/v1/consultations/:id/prescription
 * @desc    Update consultation prescription (doctors only)
 * @access  Private (Doctor)
 */
router.put('/:id/prescription',
  authenticateToken,
  validateObjectId(),
  verifiedDoctorOnly,
  validate(Joi.object({
    prescription: Joi.array()
      .items(Joi.object({
        medication: Joi.string().required(),
        dosage: Joi.string().required(),
        frequency: Joi.string().required(),
        duration: Joi.string().required(),
        instructions: Joi.string().required(),
        refillsRemaining: Joi.number().integer().min(0).default(0)
      }))
      .min(1)
      .required()
  })),
  catchAsync(async (req, res, next) => {
    // This would handle prescription updates
    res.status(501).json({
      success: false,
      message: 'Update prescription feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/consultations/:id/history
 * @desc    Get consultation history/timeline
 * @access  Private (Participant or Admin)
 */
router.get('/:id/history',
  authenticateToken,
  validateObjectId(),
  catchAsync(async (req, res, next) => {
    // This would show consultation activity timeline
    res.status(501).json({
      success: false,
      message: 'Consultation history feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/consultations/:id/follow-up
 * @desc    Schedule follow-up consultation
 * @access  Private (Doctor)
 */
router.post('/:id/follow-up',
  authenticateToken,
  validateObjectId(),
  verifiedDoctorOnly,
  validate(Joi.object({
    scheduledDateTime: Joi.date()
      .min('now')
      .required(),
    type: Joi.string()
      .valid('video_call', 'home_visit')
      .required(),
    notes: Joi.string()
      .max(500)
      .optional(),
    duration: Joi.number()
      .integer()
      .min(15)
      .max(180)
      .default(30)
  })),
  catchAsync(async (req, res, next) => {
    // This would schedule follow-up consultations
    res.status(501).json({
      success: false,
      message: 'Follow-up scheduling feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/consultations/export/report
 * @desc    Export consultation report
 * @access  Private (Admin)
 */
router.get('/export/report',
  authenticateToken,
  adminOnly,
  validate(Joi.object({
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional(),
    doctorId: Joi.string().optional(),
    type: Joi.string().valid('ai_chat', 'video_call', 'home_visit').optional(),
    format: Joi.string().valid('csv', 'pdf', 'excel').default('csv')
  }), 'query'),
  catchAsync(async (req, res, next) => {
    // This would generate consultation reports
    res.status(501).json({
      success: false,
      message: 'Consultation report export feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/consultations/analytics/dashboard
 * @desc    Get consultation analytics dashboard data
 * @access  Private (Doctor/Admin)
 */
router.get('/analytics/dashboard',
  authenticateToken,
  catchAsync(async (req, res, next) => {
    // This would provide analytics dashboard data
    res.status(501).json({
      success: false,
      message: 'Consultation analytics feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/consultations/health
 * @desc    Consultation service health check
 * @access  Public
 */
router.get('/health',
  catchAsync(async (req, res, next) => {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        consultationManagement: 'operational',
        videoCallService: 'operational',
        homeVisitService: 'operational',
        prescriptionService: 'operational',
        documentManagement: 'operational'
      },
      endpoints: {
        '/': 'operational',
        '/:id': 'operational',
        '/:id/rate': 'operational',
        '/:id/complete': 'operational'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Consultation service is healthy',
      data: healthStatus
    });
  })
);

export default router;