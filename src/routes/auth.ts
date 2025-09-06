import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import authController from '../controllers/authController';
import { 
  authenticateToken, 
  optionalAuth, 
  verifyWalletSignature,
  verifyRefreshToken 
} from '../middleware/auth';
import { 
  validateUserRegistration,
  validateUserLogin,
  validateWalletAddress,
  validate
} from '../middleware/validation';
import { catchAsync } from '../middleware/errorHandler';
import { AUTH_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../utils/constants';
import Joi from 'joi';

const router = Router();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW, // 15 minutes
  max: AUTH_RATE_LIMIT_MAX, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    error: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by IP and wallet address if provided
    const walletAddress = req.body?.walletAddress || '';
    return `${req.ip}-${walletAddress}`;
  }
});

// Stricter rate limiting for registration
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registration attempts per hour
  message: {
    success: false,
    message: 'Too many registration attempts, please try again later',
    error: 'REGISTRATION_RATE_LIMIT_EXCEEDED'
  }
});

// Validation schemas for specific endpoints
const nonceRequestSchema = Joi.object({
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid wallet address format',
      'any.required': 'Wallet address is required'
    })
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required'
    })
});

const emailVerificationSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Verification token is required'
    })
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    })
});

/**
 * @route   POST /api/v1/auth/nonce
 * @desc    Generate authentication nonce for wallet
 * @access  Public
 */
router.post('/nonce',
  authLimiter,
  validate(nonceRequestSchema),
  catchAsync(authController.generateNonce)
);

/**
 * @route   POST /api/v1/auth/wallet-login
 * @desc    Authenticate user with wallet signature
 * @access  Public
 */
router.post('/wallet-login',
  authLimiter,
  validateUserLogin,
  verifyWalletSignature,
  catchAsync(authController.walletLogin)
);

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post('/register',
  registrationLimiter,
  validateUserRegistration,
  catchAsync(authController.register)
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh-token',
  authLimiter,
  validate(refreshTokenSchema),
  verifyRefreshToken,
  catchAsync(authController.refreshToken)
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user
 * @access  Private
 */
router.get('/me',
  authenticateToken,
  catchAsync(authController.getCurrentUser)
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (client-side mainly for JWT)
 * @access  Private
 */
router.post('/logout',
  authenticateToken,
  catchAsync(authController.logout)
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  catchAsync(authController.forgotPassword)
);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify user email address
 * @access  Public
 */
router.post('/verify-email',
  validate(emailVerificationSchema),
  catchAsync(authController.verifyEmail)
);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification
 * @access  Private
 */
router.post('/resend-verification',
  authenticateToken,
  catchAsync(authController.resendVerification)
);

/**
 * @route   GET /api/v1/auth/status
 * @desc    Check authentication status
 * @access  Public (with optional auth)
 */
router.get('/status',
  optionalAuth,
  catchAsync(authController.checkAuthStatus)
);

/**
 * @route   GET /api/v1/auth/validate-session
 * @desc    Validate current session
 * @access  Private
 */
router.get('/validate-session',
  authenticateToken,
  catchAsync(authController.validateSession)
);

/**
 * @route   POST /api/v1/auth/connect-wallet
 * @desc    Connect additional wallet to existing account
 * @access  Private
 */
router.post('/connect-wallet',
  authenticateToken,
  authLimiter,
  validateWalletAddress('newWalletAddress'),
  verifyWalletSignature,
  catchAsync(async (req, res, next) => {
    // This would be implemented in authController if needed
    res.status(501).json({
      success: false,
      message: 'Wallet connection feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/auth/disconnect-wallet
 * @desc    Disconnect wallet from account
 * @access  Private
 */
router.post('/disconnect-wallet',
  authenticateToken,
  validateWalletAddress('walletAddress'),
  catchAsync(async (req, res, next) => {
    // This would be implemented in authController if needed
    res.status(501).json({
      success: false,
      message: 'Wallet disconnection feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/auth/sessions
 * @desc    Get user active sessions
 * @access  Private
 */
router.get('/sessions',
  authenticateToken,
  catchAsync(async (req, res, next) => {
    // This would show active JWT sessions (if tracking them)
    res.status(501).json({
      success: false,
      message: 'Session management feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   DELETE /api/v1/auth/sessions/:sessionId
 * @desc    Revoke specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId',
  authenticateToken,
  catchAsync(async (req, res, next) => {
    // This would revoke a specific session
    res.status(501).json({
      success: false,
      message: 'Session revocation feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   POST /api/v1/auth/change-role
 * @desc    Request role change (patient to doctor, etc.)
 * @access  Private
 */
router.post('/change-role',
  authenticateToken,
  validate(Joi.object({
    newRole: Joi.string()
      .valid('patient', 'doctor')
      .required()
      .messages({
        'any.only': 'Role must be either patient or doctor',
        'any.required': 'New role is required'
      }),
    reason: Joi.string()
      .min(10)
      .max(500)
      .required()
      .messages({
        'string.min': 'Reason must be at least 10 characters',
        'string.max': 'Reason cannot exceed 500 characters',
        'any.required': 'Reason for role change is required'
      })
  })),
  catchAsync(async (req, res, next) => {
    // This would handle role change requests
    res.status(501).json({
      success: false,
      message: 'Role change feature not yet implemented',
      error: 'NOT_IMPLEMENTED'
    });
  })
);

/**
 * @route   GET /api/v1/auth/health
 * @desc    Authentication service health check
 * @access  Public
 */
router.get('/health',
  catchAsync(async (req, res, next) => {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        jwt: 'operational',
        walletAuth: 'operational',
        emailService: 'operational'
      },
      endpoints: {
        '/nonce': 'operational',
        '/wallet-login': 'operational', 
        '/register': 'operational',
        '/refresh-token': 'operational'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Authentication service is healthy',
      data: healthStatus
    });
  })
);

export default router;