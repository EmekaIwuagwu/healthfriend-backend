import { Router } from 'express';
import multer from 'multer';
import userController from '../controllers/userController';
import { 
  authenticateToken, 
  adminOnly,
  selfOrAdmin,
  doctorOnly,
  authorizeRoles
} from '../middleware/auth';
import { 
  validateUserUpdate,
  validateDoctorProfile,
  validatePagination,
  validateSearchQuery,
  validateObjectId,
  validate
} from '../middleware/validation';
import { 
  avatarUpload,
  medicalDocsUpload,
  handleUploadError,
  validateFileUpload,
  processImage
} from '../middleware/upload';
import { catchAsync } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas for specific endpoints
const medicalHistorySchema = Joi.object({
  condition: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .required()
    .messages({
      'string.min': 'Condition must be at least 2 characters',
      'string.max': 'Condition cannot exceed 200 characters',
      'any.required': 'Medical condition is required'
    }),
  diagnosedDate: Joi.date()
    .max('now')
    .required()
    .messages({
      'date.max': 'Diagnosed date cannot be in the future',
      'any.required': 'Diagnosed date is required'
    }),
  notes: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .messages({
      'string.max': 'Notes cannot exceed 1000 characters'
    })
});

const userStatusSchema = Joi.object({
  isActive: Joi.boolean()
    .required()
    .messages({
      'any.required': 'Active status is required'
    })
});

const notificationPreferencesSchema = Joi.object({
  preferences: Joi.object({
    email: Joi.boolean().default(true),
    sms: Joi.boolean().default(false),
    push: Joi.boolean().default(true),
    inApp: Joi.boolean().default(true),
    appointmentReminders: Joi.boolean().default(true),
    consultationUpdates: Joi.boolean().default(true),
    paymentNotifications: Joi.boolean().default(true),
    promotionalEmails: Joi.boolean().default(false),
    securityAlerts: Joi.boolean().default(true)
  }).required()
});

/**
 * @route   GET /api/v1/users/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile',
  authenticateToken,
  catchAsync(userController.getProfile)
);

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/profile',
  authenticateToken,
  validateUserUpdate,
  catchAsync(userController.updateProfile)
);

/**
 * @route   PUT /api/v1/users/doctor-profile
 * @desc    Update doctor profile (doctors only)
 * @access  Private (Doctor)
 */
router.put('/doctor-profile',
  authenticateToken,
  doctorOnly,
  validateDoctorProfile,
  catchAsync(userController.updateDoctorProfile)
);

/**
 * @route   POST /api/v1/users/medical-history
 * @desc    Add medical history entry
 * @access  Private
 */
router.post('/medical-history',
  authenticateToken,
  validate(medicalHistorySchema),
  catchAsync(userController.addMedicalHistory)
);

/**
 * @route   POST /api/v1/users/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post('/avatar',
  authenticateToken,
  avatarUpload,
  handleUploadError,
  processImage,
  catchAsync(userController.uploadAvatar)
);

/**
 * @route   POST /api/v1/users/medical-documents
 * @desc    Upload medical documents
 * @access  Private
 */
