import { Request, Response } from 'express';
import { 
  IPaymentConfirmation, 
  IWithdrawalRequest, 
  ITransactionRequest 
} from '../types';
import { Transaction, Earnings } from '../models/Transaction';
import Consultation from '../models/Consultation';
import User from '../models/User';
import PaymentService from '../services/paymentService';
import EmailService from '../services/emailService';
import { AuthRequest } from '../middleware/auth';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  calculatePagination,
  getPaginationQuery,
  logInfo,
  logError
} from '../utils/helpers';
import { 
  HTTP_STATUS, 
  DEFAULT_PAGE_SIZE,
  SUPPORTED_CURRENCIES,
  SUPPORTED_NETWORKS 
} from '../utils/constants';

class PaymentController {
  /**
   * Create payment intent
   * POST /api/payments/create
   */
  async createPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const transactionRequest: ITransactionRequest = {
        ...req.body,
        userId: req.user._id.toString(),
        fromAddress: req.user.walletAddress
      };

      // Create payment transaction
      const transaction = await PaymentService.createPaymentTransaction(transactionRequest);

      logInfo('Payment intent created', { 
        transactionId: transaction.transactionId,
        userId: req.user._id,
        amount: transaction.amount,
        currency: transaction.currency 
      });

      res.status(HTTP_STATUS.CREATED).json(
        createSuccessResponse({
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          currency: transaction.currency,
          gasFee: transaction.gasFee,
          platformFee: transaction.platformFee,
          totalAmount: transaction.amount + transaction.gasFee + transaction.platformFee,
          toAddress: transaction.toAddress,
          blockchainNetwork: transaction.blockchainNetwork,
          status: transaction.status
        }, 'Payment intent created successfully')
      );
    } catch (error) {
      logError('Create payment failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to create payment', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Confirm blockchain payment
   * POST /api/payments/confirm
   */
  async confirmPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const confirmation: IPaymentConfirmation = req.body;

      // Confirm payment
      const transaction = await PaymentService.confirmPayment(confirmation);

      // Send payment confirmation email
      try {
        await EmailService.sendPaymentConfirmation({
          user: req.user,
          transaction,
          receiptUrl: `${process.env.FRONTEND_URL}/receipts/${transaction.transactionId}`
        });
      } catch (emailError) {
        logError('Payment confirmation email failed:', emailError);
      }

      // Update consultation payment status if applicable
      if (transaction.consultationId) {
        try {
          await Consultation.findOneAndUpdate(
            { consultationId: transaction.consultationId },
            { 'payment.status': 'completed', 'payment.paidAt': new Date() }
          );
        } catch (consultationError) {
          logError('Failed to update consultation payment status:', consultationError);
        }
      }

      logInfo('Payment confirmed', { 
        transactionId: transaction.transactionId,
        transactionHash: confirmation.transactionHash,
        userId: req.user._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          transactionId: transaction.transactionId,
          transactionHash: transaction.transactionHash,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          blockNumber: transaction.blockNumber,
          gasUsed: transaction.gasUsed,
          confirmations: transaction.confirmations
        }, 'Payment confirmed successfully')
      );
    } catch (error) {
      logError('Confirm payment failed:', error);
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse(
          error instanceof Error ? error.message : 'Payment confirmation failed', 
          'PAYMENT_ERROR'
        )
      );
    }
  }

  /**
   * Get payment status
   * GET /api/payments/:transactionId/status
   */
  async getPaymentStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;

      const paymentStatus = await PaymentService.getPaymentStatus(transactionId);

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(paymentStatus, 'Payment status retrieved successfully')
      );
    } catch (error) {
      logError('Get payment status failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve payment status', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get user's payment history
   * GET /api/payments/history
   */
  async getPaymentHistory(req: AuthRequest, res: Response): Promise<void> {
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
        type,
        status,
        currency,
        dateFrom,
        dateTo 
      } = req.query;

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      // Build query
      const query: any = {};
      
      // Filter by user role
      if (req.user.role === 'patient') {
        query.userId = req.user._id;
      } else if (req.user.role === 'doctor') {
        query.$or = [
          { userId: req.user._id },
          { doctorId: req.user._id }
        ];
      } else if (req.user.role === 'admin') {
        // Admin can see all transactions
      } else {
        query.userId = req.user._id;
      }

      // Add filters
      if (type) query.type = type;
      if (status) query.status = status;
      if (currency) query.currency = currency;
      
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
        if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
      }

      // Get total count
      const totalTransactions = await Transaction.countDocuments(query);

      // Get transactions
      const transactions = await Transaction.find(query)
        .populate('userId', 'firstName lastName email')
        .populate('doctorId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(queryLimit)
        .lean();

      const pagination = calculatePagination(
        Number(page),
        Number(limit),
        totalTransactions
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          transactions,
          pagination
        }, 'Payment history retrieved successfully')
      );
    } catch (error) {
      logError('Get payment history failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve payment history', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Process doctor withdrawal
   * POST /api/payments/withdraw
   */
  async processWithdrawal(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'doctor') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      const withdrawalRequest: IWithdrawalRequest = {
        ...req.body,
        doctorId: req.user._id.toString()
      };

      // Process withdrawal
      const withdrawal = await PaymentService.processWithdrawal(withdrawalRequest);

      // Send withdrawal confirmation email
      try {
        await EmailService.sendPaymentConfirmation({
          user: req.user,
          transaction: withdrawal,
          receiptUrl: `${process.env.FRONTEND_URL}/receipts/${withdrawal.transactionId}`
        });
      } catch (emailError) {
        logError('Withdrawal confirmation email failed:', emailError);
      }

      logInfo('Doctor withdrawal processed', { 
        transactionId: withdrawal.transactionId,
        doctorId: req.user._id,
        amount: withdrawal.amount,
        currency: withdrawal.currency 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          transactionId: withdrawal.transactionId,
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          toAddress: withdrawal.toAddress,
          status: withdrawal.status,
          estimatedArrival: '10-30 minutes' // Blockchain confirmation time
        }, 'Withdrawal processed successfully')
      );
    } catch (error) {
      logError('Process withdrawal failed:', error);
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse(
          error instanceof Error ? error.message : 'Withdrawal processing failed', 
          'PAYMENT_ERROR'
        )
      );
    }
  }

  /**
   * Get doctor earnings
   * GET /api/payments/earnings
   */
  async getDoctorEarnings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'doctor') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      const earnings = await PaymentService.getDoctorEarnings(req.user._id.toString());

      // Get earnings breakdown
      const earningsBreakdown = await this.getEarningsBreakdown(req.user._id.toString());

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          ...earnings,
          breakdown: earningsBreakdown
        }, 'Doctor earnings retrieved successfully')
      );
    } catch (error) {
      logError('Get doctor earnings failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve earnings', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Calculate consultation fees
   * POST /api/payments/calculate-fees
   */
  async calculateFees(req: Request, res: Response): Promise<void> {
    try {
      const { 
        consultationType, 
        doctorId, 
        currency = 'ETH' 
      } = req.body;

      if (!consultationType) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Consultation type is required', 'VALIDATION_ERROR')
        );
        return;
      }

      // Get doctor's fees if applicable
      let doctorFee: number | undefined;
      if (doctorId && consultationType !== 'ai_chat') {
        const doctor = await User.findById(doctorId);
        if (doctor?.doctorProfile) {
          doctorFee = consultationType === 'home_visit' ? 
            doctor.doctorProfile.homeVisitFee : 
            doctor.doctorProfile.consultationFee;
        }
      }

      const feeCalculation = PaymentService.calculateConsultationFees(
        consultationType,
        doctorFee,
        currency
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(feeCalculation, 'Consultation fees calculated successfully')
      );
    } catch (error) {
      logError('Calculate fees failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to calculate fees', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Process refund
   * POST /api/payments/:transactionId/refund
   */
  async processRefund(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'admin') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Admin access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      const { transactionId } = req.params;
      const { amount, reason } = req.body;

      // Process refund
      const refund = await PaymentService.processRefund(transactionId, amount, reason);

      // Get original transaction details for email
      const originalTransaction = await Transaction.findOne({ transactionId });
      if (originalTransaction) {
        const user = await User.findById(originalTransaction.userId);
        if (user) {
          try {
            await EmailService.sendPaymentConfirmation({
              user,
              transaction: refund,
              receiptUrl: `${process.env.FRONTEND_URL}/receipts/${refund.transactionId}`
            });
          } catch (emailError) {
            logError('Refund confirmation email failed:', emailError);
          }
        }
      }

      logInfo('Refund processed', { 
        originalTransactionId: transactionId,
        refundTransactionId: refund.transactionId,
        amount: refund.amount,
        processedBy: req.user._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          refundTransactionId: refund.transactionId,
          originalTransactionId: transactionId,
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
          reason
        }, 'Refund processed successfully')
      );
    } catch (error) {
      logError('Process refund failed:', error);
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse(
          error instanceof Error ? error.message : 'Refund processing failed', 
          'PAYMENT_ERROR'
        )
      );
    }
  }

  /**
   * Get payment statistics
   * GET /api/payments/stats
   */
  async getPaymentStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Determine scope based on user role
      let userId: string | undefined;
      let doctorId: string | undefined;

      if (req.user?.role === 'doctor') {
        doctorId = req.user._id.toString();
      } else if (req.user?.role === 'patient') {
        userId = req.user._id.toString();
      }
      // Admin sees all stats (no filters)

      const [stats] = await Transaction.getTransactionStats(userId, doctorId);

      // Get additional analytics
      const [
        recentTransactions,
        topCurrencies,
        dailyVolume,
        networkDistribution
      ] = await Promise.all([
        this.getRecentTransactionCount(),
        this.getTopCurrencies(),
        Transaction.getDailyVolume(30),
        this.getNetworkDistribution()
      ]);

      const paymentStats = {
        ...stats,
        recentTransactions,
        topCurrencies,
        dailyVolume,
        networkDistribution
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(paymentStats, 'Payment statistics retrieved successfully')
      );
    } catch (error) {
      logError('Get payment stats failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve payment statistics', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get supported currencies and networks
   * GET /api/payments/supported
   */
  async getSupportedOptions(req: Request, res: Response): Promise<void> {
    try {
      const supportedOptions = {
        currencies: SUPPORTED_CURRENCIES,
        networks: SUPPORTED_NETWORKS,
        networkCurrencies: {
          ethereum: ['ETH', 'USDC', 'USDT'],
          polygon: ['MATIC', 'USDC', 'USDT']
        },
        minimumAmounts: {
          ETH: 0.0001,
          USDC: 0.01,
          MATIC: 0.01,
          USDT: 0.01
        },
        estimatedConfirmationTimes: {
          ethereum: '2-15 minutes',
          polygon: '10-30 seconds'
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(supportedOptions, 'Supported payment options retrieved successfully')
      );
    } catch (error) {
      logError('Get supported options failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve supported options', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get transaction receipt
   * GET /api/payments/:transactionId/receipt
   */
  async getTransactionReceipt(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;

      const transaction = await Transaction.findOne({ transactionId })
        .populate('userId', 'firstName lastName email')
        .populate('doctorId', 'firstName lastName email')
        .lean();

      if (!transaction) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Transaction not found', 'NOT_FOUND')
        );
        return;
      }

      // Check access permissions
      if (!req.user || 
          (req.user._id.toString() !== transaction.userId.toString() && 
           req.user._id.toString() !== transaction.doctorId?.toString() &&
           req.user.role !== 'admin')) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Access denied', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      // Get consultation details if applicable
      let consultationDetails;
      if (transaction.consultationId) {
        consultationDetails = await Consultation.findOne({ 
          consultationId: transaction.consultationId 
        }).select('type symptoms description scheduledDateTime');
      }

      const receipt = {
        transaction,
        consultationDetails,
        receipt: {
          receiptId: `receipt_${transaction.transactionId}`,
          generatedAt: new Date(),
          subtotal: transaction.amount,
          gasFee: transaction.gasFee,
          platformFee: transaction.platformFee,
          total: transaction.amount + transaction.gasFee + transaction.platformFee,
          tax: 0, // Add tax calculation if applicable
          paymentMethod: 'Cryptocurrency',
          network: transaction.blockchainNetwork,
          explorerUrl: transaction.transactionHash ? 
            `${transaction.blockchainNetwork === 'ethereum' ? 'https://etherscan.io' : 'https://polygonscan.com'}/tx/${transaction.transactionHash}` : 
            undefined
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(receipt, 'Transaction receipt retrieved successfully')
      );
    } catch (error) {
      logError('Get transaction receipt failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve transaction receipt', 'INTERNAL_ERROR')
      );
    }
  }

  // Private helper methods

  private async getEarningsBreakdown(doctorId: string): Promise<any> {
    try {
      const breakdown = await Transaction.aggregate([
        {
          $match: {
            doctorId,
            status: 'completed',
            type: { $in: ['video_consultation', 'home_visit'] }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              type: '$type'
            },
            earnings: { $sum: '$amount' },
            platformFees: { $sum: '$platformFee' },
            consultationCount: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]);

      return breakdown;
    } catch (error) {
      logError('Get earnings breakdown failed:', error);
      return [];
    }
  }

  private async getRecentTransactionCount(): Promise<number> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return await Transaction.countDocuments({
        createdAt: { $gte: twentyFourHoursAgo },
        status: 'completed'
      });
    } catch (error) {
      logError('Get recent transaction count failed:', error);
      return 0;
    }
  }

  private async getTopCurrencies(): Promise<Array<{ currency: string; count: number; volume: number }>> {
    try {
      const result = await Transaction.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$currency',
            count: { $sum: 1 },
            volume: { $sum: '$amount' }
          }
        },
        { $sort: { volume: -1 } },
        { $limit: 5 },
        {
          $project: {
            currency: '$_id',
            count: 1,
            volume: 1,
            _id: 0
          }
        }
      ]);

      return result;
    } catch (error) {
      logError('Get top currencies failed:', error);
      return [];
    }
  }

  private async getNetworkDistribution(): Promise<Record<string, number>> {
    try {
      const result = await Transaction.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$blockchainNetwork',
            count: { $sum: 1 }
          }
        }
      ]);

      const distribution: Record<string, number> = {
        ethereum: 0,
        polygon: 0
      };

      result.forEach(item => {
        distribution[item._id] = item.count;
      });

      return distribution;
    } catch (error) {
      logError('Get network distribution failed:', error);
      return { ethereum: 0, polygon: 0 };
    }
  }

  /**
   * Get payment service health check
   * GET /api/payments/health
   */
  async getHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const healthCheck = await PaymentService.healthCheck();

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(healthCheck, 'Payment service health check completed')
      );
    } catch (error) {
      logError('Payment health check failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Payment health check failed', 'INTERNAL_ERROR')
      );
    }
  }
}

export default new PaymentController();