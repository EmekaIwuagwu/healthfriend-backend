import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import adminController from '../controllers/adminController';
import userController from '../controllers/userController';
import consultationController from '../controllers/consultationController';
import doctorController from '../controllers/doctorController';
import { 
  authenticateToken, 
  adminOnly 
} from '../middleware/auth';
import { 
  validate
} from '../middleware/validation';
import { catchAsync } from '../middleware/errorHandler';
import { ADMIN_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../utils/constants';
import Joi from 'joi';

const router = Router();

// Rate limiting for admin endpoints
const adminLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW, // 15 minutes
  max: ADMIN_RATE_LIMIT_MAX || 200, // 200 admin requests per window
  message: {
    success: false,
    message: 'Too many admin requests, please try again later',
    error: 'ADMIN_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `admin_${req.user?.id || req.ip}`;
  }
});

// Stricter rate limiting for sensitive admin operations
const sensitiveAdminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 sensitive operations per hour
  message: {
    success: false,
    message: 'Sensitive operation limit exceeded, please try again later',
    error: 'SENSITIVE_ADMIN_LIMIT_EXCEEDED'
  }
});

// Apply admin authentication to all routes
router.use(authenticateToken);
router.use(adminOnly);

// Validation schemas
const userStatusUpdateSchema = Joi.object({
  isActive: Joi.boolean().required(),
  reason: Joi.string().max(500).optional()
});

const doctorVerificationSchema = Joi.object({
  isVerified: Joi.boolean().required(),
  verificationNotes: Joi.string().max(1000).optional()
});

const banUserSchema = Joi.object({
  isBanned: Joi.boolean().required(),
  banReason: Joi.string().when('isBanned', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional()
  }).max(500)
});

const exportDataSchema = Joi.object({
  type: Joi.string()
    .valid('users', 'transactions', 'consultations', 'appointments')
    .required(),
  format: Joi.string()
    .valid('csv', 'json', 'xlsx')
    .default('csv'),
  filters: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    role: Joi.string().optional(),
    status: Joi.string().optional()
  }).optional(),
  fields: Joi.array().items(Joi.string()).optional()
});

/**
 * @route   GET /api/v1/admin/dashboard
 * @desc    Get admin dashboard statistics
 * @access  Private (Admin)
 */
router.get('/dashboard',
  adminLimiter,
  catchAsync(adminController.getDashboardStats)
);

// User Management Routes
/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users with admin controls
 * @access  Private (Admin)
 */
router.get('/users',
  adminLimiter,
  catchAsync(adminController.getAllUsers)
);

/**
 * @route   GET /api/v1/admin/users/:id
 * @desc    Get specific user details
 * @access  Private (Admin)
 */
router.get('/users/:id',
  adminLimiter,
  catchAsync(userController.getUserById)
);

/**
 * @route   PUT /api/v1/admin/users/:id/status
 * @desc    Update user status (activate/deactivate)
 * @access  Private (Admin)
 */
router.put('/users/:id/status',
  sensitiveAdminLimiter,
  validate(userStatusUpdateSchema),
  catchAsync(adminController.updateUserStatus)
);

/**
 * @route   PUT /api/v1/admin/users/:id/ban
 * @desc    Ban/unban user
 * @access  Private (Admin)
 */
router.put('/users/:id/ban',
  sensitiveAdminLimiter,
  validate(banUserSchema),
  catchAsync(adminController.banUser)
);

/**
 * @route   DELETE /api/v1/admin/users/:id
 * @desc    Delete user account
 * @access  Private (Admin)
 */
router.delete('/users/:id',
  sensitiveAdminLimiter,
  catchAsync(userController.deleteUser)
);

/**
 * @route   GET /api/v1/admin/users/stats
 * @desc    Get user statistics
 * @access  Private (Admin)
 */
router.get('/users/stats',
  adminLimiter,
  catchAsync(userController.getUserStats)
);

// Doctor Management Routes
/**
 * @route   GET /api/v1/admin/doctors/pending-verification
 * @desc    Get pending doctor verifications
 * @access  Private (Admin)
 */
router.get('/doctors/pending-verification',
  adminLimiter,
  catchAsync(adminController.getPendingVerifications)
);

/**
 * @route   PUT /api/v1/admin/doctors/:id/verify
 * @desc    Verify doctor profile
 * @access  Private (Admin)
 */
router.put('/doctors/:id/verify',
  sensitiveAdminLimiter,
  validate(doctorVerificationSchema),
  catchAsync(adminController.verifyDoctor)
);

/**
 * @route   GET /api/v1/admin/doctors
 * @desc    Get all doctors with admin controls
 * @access  Private (Admin)
 */
