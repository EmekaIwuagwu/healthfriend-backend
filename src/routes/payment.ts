import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import paymentController from '../controllers/paymentController';
import { 
  authenticateToken, 
  adminOnly,
  doctorOrPatient,
  selfOrAdmin 
} from '../middleware/auth';
import { 
  validate
} from '../middleware/validation';
import { catchAsync } from '../middleware/errorHandler';
import { PAYMENT_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../utils/constants';
import Joi from 'joi';

const router = Router();

// Stricter rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW, // 15 minutes
  max: PAYMENT_RATE_LIMIT_MAX || 20, // 20 payment requests per window
  message: {
    success: false,
    message: 'Too many payment requests, please try again later',
    error: 'PAYMENT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

// Very strict rate limiting for actual payment processing
const processPaymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 payment attempts per hour
  message: {
    success: false,
    message: 'Payment processing limit exceeded, please try again later',
    error: 'PAYMENT_PROCESSING_LIMIT_EXCEEDED'
  }
});

// Validation schemas
const walletPaymentSchema = Joi.object({
  consultationId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid consultation ID format',
      'any.required': 'Consultation ID is required'
    }),
  amount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.positive': 'Amount must be positive',
      'any.required': 'Payment amount is required'
    }),
  currency: Joi.string()
    .valid('USD', 'ETH', 'USDC', 'USDT')
    .default('USD')
    .messages({
      'any.only': 'Currency must be USD, ETH, USDC, or USDT'
    }),
  paymentMethod: Joi.string()
    .valid('wallet', 'credit_card', 'crypto')
    .required()
    .messages({
      'any.only': 'Payment method must be wallet, credit_card, or crypto',
      'any.required': 'Payment method is required'
    }),
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .when('paymentMethod', {
      is: Joi.valid('wallet', 'crypto'),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .messages({
      'string.pattern.base': 'Invalid wallet address format'
    }),
  transactionHash: Joi.string()
    .when('paymentMethod', {
      is: 'crypto',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
  signature: Joi.string()
    .when('paymentMethod', {
      is: Joi.valid('wallet', 'crypto'),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
});

const creditCardPaymentSchema = Joi.object({
  consultationId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  amount: Joi.number()
    .positive()
    .precision(2)
    .required(),
  currency: Joi.string()
    .valid('USD')
    .default('USD'),
  paymentMethod: Joi.string()
    .valid('credit_card')
    .required(),
  cardToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Card token is required'
    }),
  billingAddress: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().required(),
    zipCode: Joi.string().required()
  }).required()
});

const refundRequestSchema = Joi.object({
  transactionId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  reason: Joi.string()
    .valid(
      'consultation_cancelled',
      'doctor_unavailable', 
      'technical_issue',
      'patient_request',
      'service_issue',
      'other'
    )
    .required(),
  description: Joi.string()
    .max(500)
    .optional(),
  amount: Joi.number()
    .positive()
    .precision(2)
    .optional()
    .messages({
      'number.positive': 'Refund amount must be positive'
    })
});

const withdrawalRequestSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .precision(2)
    .required(),
  currency: Joi.string()
    .valid('USD', 'ETH', 'USDC')
    .default('USD'),
  withdrawalMethod: Joi.string()
    .valid('bank_transfer', 'crypto_wallet', 'paypal')
    .required(),
  destination: Joi.object({
    // Bank details for bank transfer
    accountNumber: Joi.string().when('withdrawalMethod', {
      is: 'bank_transfer',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    routingNumber: Joi.string().when('withdrawalMethod', {
      is: 'bank_transfer',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    // Wallet address for crypto
    walletAddress: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{40}$/)
      .when('withdrawalMethod', {
        is: 'crypto_wallet',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    // PayPal email
    email: Joi.string().email().when('withdrawalMethod', {
      is: 'paypal',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }).required()
});

const subscriptionSchema = Joi.object({
  planId: Joi.string()
    .valid('basic', 'premium', 'professional')
    .required(),
  paymentMethod: Joi.string()
    .valid('credit_card', 'crypto')
    .required(),
  cardToken: Joi.string().when('paymentMethod', {
    is: 'credit_card',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .when('paymentMethod', {
      is: 'crypto',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
});

/**
 * @route   POST /api/v1/payments/wallet
 * @desc    Process wallet-based payment
 * @access  Private
 */
router.post('/wallet',
  processPaymentLimiter,
  paymentLimiter,
  authenticateToken,
  validate(walletPaymentSchema),
  catchAsync(paymentController.processWalletPayment)
);

/**
 * @route   POST /api/v1/payments/credit-card
 * @desc    Process credit card payment
 * @access  Private
 */
router.post('/credit-card',
  processPaymentLimiter,
  paymentLimiter,
  authenticateToken,
  validate(creditCardPaymentSchema),
  catchAsync(paymentController.processCreditCardPayment)
);

/**
 * @route   GET /api/v1/payments/methods
 * @desc    Get user's saved payment methods
 * @access  Private
 */
router.get('/methods',
  authenticateToken,
  catchAsync(paymentController.getPaymentMethods)
);

/**
 * @route   POST /api/v1/payments/methods
 * @desc    Add new payment method
 * @access  Private
 */
router.post('/methods',
  paymentLimiter,
  authenticateToken,
  validate(Joi.object({
    type: Joi.string().valid('credit_card', 'crypto_wallet').required(),
    cardToken: Joi.string().when('type', {
      is: 'credit_card',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    walletAddress: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{40}$/)
      .when('type', {
        is: 'crypto_wallet',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    isDefault: Joi.boolean().default(false)
  })),
  catchAsync(paymentController.addPaymentMethod)
);

/**
 * @route   DELETE /api/v1/payments/methods/:methodId
 * @desc    Remove payment method
 * @access  Private
 */
router.delete('/methods/:methodId',
  authenticateToken,
  catchAsync(paymentController.removePaymentMethod)
);

/**
 * @route   GET /api/v1/payments/history
 * @desc    Get payment history
 * @access  Private
 */
router.get('/history',
  authenticateToken,
  catchAsync(paymentController.getPaymentHistory)
);

/**
 * @route   GET /api/v1/payments/:transactionId
 * @desc    Get specific transaction details
 * @access  Private
 */
router.get('/:transactionId',
  authenticateToken,
  selfOrAdmin,
  catchAsync(paymentController.getTransaction)
);

/**
 * @route   PUT /api/v1/payments/:transactionId/status
 * @desc    Update transaction status (Admin only)
 * @access  Private (Admin)
 */
router.put('/:transactionId/status',
  authenticateToken,
  adminOnly,
  validate(Joi.object({
    status: Joi.string()
      .valid('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')
      .required(),
    notes: Joi.string().max(500).optional()
  })),
  catchAsync(paymentController.updateTransactionStatus)
);

/**
 * @route   POST /api/v1/payments/refund
 * @desc    Request refund
 * @access  Private
 */
router.post('/refund',
  paymentLimiter,
  authenticateToken,
  validate(refundRequestSchema),
  catchAsync(paymentController.requestRefund)
);

/**
 * @route   PUT /api/v1/payments/refund/:refundId/approve
 * @desc    Approve refund request (Admin only)
 * @access  Private (Admin)
 */
router.put('/refund/:refundId/approve',
  authenticateToken,
  adminOnly,
  validate(Joi.object({
    approved: Joi.boolean().required(),
    adminNotes: Joi.string().max(500).optional()
  })),
  catchAsync(paymentController.approveRefund)
);

/**
 * @route   GET /api/v1/payments/balance
 * @desc    Get user wallet balance
 * @access  Private
 */
router.get('/balance',
  authenticateToken,
  catchAsync(paymentController.getWalletBalance)
);

/**
 * @route   POST /api/v1/payments/withdraw
 * @desc    Request withdrawal (Doctors only)
 * @access  Private
 */
router.post('/withdraw',
  paymentLimiter,
  authenticateToken,
  validate(withdrawalRequestSchema),
  catchAsync(paymentController.requestWithdrawal)
);

/**
 * @route   GET /api/v1/payments/withdrawals
 * @desc    Get withdrawal history
 * @access  Private
 */
router.get('/withdrawals',
  authenticateToken,
  catchAsync(paymentController.getWithdrawalHistory)
);

/**
 * @route   PUT /api/v1/payments/withdrawals/:withdrawalId/approve
 * @desc    Approve withdrawal request (Admin only)
 * @access  Private (Admin)
 */
router.put('/withdrawals/:withdrawalId/approve',
  authenticateToken,
  adminOnly,
  validate(Joi.object({
    approved: Joi.boolean().required(),
    adminNotes: Joi.string().max(500).optional()
  })),
  catchAsync(paymentController.approveWithdrawal)
);

/**
 * @route   GET /api/v1/payments/earnings
 * @desc    Get doctor earnings summary
 * @access  Private
 */
router.get('/earnings',
  authenticateToken,
  catchAsync(paymentController.getEarningsSummary)
);

/**
 * @route   POST /api/v1/payments/estimate
 * @desc    Get payment estimate
 * @access  Private
 */
router.post('/estimate',
  authenticateToken,
  validate(Joi.object({
    serviceType: Joi.string().valid('consultation', 'home_visit').required(),
    doctorId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    duration: Joi.number().min(15).max(180).default(30),
    currency: Joi.string().valid('USD', 'ETH', 'USDC').default('USD')
  })),
  catchAsync(paymentController.getPaymentEstimate)
);

/**
 * @route   POST /api/v1/payments/subscription
 * @desc    Subscribe to premium plan
 * @access  Private
 */
router.post('/subscription',
  paymentLimiter,
  authenticateToken,
  validate(subscriptionSchema),
  catchAsync(paymentController.createSubscription)
);

/**
 * @route   GET /api/v1/payments/subscription
 * @desc    Get subscription status
 * @access  Private
 */
router.get('/subscription',
  authenticateToken,
  catchAsync(paymentController.getSubscription)
);

/**
 * @route   PUT /api/v1/payments/subscription/cancel
 * @desc    Cancel subscription
 * @access  Private
 */
router.put('/subscription/cancel',
  authenticateToken,
  validate(Joi.object({
    reason: Joi.string().max(500).optional(),
    immediateCancel: Joi.boolean().default(false)
  })),
  catchAsync(paymentController.cancelSubscription)
);

/**
 * @route   POST /api/v1/payments/webhook/stripe
 * @desc    Stripe webhook handler
 * @access  Public (Webhook)
 */
router.post('/webhook/stripe',
  catchAsync(paymentController.handleStripeWebhook)
);

/**
 * @route   POST /api/v1/payments/webhook/crypto
 * @desc    Crypto payment webhook handler
 * @access  Public (Webhook)
 */
router.post('/webhook/crypto',
  catchAsync(paymentController.handleCryptoWebhook)
);

/**
 * @route   GET /api/v1/payments/exchange-rates
 * @desc    Get current exchange rates
 * @access  Public
 */
router.get('/exchange-rates',
  catchAsync(paymentController.getExchangeRates)
);

/**
 * @route   POST /api/v1/payments/verify-transaction
 * @desc    Verify blockchain transaction
 * @access  Private
 */
router.post('/verify-transaction',
  paymentLimiter,
  authenticateToken,
  validate(Joi.object({
    transactionHash: Joi.string().required(),
    chainId: Joi.number().valid(1, 137, 11155111).required(),
    expectedAmount: Joi.number().positive().required(),
    currency: Joi.string().valid('ETH', 'USDC', 'USDT').required()
  })),
  catchAsync(paymentController.verifyBlockchainTransaction)
);

/**
 * @route   GET /api/v1/payments/gas-estimate
 * @desc    Get gas estimate for crypto transaction
 * @access  Private
 */
router.get('/gas-estimate',
  authenticateToken,
  validate(Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().valid('ETH', 'USDC', 'USDT').required(),
    chainId: Joi.number().valid(1, 137).default(1)
  })),
  catchAsync(paymentController.getGasEstimate)
);

/**
 * @route   POST /api/v1/payments/disputes
 * @desc    Create payment dispute
 * @access  Private
 */
router.post('/disputes',
  paymentLimiter,
  authenticateToken,
  validate(Joi.object({
    transactionId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    category: Joi.string()
      .valid('unauthorized', 'service_not_received', 'billing_error', 'other')
      .required(),
    description: Joi.string().min(20).max(1000).required(),
    evidence: Joi.array().items(Joi.string()).max(10).optional()
  })),
  catchAsync(paymentController.createDispute)
);

/**
 * @route   GET /api/v1/payments/disputes
 * @desc    Get user's payment disputes
 * @access  Private
 */
router.get('/disputes',
  authenticateToken,
  catchAsync(paymentController.getDisputes)
);

/**
 * @route   PUT /api/v1/payments/disputes/:disputeId/resolve
 * @desc    Resolve payment dispute (Admin only)
 * @access  Private (Admin)
 */
router.put('/disputes/:disputeId/resolve',
  authenticateToken,
  adminOnly,
  validate(Joi.object({
    resolution: Joi.string()
      .valid('approved', 'denied', 'partial_refund')
      .required(),
    refundAmount: Joi.number().positive().optional(),
    adminNotes: Joi.string().max(1000).required()
  })),
  catchAsync(paymentController.resolveDispute)
);

/**
 * @route   GET /api/v1/payments/analytics
 * @desc    Get payment analytics (Admin only)
 * @access  Private (Admin)
 */
router.get('/analytics',
  authenticateToken,
  adminOnly,
  catchAsync(paymentController.getPaymentAnalytics)
);

/**
 * @route   GET /api/v1/payments/health
 * @desc    Payment service health check
 * @access  Public
 */
router.get('/health',
  catchAsync(async (req, res, next) => {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        stripe: 'operational',
        blockchain: 'operational',
        walletService: 'operational',
        database: 'operational'
      },
      supportedCurrencies: ['USD', 'ETH', 'USDC', 'USDT'],
      supportedChains: [1, 137] // Ethereum, Polygon
    };

    res.status(200).json({
      success: true,
      message: 'Payment service is healthy',
      data: healthStatus
    });
  })
);

export default router;