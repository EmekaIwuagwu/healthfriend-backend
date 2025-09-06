import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import patientController from '../controllers/patientController';
import { 
  authenticateToken, 
  patientOnly,
  selfOrAdmin,
  optionalAuth 
} from '../middleware/auth';
import { 
  validate,
  validateUserRegistration
} from '../middleware/validation';
import { upload } from '../middleware/upload';
import { catchAsync } from '../middleware/errorHandler';
import { DEFAULT_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../utils/constants';
import Joi from 'joi';

const router = Router();

// Rate limiting for patient endpoints
const patientLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW, // 15 minutes
  max: DEFAULT_RATE_LIMIT_MAX, // 100 requests per window
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    error: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation schemas
const medicalHistorySchema = Joi.object({
  condition: Joi.string()
    .required()
    .min(2)
    .max(200)
    .messages({
      'string.min': 'Condition must be at least 2 characters',
      'string.max': 'Condition cannot exceed 200 characters',
      'any.required': 'Condition is required'
    }),
  diagnosedDate: Joi.date()
    .max('now')
    .required()
    .messages({
      'date.max': 'Diagnosed date cannot be in the future',
      'any.required': 'Diagnosed date is required'
    }),
  notes: Joi.string()
    .max(1000)
    .optional()
    .messages({
      'string.max': 'Notes cannot exceed 1000 characters'
    })
});

const emergencyContactSchema = Joi.object({
  name: Joi.string()
    .required()
    .min(2)
    .max(100)
    .messages({
      'string.min': 'Name must be at least 2 characters',
      'string.max': 'Name cannot exceed 100 characters',
      'any.required': 'Emergency contact name is required'
    }),
  phone: Joi.string()
    .pattern(/^\+?[\d\s\-\(\)]{10,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid phone number format',
      'any.required': 'Emergency contact phone is required'
    }),
  relationship: Joi.string()
    .required()
    .min(2)
    .max(50)
    .messages({
      'string.min': 'Relationship must be at least 2 characters',
      'string.max': 'Relationship cannot exceed 50 characters',
      'any.required': 'Relationship is required'
    })
});

const healthInfoSchema = Joi.object({
  allergies: Joi.array()
    .items(Joi.string().max(100))
    .max(50)
    .optional()
    .messages({
      'array.max': 'Cannot have more than 50 allergies'
    }),
  currentMedications: Joi.array()
    .items(Joi.string().max(100))
    .max(50)
    .optional()
    .messages({
      'array.max': 'Cannot have more than 50 current medications'
    }),
  chronicConditions: Joi.array()
    .items(Joi.string().max(200))
    .max(20)
    .optional()
    .messages({
      'array.max': 'Cannot have more than 20 chronic conditions'
    })
});

const appointmentRequestSchema = Joi.object({
  doctorId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid doctor ID format',
      'any.required': 'Doctor ID is required'
    }),
  type: Joi.string()
    .valid('consultation', 'home_visit', 'emergency')
    .required()
    .messages({
      'any.only': 'Type must be consultation, home_visit, or emergency',
      'any.required': 'Appointment type is required'
    }),
  preferredDate: Joi.date()
    .min('now')
    .required()
    .messages({
      'date.min': 'Preferred date must be in the future',
      'any.required': 'Preferred date is required'
    }),
  preferredTime: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid time format (use HH:MM)',
      'any.required': 'Preferred time is required'
    }),
  symptoms: Joi.string()
    .min(10)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Symptoms description must be at least 10 characters',
      'string.max': 'Symptoms description cannot exceed 1000 characters',
      'any.required': 'Symptoms description is required'
    }),
  urgency: Joi.string()
    .valid('low', 'medium', 'high', 'emergency')
    .default('medium')
    .messages({
      'any.only': 'Urgency must be low, medium, high, or emergency'
    })
});

/**
 * @route   GET /api/v1/patients/profile
 * @desc    Get patient profile
 * @access  Private (Patient)
 */
router.get('/profile',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getProfile)
);