router.get('/doctors',
  adminLimiter,
  catchAsync(doctorController.getAllDoctors)
);

/**
 * @route   PUT /api/v1/admin/doctors/:id/availability
 * @desc    Update doctor availability status
 * @access  Private (Admin)
 */
router.put('/doctors/:id/availability',
  adminLimiter,
  validate(Joi.object({
    isAvailable: Joi.boolean().required(),
    reason: Joi.string().max(500).optional()
  })),
  catchAsync(doctorController.updateAvailability)
);

// Consultation Management Routes
/**
 * @route   GET /api/v1/admin/consultations
 * @desc    Get all consultations with admin controls
 * @access  Private (Admin)
 */
router.get('/consultations',
  adminLimiter,
  catchAsync(consultationController.getAllConsultations)
);

/**
 * @route   PUT /api/v1/admin/consultations/:id/status
 * @desc    Update consultation status
 * @access  Private (Admin)
 */
router.put('/consultations/:id/status',
  sensitiveAdminLimiter,
  validate(Joi.object({
    status: Joi.string()
      .valid('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')
      .required(),
    adminNotes: Joi.string().max(1000).optional()
  })),
  catchAsync(consultationController.updateConsultationStatus)
);

// Analytics Routes
/**
 * @route   GET /api/v1/admin/analytics/revenue
 * @desc    Get revenue analytics
 * @access  Private (Admin)
 */
router.get('/analytics/revenue',
  adminLimiter,
  catchAsync(adminController.getRevenueAnalytics)
);

/**
 * @route   GET /api/v1/admin/analytics/users
 * @desc    Get user analytics
 * @access  Private (Admin)
 */
router.get('/analytics/users',
  adminLimiter,
  catchAsync(adminController.getUserAnalytics)
);

/**
 * @route   GET /api/v1/admin/analytics/consultations
 * @desc    Get consultation analytics
 * @access  Private (Admin)
 */
router.get('/analytics/consultations',
  adminLimiter,
  validate(Joi.object({
    period: Joi.string().valid('day', 'week', 'month', 'quarter', 'year').default('month'),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  })),
  catchAsync(async (req, res, next) => {
    // Placeholder for consultation analytics
    const analytics = {
      totalConsultations: 0,
      completedConsultations: 0,
      cancelledConsultations: 0,
      averageRating: 0,
      popularSpecializations: []
    };

    res.status(200).json({
      success: true,
      message: 'Consultation analytics retrieved successfully',
      data: analytics
    });
  })
);

// System Management Routes
/**
 * @route   GET /api/v1/admin/health
 * @desc    Get system health status
 * @access  Private (Admin)
 */
router.get('/health',
  adminLimiter,
  catchAsync(adminController.getSystemHealth)
);

/**
 * @route   GET /api/v1/admin/logs
 * @desc    Get system logs
 * @access  Private (Admin)
 */
router.get('/logs',
  adminLimiter,
  validate(Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug', 'all').default('all'),
    limit: Joi.number().min(1).max(1000).default(100),
    search: Joi.string().max(200).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  })),
  catchAsync(adminController.getSystemLogs)
);

/**
 * @route   POST /api/v1/admin/export
 * @desc    Export data
 * @access  Private (Admin)
 */
router.post('/export',
  adminLimiter,
  validate(exportDataSchema),
  catchAsync(adminController.exportData)
);

// Configuration Management Routes
/**
 * @route   GET /api/v1/admin/config
 * @desc    Get system configuration
 * @access  Private (Admin)
 */
router.get('/config',
  adminLimiter,
  catchAsync(async (req, res, next) => {
    // Return non-sensitive configuration
    const config = {
      features: {
        aiConsultation: true,
        videoChat: true,
        homeVisits: true,
        cryptoPayments: true
      },
      limits: {
        maxFileSize: '10MB',
        maxChatSessions: 5,
        dailyConsultations: 10
      },
      maintenance: {
        scheduled: false,
        message: null
      }
    };

    res.status(200).json({
      success: true,
      message: 'System configuration retrieved successfully',
      data: config
    });
  })
);

/**
 * @route   PUT /api/v1/admin/config
 * @desc    Update system configuration
 * @access  Private (Admin)
 */
router.put('/config',
  sensitiveAdminLimiter,
  validate(Joi.object({
    features: Joi.object({
      aiConsultation: Joi.boolean().optional(),
      videoChat: Joi.boolean().optional(),
      homeVisits: Joi.boolean().optional(),
      cryptoPayments: Joi.boolean().optional()
    }).optional(),
    limits: Joi.object({
      maxFileSize: Joi.string().optional(),
      maxChatSessions: Joi.number().min(1).max(20).optional(),
      dailyConsultations: Joi.number().min(1).max(50).optional()
    }).optional(),
    maintenance: Joi.object({
      scheduled: Joi.boolean().optional(),
      message: Joi.string().max(500).allow(null).optional(),
      startTime: Joi.date().optional(),
      endTime: Joi.date().optional()
    }).optional()
  })),
  catchAsync(async (req, res, next) => {
    // In a real implementation, this would update system configuration
    const updatedConfig = req.body;

    res.status(200).json({
      success: true,
      message: 'System configuration updated successfully',
      data: updatedConfig
    });
  })
);

