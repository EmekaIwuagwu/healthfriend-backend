import { Router } from 'express';
import doctorController from '../controllers/doctorController';
import { 
  authenticateToken, 
  adminOnly,
  doctorOnly,
  verifiedDoctorOnly,
  optionalAuth
} from '../middleware/auth';
import { 
  validateDoctorAvailability,
  validatePagination,
  validateSearchQuery,
  validateObjectId,
  validate
} from '../middleware/validation';
import { 
  verificationDocsUpload,
  handleUploadError,
  validateFileUpload
} from '../middleware/upload';
import { catchAsync } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas for specific endpoints
const availabilityUpdateSchema = Joi.object({
  availability: Joi.array()
    .items(Joi.object({
      day: Joi.string()
        .valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
        .required(),
      startTime: Joi.string()
        .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          'string.pattern.base': 'Start time must be in HH:MM format'
        }),
      endTime: Joi.string()
        .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          'string.pattern.base': 'End time must be in HH:MM format'
        })
    }))
    .optional(),
  isAvailable: Joi.boolean()
    .optional()
});

const verificationStatusSchema = Joi.object({
  isVerified: Joi.boolean()
    .required()
    .messages({
      'any.required': 'Verification status is required'
    }),
  reason: Joi.string()
    .when('isVerified', {
      is: false,
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .max(500)
    .messages({
      'any.required': 'Reason is required when rejecting verification',
      'string.max': 'Reason cannot exceed 500 characters'
    })
});

const doctorSearchSchema = Joi.object({
  specialization: Joi.string().optional(),
  location: Joi.string().optional(),
  availability: Joi.string().valid('true', 'false').optional(),
  minRating: Joi.number().min(1).max(5).optional(),
  maxFee: Joi.number().positive().optional(),
  language: Joi.string().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional()
});

const availabilityQuerySchema = Joi.object({
  date: Joi.date()
    .min('now')
    .required()
    .messages({
      'date.min': 'Date must be today or in the future',
      'any.required': 'Date is required'
    })
});

/**
 * @route   GET /api/v1/doctors
 * @desc    Search doctors with filters
 * @access  Public
 */
router.get('/',
  optionalAuth,
  validate(doctorSearchSchema, 'query'),
  catchAsync(doctorController.searchDoctors)
);

/**
 * @route   GET /api/v1/doctors/:id
 * @desc    Get doctor profile by ID
 * @access  Public
 */
router.get('/:id',
  optionalAuth,
  validateObjectId(),
  catchAsync(doctorController.getDoctorById)
);

/**
 * @route   GET /api/v1/doctors/:id/availability
 * @desc    Get doctor availability for specific date
 * @access  Public
 */
router.get('/:id/availability',
  optionalAuth,
  validateObjectId(),
  validate(availabilityQuerySchema, 'query'),
  catchAsync(doctorController.getDoctorAvailability)
);

/**
 * @route   GET /api/v1/doctors/:id/reviews
 * @desc    Get doctor reviews and ratings
 * @access  Public
 */
router.get('/:id/reviews',
  optionalAuth,
  validateObjectId(),
  validatePagination,
  catchAsync(doctorController.getDoctorReviews)
);

/**
 * @route   PUT /api/v1/doctors/availability
 * @desc    Update doctor availability
 * @access  Private (Doctor)
 */
router.put('/availability',
  authenticateToken,
  doctorOnly,
  validateDoctorAvailability,
  validate(availabilityUpdateSchema),
  catchAsync(doctorController.updateAvailability)
);

/**
 * @route   GET /api/v1/doctors/dashboard/overview
 * @desc    Get doctor dashboard data
 * @access  Private (Doctor)
 */
router.get('/dashboard/overview',
  authenticateToken,
  doctorOnly,
  catchAsync(doctorController.getDoctorDashboard)
);

/**
 * @route   GET /api/v1/doctors/earnings/summary
 * @desc    Get doctor earnings summary
 * @access  Private (Doctor)
 */
router.get('/earnings/summary',
  authenticateToken,
  doctorOnly,
  catchAsync(doctorController.getDoctorEarnings)
);

/**
 * @route   POST /api/v1/doctors/verification/submit
 * @desc    Submit doctor verification documents
 * @access  Private (Doctor)
 */
router.post('/verification/submit',
  authenticateToken,
  doctorOnly,
  verificationDocsUpload,
  handleUploadError,
  validateFileUpload,
  catchAsync(doctorController.submitVerification)
);

/**
 * @route   PUT /api/v1/doctors/:id/verification
 * @desc    Update doctor verification status (Admin only)
 * @access  Private (Admin)
 */
router.put('/:id/verification',
  authenticateToken,
  adminOnly,
  validateObjectId(),
  validate(verificationStatusSchema),
  catchAsync(doctorController.updateVerificationStatus)
);

/**
 * @route   GET /api/v1/doctors/verification/pending
 * @desc    Get pending verification requests (Admin only)
 * @access  Private (Admin)
 */
router.get('/verification/pending',
  authenticateToken,
  adminOnly,
  validatePagination,
  catchAsync(async (req, res, next) => {
    // This would get all doctors with pending verification
    res.status(501).json({
      success: false,
      message: 'Pending verification list feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/specializations
 * @desc    Get all available specializations
 * @access  Public
 */
router.get('/specializations',
  catchAsync(async (req, res, next) => {
    // This would return list of all medical specializations
    const specializations = [
      'General Practice',
      'Internal Medicine',
      'Pediatrics',
      'Cardiology',
      'Dermatology',
      'Neurology',
      'Orthopedics',
      'Psychiatry',
      'Radiology',
      'Emergency Medicine',
      'Family Medicine',
      'Obstetrics and Gynecology',
      'Oncology',
      'Ophthalmology',
      'Otolaryngology',
      'Urology',
      'Anesthesiology',
      'Pathology',
      'Surgery',
      'Endocrinology'
    ];

    res.status(200).json({
      success: true,
      message: 'Specializations retrieved successfully',
      data: specializations
    });
  })
);

/**
 * @route   GET /api/v1/doctors/schedule/conflicts
 * @desc    Check for schedule conflicts
 * @access  Private (Doctor)
 */
router.get('/schedule/conflicts',
  authenticateToken,
  doctorOnly,
  validate(Joi.object({
    startTime: Joi.date().required(),
    endTime: Joi.date().greater(Joi.ref('startTime')).required(),
    excludeAppointmentId: Joi.string().optional()
  }), 'query'),
  catchAsync(async (req, res, next) => {
    // This would check for scheduling conflicts
    res.status(501).json({
      success: false,
      message: 'Schedule conflict checking feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/doctors/schedule/block
 * @desc    Block time slots (unavailable periods)
 * @access  Private (Doctor)
 */
router.post('/schedule/block',
  authenticateToken,
  doctorOnly,
  validate(Joi.object({
    startDateTime: Joi.date().min('now').required(),
    endDateTime: Joi.date().greater(Joi.ref('startDateTime')).required(),
    reason: Joi.string().max(200).optional(),
    recurring: Joi.boolean().default(false),
    recurringPattern: Joi.string()
      .valid('daily', 'weekly', 'monthly')
      .when('recurring', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
      })
  })),
  catchAsync(async (req, res, next) => {
    // This would block time slots for the doctor
    res.status(501).json({
      success: false,
      message: 'Schedule blocking feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/schedule/blocked
 * @desc    Get blocked time slots
 * @access  Private (Doctor)
 */
router.get('/schedule/blocked',
  authenticateToken,
  doctorOnly,
  validatePagination,
  catchAsync(async (req, res, next) => {
    // This would get doctor's blocked time slots
    res.status(501).json({
      success: false,
      message: 'Get blocked schedule feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   DELETE /api/v1/doctors/schedule/blocked/:blockId
 * @desc    Remove blocked time slot
 * @access  Private (Doctor)
 */
router.delete('/schedule/blocked/:blockId',
  authenticateToken,
  doctorOnly,
  validateObjectId('blockId'),
  catchAsync(async (req, res, next) => {
    // This would remove a blocked time slot
    res.status(501).json({
      success: false,
      message: 'Remove blocked schedule feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/analytics/performance
 * @desc    Get doctor performance analytics
 * @access  Private (Doctor)
 */
router.get('/analytics/performance',
  authenticateToken,
  doctorOnly,
  validate(Joi.object({
    period: Joi.string().valid('week', 'month', 'quarter', 'year').default('month'),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional()
  }), 'query'),
  catchAsync(async (req, res, next) => {
    // This would provide doctor performance metrics
    res.status(501).json({
      success: false,
      message: 'Doctor analytics feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/patients/list
 * @desc    Get doctor's patient list
 * @access  Private (Doctor)
 */
router.get('/patients/list',
  authenticateToken,
  verifiedDoctorOnly,
  validatePagination,
  catchAsync(async (req, res, next) => {
    // This would get doctor's patients
    res.status(501).json({
      success: false,
      message: 'Doctor patient list feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/patients/:patientId/history
 * @desc    Get patient medical history (for doctor)
 * @access  Private (Doctor)
 */
router.get('/patients/:patientId/history',
  authenticateToken,
  verifiedDoctorOnly,
  validateObjectId('patientId'),
  catchAsync(async (req, res, next) => {
    // This would get patient's medical history for doctor review
    res.status(501).json({
      success: false,
      message: 'Patient medical history for doctors feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/doctors/notes/template
 * @desc    Create consultation note template
 * @access  Private (Doctor)
 */
router.post('/notes/template',
  authenticateToken,
  doctorOnly,
  validate(Joi.object({
    name: Joi.string().min(3).max(100).required(),
    template: Joi.string().min(10).max(2000).required(),
    category: Joi.string().max(50).optional(),
    isDefault: Joi.boolean().default(false)
  })),
  catchAsync(async (req, res, next) => {
    // This would create note templates for doctors
    res.status(501).json({
      success: false,
      message: 'Note templates feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/notes/templates
 * @desc    Get doctor's note templates
 * @access  Private (Doctor)
 */
router.get('/notes/templates',
  authenticateToken,
  doctorOnly,
  catchAsync(async (req, res, next) => {
    // This would get doctor's note templates
    res.status(501).json({
      success: false,
      message: 'Get note templates feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/doctors/referral
 * @desc    Create patient referral
 * @access  Private (Doctor)
 */
router.post('/referral',
  authenticateToken,
  verifiedDoctorOnly,
  validate(Joi.object({
    patientId: Joi.string().required(),
    referralToSpecialization: Joi.string().required(),
    reason: Joi.string().min(10).max(500).required(),
    urgency: Joi.string().valid('routine', 'urgent', 'emergency').default('routine'),
    notes: Joi.string().max(1000).optional(),
    preferredDoctorId: Joi.string().optional()
  })),
  catchAsync(async (req, res, next) => {
    // This would handle patient referrals
    res.status(501).json({
      success: false,
      message: 'Patient referral feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/referrals/sent
 * @desc    Get sent referrals
 * @access  Private (Doctor)
 */
router.get('/referrals/sent',
  authenticateToken,
  verifiedDoctorOnly,
  validatePagination,
  catchAsync(async (req, res, next) => {
    // This would get referrals sent by the doctor
    res.status(501).json({
      success: false,
      message: 'Sent referrals feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/referrals/received
 * @desc    Get received referrals
 * @access  Private (Doctor)
 */
router.get('/referrals/received',
  authenticateToken,
  verifiedDoctorOnly,
  validatePagination,
  catchAsync(async (req, res, next) => {
    // This would get referrals received by the doctor
    res.status(501).json({
      success: false,
      message: 'Received referrals feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/export/schedule
 * @desc    Export doctor schedule
 * @access  Private (Doctor)
 */
router.get('/export/schedule',
  authenticateToken,
  doctorOnly,
  validate(Joi.object({
    format: Joi.string().valid('ical', 'csv', 'pdf').default('ical'),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional()
  }), 'query'),
  catchAsync(async (req, res, next) => {
    // This would export doctor's schedule
    res.status(501).json({
      success: false,
      message: 'Schedule export feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/doctors/health
 * @desc    Doctor service health check
 * @access  Public
 */
router.get('/health',
  catchAsync(async (req, res, next) => {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        doctorManagement: 'operational',
        availabilityService: 'operational',
        verificationService: 'operational',
        earningsService: 'operational',
        reviewsService: 'operational'
      },
      endpoints: {
        '/': 'operational',
        '/:id': 'operational',
        '/:id/availability': 'operational',
        '/:id/reviews': 'operational',
        '/availability': 'operational'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Doctor service is healthy',
      data: healthStatus
    });
  })
);

export default router;