/**
 * @route   PUT /api/v1/patients/profile
 * @desc    Update patient profile
 * @access  Private (Patient)
 */
router.put('/profile',
  patientLimiter,
  authenticateToken,
  patientOnly,
  catchAsync(patientController.updateProfile)
);

/**
 * @route   GET /api/v1/patients/medical-history
 * @desc    Get patient medical history
 * @access  Private (Patient)
 */
router.get('/medical-history',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getMedicalHistory)
);

/**
 * @route   POST /api/v1/patients/medical-history
 * @desc    Add medical history entry
 * @access  Private (Patient)
 */
router.post('/medical-history',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(medicalHistorySchema),
  catchAsync(patientController.addMedicalHistory)
);

/**
 * @route   PUT /api/v1/patients/medical-history/:id
 * @desc    Update medical history entry
 * @access  Private (Patient)
 */
router.put('/medical-history/:id',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(medicalHistorySchema),
  catchAsync(patientController.updateMedicalHistory)
);

/**
 * @route   DELETE /api/v1/patients/medical-history/:id
 * @desc    Delete medical history entry
 * @access  Private (Patient)
 */
router.delete('/medical-history/:id',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.deleteMedicalHistory)
);

/**
 * @route   GET /api/v1/patients/appointments
 * @desc    Get patient appointments
 * @access  Private (Patient)
 */
router.get('/appointments',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getAppointments)
);

/**
 * @route   POST /api/v1/patients/appointments/request
 * @desc    Request new appointment
 * @access  Private (Patient)
 */
router.post('/appointments/request',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(appointmentRequestSchema),
  catchAsync(patientController.requestAppointment)
);

/**
 * @route   PUT /api/v1/patients/appointments/:id/cancel
 * @desc    Cancel appointment
 * @access  Private (Patient)
 */
router.put('/appointments/:id/cancel',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.cancelAppointment)
);

/**
 * @route   PUT /api/v1/patients/appointments/:id/reschedule
 * @desc    Reschedule appointment
 * @access  Private (Patient)
 */
router.put('/appointments/:id/reschedule',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(Joi.object({
    newDate: Joi.date().min('now').required(),
    newTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    reason: Joi.string().max(500).optional()
  })),
  catchAsync(patientController.rescheduleAppointment)
);

/**
 * @route   GET /api/v1/patients/consultations
 * @desc    Get patient consultations
 * @access  Private (Patient)
 */
router.get('/consultations',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getConsultations)
);

/**
 * @route   GET /api/v1/patients/consultations/:id
 * @desc    Get specific consultation
 * @access  Private (Patient)
 */
router.get('/consultations/:id',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getConsultation)
);

/**
 * @route   PUT /api/v1/patients/emergency-contact
 * @desc    Update emergency contact
 * @access  Private (Patient)
 */
router.put('/emergency-contact',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(emergencyContactSchema),
  catchAsync(patientController.updateEmergencyContact)
);

/**
 * @route   PUT /api/v1/patients/health-info
 * @desc    Update health information (allergies, medications, etc.)
 * @access  Private (Patient)
 */
router.put('/health-info',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(healthInfoSchema),
  catchAsync(patientController.updateHealthInfo)
);

/**
 * @route   POST /api/v1/patients/documents/upload
 * @desc    Upload patient documents
 * @access  Private (Patient)
 */
router.post('/documents/upload',
  patientLimiter,
  authenticateToken,
  patientOnly,
  upload.array('documents', 5), // Max 5 files
  catchAsync(patientController.uploadDocuments)
);

/**
 * @route   GET /api/v1/patients/documents
 * @desc    Get patient documents
 * @access  Private (Patient)
 */
router.get('/documents',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getDocuments)
);

/**
 * @route   DELETE /api/v1/patients/documents/:id
 * @desc    Delete patient document
 * @access  Private (Patient)
 */
router.delete('/documents/:id',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.deleteDocument)
);

/**
 * @route   GET /api/v1/patients/search-doctors
 * @desc    Search for available doctors
 * @access  Private (Patient)
 */