// Notification Management Routes
/**
 * @route   POST /api/v1/admin/notifications/broadcast
 * @desc    Send broadcast notification
 * @access  Private (Admin)
 */
router.post('/notifications/broadcast',
  sensitiveAdminLimiter,
  validate(Joi.object({
    title: Joi.string().required().max(100),
    message: Joi.string().required().max(500),
    type: Joi.string().valid('info', 'warning', 'urgent', 'maintenance').required(),
    targetUsers: Joi.string().valid('all', 'patients', 'doctors', 'specific').required(),
    userIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).when('targetUsers', {
      is: 'specific',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    channels: Joi.array().items(Joi.string().valid('email', 'sms', 'push', 'in_app')).default(['in_app']),
    scheduledFor: Joi.date().min('now').optional()
  })),
  catchAsync(async (req, res, next) => {
    // In a real implementation, this would send broadcast notifications
    const notificationJob = {
      id: `broadcast_${Date.now()}`,
      ...req.body,
      status: 'queued',
      createdAt: new Date()
    };

    res.status(202).json({
      success: true,
      message: 'Broadcast notification queued successfully',
      data: notificationJob
    });
  })
);

// Security & Monitoring Routes
/**
 * @route   GET /api/v1/admin/security/login-attempts
 * @desc    Get failed login attempts
 * @access  Private (Admin)
 */
router.get('/security/login-attempts',
  adminLimiter,
  validate(Joi.object({
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(20),
    suspicious: Joi.boolean().optional(),
    timeframe: Joi.string().valid('1h', '24h', '7d', '30d').default('24h')
  })),
  catchAsync(async (req, res, next) => {
    // Mock data for login attempts monitoring
    const loginAttempts = {
      total: 0,
      failed: 0,
      suspicious: 0,
      attempts: []
    };

    res.status(200).json({
      success: true,
      message: 'Login attempts retrieved successfully',
      data: loginAttempts
    });
  })
);

/**
 * @route   POST /api/v1/admin/security/block-ip
 * @desc    Block IP address
 * @access  Private (Admin)
 */
router.post('/security/block-ip',
  sensitiveAdminLimiter,
  validate(Joi.object({
    ipAddress: Joi.string().ip().required(),
    reason: Joi.string().max(500).required(),
    duration: Joi.string().valid('1h', '24h', '7d', '30d', 'permanent').default('24h')
  })),
  catchAsync(async (req, res, next) => {
    // In a real implementation, this would block the IP address
    const { ipAddress, reason, duration } = req.body;

    res.status(200).json({
      success: true,
      message: `IP address ${ipAddress} blocked successfully`,
      data: { ipAddress, reason, duration, blockedAt: new Date() }
    });
  })
);

/**
 * @route   GET /api/v1/admin/reports/generate
 * @desc    Generate admin report
 * @access  Private (Admin)
 */
router.get('/reports/generate',
  adminLimiter,
  validate(Joi.object({
    reportType: Joi.string()
      .valid('users', 'revenue', 'consultations', 'security', 'performance')
      .required(),
    period: Joi.string().valid('day', 'week', 'month', 'quarter', 'year').default('month'),
    format: Joi.string().valid('pdf', 'csv', 'json').default('pdf'),
    email: Joi.string().email().optional()
  })),
  catchAsync(async (req, res, next) => {
    // In a real implementation, this would generate and optionally email the report
    const reportJob = {
      id: `report_${Date.now()}`,
      type: req.query.reportType,
      status: 'generating',
      createdAt: new Date(),
      estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    };

    res.status(202).json({
      success: true,
      message: 'Report generation started',
      data: reportJob
    });
  })
);

/**
 * @route   GET /api/v1/admin/audit-logs
 * @desc    Get admin audit logs
 * @access  Private (Admin)
 */
router.get('/audit-logs',
  adminLimiter,
  validate(Joi.object({
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(50),
    action: Joi.string().optional(),
    adminId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  })),
  catchAsync(async (req, res, next) => {
    // Mock audit logs data
    const auditLogs = {
      logs: [],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0
      }
    };

    res.status(200).json({
      success: true,
      message: 'Audit logs retrieved successfully',
      data: auditLogs
    });
  })
);

export default router;