router.post('/medical-documents',
  authenticateToken,
  medicalDocsUpload,
  handleUploadError,
  validateFileUpload,
  catchAsync(async (req, res, next) => {
    // This would be implemented in userController if needed
    res.status(501).json({
      success: false,
      message: 'Medical documents upload feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/users/medical-documents
 * @desc    Get user's medical documents
 * @access  Private
 */
router.get('/medical-documents',
  authenticateToken,
  validatePagination,
  catchAsync(async (req, res, next) => {
    // This would be implemented in userController if needed
    res.status(501).json({
      success: false,
      message: 'Medical documents retrieval feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   DELETE /api/v1/users/medical-documents/:documentId
 * @desc    Delete medical document
 * @access  Private
 */
router.delete('/medical-documents/:documentId',
  authenticateToken,
  validateObjectId('documentId'),
  catchAsync(async (req, res, next) => {
    // This would be implemented in userController if needed
    res.status(501).json({
      success: false,
      message: 'Medical document deletion feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   PUT /api/v1/users/notification-preferences
 * @desc    Update notification preferences
 * @access  Private
 */
router.put('/notification-preferences',
  authenticateToken,
  validate(notificationPreferencesSchema),
  catchAsync(userController.updateNotificationPreferences)
);

/**
 * @route   GET /api/v1/users/notification-preferences
 * @desc    Get notification preferences
 * @access  Private
 */
router.get('/notification-preferences',
  authenticateToken,
  catchAsync(async (req, res, next) => {
    // This would be implemented in userController if needed
    res.status(501).json({
      success: false,
      message: 'Get notification preferences feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID (self or admin)
 * @access  Private
 */
router.get('/:id',
  authenticateToken,
  validateObjectId(),
  selfOrAdmin,
  catchAsync(userController.getUserById)
);

/**
 * @route   GET /api/v1/users
 * @desc    Get all users (admin only)
 * @access  Private (Admin)
 */
router.get('/',
  authenticateToken,
  adminOnly,
  validatePagination,
  catchAsync(userController.getAllUsers)
);

/**
 * @route   GET /api/v1/users/search
 * @desc    Search users
 * @access  Private (Admin)
 */
router.get('/search',
  authenticateToken,
  adminOnly,
  validateSearchQuery,
  catchAsync(userController.searchUsers)
);

/**
 * @route   PUT /api/v1/users/:id/status
 * @desc    Update user status (admin only)
 * @access  Private (Admin)
 */
router.put('/:id/status',
  authenticateToken,
  adminOnly,
  validateObjectId(),
  validate(userStatusSchema),
  catchAsync(userController.updateUserStatus)
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user account (self or admin)
 * @access  Private
 */
router.delete('/:id',
  authenticateToken,
  validateObjectId(),
  selfOrAdmin,
  catchAsync(userController.deleteUser)
);

/**
 * @route   GET /api/v1/users/stats/overview
 * @desc    Get user statistics (admin only)
 * @access  Private (Admin)
 */
router.get('/stats/overview',
  authenticateToken,
  adminOnly,
  catchAsync(userController.getUserStats)
);

/**
 * @route   GET /api/v1/users/export/data
 * @desc    Export user data (GDPR compliance)
 * @access  Private
 */
router.get('/export/data',
  authenticateToken,
  catchAsync(async (req, res, next) => {
    // This would be implemented for GDPR compliance
    res.status(501).json({
      success: false,
      message: 'Data export feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/users/export/request
 * @desc    Request data export (GDPR compliance)
 * @access  Private
 */
router.post('/export/request',
  authenticateToken,
  catchAsync(async (req, res, next) => {
    // This would queue a data export request
    res.status(501).json({
      success: false,
      message: 'Data export request feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/users/delete/request
 * @desc    Request account deletion (GDPR compliance)
 * @access  Private
 */
router.post('/delete/request',
  authenticateToken,
  validate(Joi.object({
    reason: Joi.string()
      .min(10)
      .max(500)
      .required()
      .messages({
        'string.min': 'Reason must be at least 10 characters',
        'string.max': 'Reason cannot exceed 500 characters',
        'any.required': 'Reason for account deletion is required'
      }),
    confirmPassword: Joi.string()
      .optional(),
    confirmPhrase: Joi.string()
      .valid('DELETE MY ACCOUNT')
      .required()
      .messages({
        'any.only': 'Please type "DELETE MY ACCOUNT" to confirm',
        'any.required': 'Confirmation phrase is required'
      })
  })),
  catchAsync(async (req, res, next) => {
    // This would handle account deletion requests
    res.status(501).json({
      success: false,
      message: 'Account deletion request feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/users/preferences/privacy
 * @desc    Update privacy preferences
 * @access  Private
 */
router.post('/preferences/privacy',
  authenticateToken,
  validate(Joi.object({
    profileVisibility: Joi.string()
      .valid('public', 'doctors_only', 'private')
      .default('doctors_only'),
    shareDataForResearch: Joi.boolean().default(false),
    allowMarketingCommunications: Joi.boolean().default(false),
    showOnlineStatus: Joi.boolean().default(true),
    allowDirectMessages: Joi.boolean().default(true)
  })),
  catchAsync(async (req, res, next) => {
    // This would update privacy preferences
    res.status(501).json({
      success: false,
      message: 'Privacy preferences feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/users/activity/history
 * @desc    Get user activity history
 * @access  Private
 */
router.get('/activity/history',
  authenticateToken,
  validatePagination,
  catchAsync(async (req, res, next) => {
    // This would show user's activity log
    res.status(501).json({
      success: false,
      message: 'Activity history feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/users/feedback
 * @desc    Submit user feedback
 * @access  Private
 */
router.post('/feedback',
  authenticateToken,
  validate(Joi.object({
    category: Joi.string()
      .valid('bug_report', 'feature_request', 'general_feedback', 'complaint')
      .required(),
    subject: Joi.string()
      .min(5)
      .max(200)
      .required(),
    message: Joi.string()
      .min(10)
      .max(2000)
      .required(),
    priority: Joi.string()
      .valid('low', 'medium', 'high')
      .default('medium'),
    attachments: Joi.array()
      .items(Joi.string())
      .max(5)
      .optional()
  })),
  catchAsync(async (req, res, next) => {
    // This would handle user feedback submissions
    res.status(501).json({
      success: false,
      message: 'User feedback feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/users/health
 * @desc    User service health check
 * @access  Public
 */
router.get('/health',
  catchAsync(async (req, res, next) => {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        userManagement: 'operational',
        profileManagement: 'operational',
        fileUpload: 'operational',
        notifications: 'operational'
      },
      endpoints: {
        '/profile': 'operational',
        '/doctor-profile': 'operational',
        '/avatar': 'operational',
        '/medical-history': 'operational'
      }
    };

    res.status(200).json({
      success: true,
      message: 'User service is healthy',
      data: healthStatus
    });
  })
);

export default router;