router.get('/search-doctors',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.searchDoctors)
);

/**
 * @route   GET /api/v1/patients/doctors/:id
 * @desc    Get doctor details
 * @access  Private (Patient)
 */
router.get('/doctors/:id',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getDoctorDetails)
);

/**
 * @route   POST /api/v1/patients/doctors/:id/review
 * @desc    Submit doctor review
 * @access  Private (Patient)
 */
router.post('/doctors/:id/review',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    comment: Joi.string().min(10).max(1000).required(),
    consultationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
  })),
  catchAsync(patientController.submitDoctorReview)
);

/**
 * @route   GET /api/v1/patients/dashboard
 * @desc    Get patient dashboard data
 * @access  Private (Patient)
 */
router.get('/dashboard',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getDashboard)
);

/**
 * @route   GET /api/v1/patients/health-summary
 * @desc    Get patient health summary
 * @access  Private (Patient)
 */
router.get('/health-summary',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getHealthSummary)
);

/**
 * @route   POST /api/v1/patients/ai-consultation
 * @desc    Start AI consultation session
 * @access  Private (Patient)
 */
router.post('/ai-consultation',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(Joi.object({
    symptoms: Joi.string().min(10).max(1000).required(),
    urgency: Joi.string().valid('low', 'medium', 'high').default('medium')
  })),
  catchAsync(patientController.startAIConsultation)
);

/**
 * @route   GET /api/v1/patients/notifications
 * @desc    Get patient notifications
 * @access  Private (Patient)
 */
router.get('/notifications',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getNotifications)
);

/**
 * @route   PUT /api/v1/patients/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private (Patient)
 */
router.put('/notifications/:id/read',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.markNotificationRead)
);

/**
 * @route   GET /api/v1/patients/insurance
 * @desc    Get patient insurance information
 * @access  Private (Patient)
 */
router.get('/insurance',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getInsuranceInfo)
);

/**
 * @route   PUT /api/v1/patients/insurance
 * @desc    Update patient insurance information
 * @access  Private (Patient)
 */
router.put('/insurance',
  patientLimiter,
  authenticateToken,
  patientOnly,
  validate(Joi.object({
    provider: Joi.string().max(100).required(),
    policyNumber: Joi.string().max(50).required(),
    groupNumber: Joi.string().max(50).optional(),
    effectiveDate: Joi.date().required(),
    expirationDate: Joi.date().min(Joi.ref('effectiveDate')).optional()
  })),
  catchAsync(patientController.updateInsuranceInfo)
);

/**
 * @route   GET /api/v1/patients/prescriptions
 * @desc    Get patient prescriptions
 * @access  Private (Patient)
 */
router.get('/prescriptions',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getPrescriptions)
);

/**
 * @route   GET /api/v1/patients/lab-results
 * @desc    Get patient lab results
 * @access  Private (Patient)
 */
router.get('/lab-results',
  authenticateToken,
  patientOnly,
  catchAsync(patientController.getLabResults)
);

/**
 * @route   POST /api/v1/patients/emergency
 * @desc    Create emergency request
 * @access  Private (Patient)
 */
router.post('/emergency',
  authenticateToken,
  patientOnly,
  validate(Joi.object({
    type: Joi.string().valid('medical', 'mental_health', 'accident').required(),
    description: Joi.string().min(10).max(500).required(),
    location: Joi.object({
      lat: Joi.number().min(-90).max(90).required(),
      lng: Joi.number().min(-180).max(180).required(),
      address: Joi.string().max(200).optional()
    }).required(),
    severity: Joi.string().valid('low', 'medium', 'high', 'critical').required()
  })),
  catchAsync(patientController.createEmergencyRequest)
);

/**
 * @route   GET /api/v1/patients/health
 * @desc    Patient service health check
 * @access  Public
 */
router.get('/health',
  catchAsync(async (req, res, next) => {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        authentication: 'operational',
        appointments: 'operational',
        consultations: 'operational',
        documents: 'operational'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Patient service is healthy',
      data: healthStatus
    });
  })
);

export default router;