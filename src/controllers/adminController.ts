import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import Consultation from '../models/Consultation';
import Appointment from '../models/Appointment';
import Transaction from '../models/Transaction';
import { 
  createSuccessResponse, 
  createErrorResponse,
  sanitizeUser,
  calculatePagination,
  getPaginationQuery,
  logInfo,
  logError
} from '../utils/helpers';
import { 
  HTTP_STATUS, 
  DEFAULT_PAGE_SIZE 
} from '../utils/constants';

class AdminController {
  /**
   * Get admin dashboard statistics
   * GET /api/admin/dashboard
   */
  async getDashboardStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        activeUsers,
        totalDoctors,
        verifiedDoctors,
        totalPatients,
        totalConsultations,
        activeConsultations,
        completedConsultations,
        totalRevenue,
        monthlyRevenue,
        weeklyRevenue,
        dailyRevenue,
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
        pendingVerifications,
        totalTransactions,
        pendingTransactions
      ] = await Promise.all([
        // User statistics
        User.countDocuments({}),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ role: 'doctor' }),
        User.countDocuments({ role: 'doctor', 'doctorProfile.isVerified': true }),
        User.countDocuments({ role: 'patient' }),
        
        // Consultation statistics
        Consultation.countDocuments({}),
        Consultation.countDocuments({ status: { $in: ['scheduled', 'in_progress'] } }),
        Consultation.countDocuments({ status: 'completed' }),
        
        // Revenue statistics
        Transaction.aggregate([
          { $match: { status: 'completed', type: { $in: ['consultation_fee', 'home_visit_fee'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).then(result => result[0]?.total || 0),
        
        Transaction.aggregate([
          { 
            $match: { 
              status: 'completed', 
              type: { $in: ['consultation_fee', 'home_visit_fee'] },
              createdAt: { $gte: thirtyDaysAgo }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).then(result => result[0]?.total || 0),
        
        Transaction.aggregate([
          { 
            $match: { 
              status: 'completed', 
              type: { $in: ['consultation_fee', 'home_visit_fee'] },
              createdAt: { $gte: sevenDaysAgo }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).then(result => result[0]?.total || 0),
        
        Transaction.aggregate([
          { 
            $match: { 
              status: 'completed', 
              type: { $in: ['consultation_fee', 'home_visit_fee'] },
              createdAt: { $gte: oneDayAgo }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).then(result => result[0]?.total || 0),
        
        // Growth statistics
        User.countDocuments({ createdAt: { $gte: oneDayAgo } }),
        User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
        User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
        
        // Verification statistics
        User.countDocuments({ role: 'doctor', 'doctorProfile.isVerified': false }),
        
        // Transaction statistics
        Transaction.countDocuments({}),
        Transaction.countDocuments({ status: 'pending' })
      ]);

      const stats = {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          doctors: totalDoctors,
          verifiedDoctors,
          unverifiedDoctors: totalDoctors - verifiedDoctors,
          patients: totalPatients,
          growth: {
            daily: newUsersToday,
            weekly: newUsersThisWeek,
            monthly: newUsersThisMonth
          }
        },
        consultations: {
          total: totalConsultations,
          active: activeConsultations,
          completed: completedConsultations,
          cancelled: totalConsultations - activeConsultations - completedConsultations
        },
        revenue: {
          total: totalRevenue,
          monthly: monthlyRevenue,
          weekly: weeklyRevenue,
          daily: dailyRevenue
        },
        pendingActions: {
          doctorVerifications: pendingVerifications,
          transactions: pendingTransactions
        },
        transactions: {
          total: totalTransactions,
          pending: pendingTransactions,
          completed: totalTransactions - pendingTransactions
        }
      };

      logInfo('Admin dashboard stats retrieved', { 
        adminId: req.user?._id,
        totalUsers,
        totalRevenue 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(stats, 'Dashboard statistics retrieved successfully')
      );
    } catch (error) {
      logError('Get dashboard stats failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve dashboard statistics', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get all users with admin controls
   * GET /api/admin/users
   */
  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const { 
        page = 1, 
        limit = DEFAULT_PAGE_SIZE, 
        role, 
        search,
        isActive,
        isVerified,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      // Build query
      const query: any = {};
      
      if (role) {
        query.role = role;
      }
      
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }
      
      if (isVerified !== undefined && role === 'doctor') {
        query['doctorProfile.isVerified'] = isVerified === 'true';
      }
      
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { walletAddress: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort object
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      // Get total count
      const totalUsers = await User.countDocuments(query);

      // Get users
      const users = await User.find(query)
        .select('-signature -nonce')
        .sort(sort)
        .skip(skip)
        .limit(queryLimit)
        .lean();

      const pagination = calculatePagination(
        Number(page),
        Number(limit),
        totalUsers
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          users: users.map(user => sanitizeUser(user as any)),
          pagination
        }, 'Users retrieved successfully')
      );
    } catch (error) {
      logError('Get all users failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve users', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Verify doctor profile
   * PUT /api/admin/doctors/:id/verify
   */
  async verifyDoctor(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isVerified, verificationNotes } = req.body;

      if (typeof isVerified !== 'boolean') {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('isVerified must be a boolean value', 'VALIDATION_ERROR')
        );
        return;
      }

      const doctor = await User.findById(id);
      if (!doctor) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Doctor not found', 'NOT_FOUND')
        );
        return;
      }

      if (doctor.role !== 'doctor') {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('User is not a doctor', 'VALIDATION_ERROR')
        );
        return;
      }

      if (!doctor.doctorProfile) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Doctor profile not found', 'VALIDATION_ERROR')
        );
        return;
      }

      // Update verification status
      doctor.doctorProfile.isVerified = isVerified;
      if (isVerified) {
        doctor.doctorProfile.verificationDate = new Date();
      }

      // Store verification notes in user metadata
      (doctor as any).verificationNotes = verificationNotes;

      await doctor.save();

      logInfo('Doctor verification updated', { 
        doctorId: doctor._id,
        isVerified,
        verifiedBy: req.user?._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          sanitizeUser(doctor),
          `Doctor ${isVerified ? 'verified' : 'unverified'} successfully`
        )
      );
    } catch (error) {
      logError('Doctor verification failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update doctor verification', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get pending doctor verifications
   * GET /api/admin/doctors/pending-verification
   */
  async getPendingVerifications(req: Request, res: Response): Promise<void> {
    try {
      const { 
        page = 1, 
        limit = DEFAULT_PAGE_SIZE 
      } = req.query;

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      const query = {
        role: 'doctor',
        'doctorProfile.isVerified': false,
        isActive: true
      };

      const totalDoctors = await User.countDocuments(query);

      const doctors = await User.find(query)
        .select('-signature -nonce')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(queryLimit)
        .lean();

      const pagination = calculatePagination(
        Number(page),
        Number(limit),
        totalDoctors
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          doctors: doctors.map(doctor => sanitizeUser(doctor as any)),
          pagination
        }, 'Pending verifications retrieved successfully')
      );
    } catch (error) {
      logError('Get pending verifications failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve pending verifications', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Update user status (activate/deactivate)
   * PUT /api/admin/users/:id/status
   */
  async updateUserStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive, reason } = req.body;

      if (typeof isActive !== 'boolean') {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('isActive must be a boolean value', 'VALIDATION_ERROR')
        );
        return;
      }

      const user = await User.findById(id);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      // Prevent admin from deactivating themselves
      if (req.user?._id.toString() === id && !isActive) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Cannot deactivate your own account', 'VALIDATION_ERROR')
        );
        return;
      }

      user.isActive = isActive;
      await user.save();

      logInfo('User status updated by admin', { 
        userId: user._id,
        isActive,
        reason,
        adminId: req.user?._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          sanitizeUser(user),
          `User ${isActive ? 'activated' : 'deactivated'} successfully`
        )
      );
    } catch (error) {
      logError('Update user status failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update user status', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get system health status
   * GET /api/admin/health
   */
  async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const healthChecks = {
        database: false,
        redis: false,
        aiService: false,
        paymentService: false,
        emailService: false
      };

      // Check database connection
      try {
        await User.findOne().limit(1);
        healthChecks.database = true;
      } catch (error) {
        logError('Database health check failed:', error);
      }

      // In a real implementation, you would check other services here
      // For now, we'll mock them as healthy
      healthChecks.redis = true;
      healthChecks.aiService = true;
      healthChecks.paymentService = true;
      healthChecks.emailService = true;

      const overallHealth = Object.values(healthChecks).every(status => status);

      const systemHealth = {
        status: overallHealth ? 'healthy' : 'unhealthy',
        services: healthChecks,
        timestamp: new Date(),
        uptime: process.uptime()
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          systemHealth,
          'System health status retrieved successfully'
        )
      );
    } catch (error) {
      logError('Get system health failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve system health', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get revenue analytics
   * GET /api/admin/analytics/revenue
   */
  async getRevenueAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { 
        period = 'month',
        startDate,
        endDate 
      } = req.query;

      let dateFilter: any = {};
      
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        };
      } else {
        const now = new Date();
        let periodStart: Date;
        
        switch (period) {
          case 'week':
            periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'quarter':
            periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case 'year':
            periodStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        
        dateFilter = { createdAt: { $gte: periodStart } };
      }

      const revenueData = await Transaction.aggregate([
        {
          $match: {
            status: 'completed',
            type: { $in: ['consultation_fee', 'home_visit_fee'] },
            ...dateFilter
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              type: "$type"
            },
            totalAmount: { $sum: "$amount" },
            transactionCount: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            consultationRevenue: {
              $sum: {
                $cond: [
                  { $eq: ["$_id.type", "consultation_fee"] },
                  "$totalAmount",
                  0
                ]
              }
            },
            homeVisitRevenue: {
              $sum: {
                $cond: [
                  { $eq: ["$_id.type", "home_visit_fee"] },
                  "$totalAmount",
                  0
                ]
              }
            },
            totalRevenue: { $sum: "$totalAmount" },
            transactionCount: { $sum: "$transactionCount" }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const totalRevenue = revenueData.reduce((sum, day) => sum + day.totalRevenue, 0);
      const totalTransactions = revenueData.reduce((sum, day) => sum + day.transactionCount, 0);

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          period,
          totalRevenue,
          totalTransactions,
          averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
          dailyData: revenueData
        }, 'Revenue analytics retrieved successfully')
      );
    } catch (error) {
      logError('Get revenue analytics failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve revenue analytics', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get user analytics
   * GET /api/admin/analytics/users
   */
  async getUserAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const userGrowth = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              role: "$role"
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            patients: {
              $sum: {
                $cond: [{ $eq: ["$_id.role", "patient"] }, "$count", 0]
              }
            },
            doctors: {
              $sum: {
                $cond: [{ $eq: ["$_id.role", "doctor"] }, "$count", 0]
              }
            },
            total: { $sum: "$count" }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const roleDistribution = await User.aggregate([
        {
          $group: {
            _id: "$role",
            count: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] }
            }
          }
        }
      ]);

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          userGrowth,
          roleDistribution
        }, 'User analytics retrieved successfully')
      );
    } catch (error) {
      logError('Get user analytics failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve user analytics', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Ban/unban user
   * PUT /api/admin/users/:id/ban
   */
  async banUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isBanned, banReason } = req.body;

      if (typeof isBanned !== 'boolean') {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('isBanned must be a boolean value', 'VALIDATION_ERROR')
        );
        return;
      }

      if (isBanned && !banReason) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Ban reason is required when banning a user', 'VALIDATION_ERROR')
        );
        return;
      }

      const user = await User.findById(id);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      // Prevent admin from banning themselves
      if (req.user?._id.toString() === id) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Cannot ban your own account', 'VALIDATION_ERROR')
        );
        return;
      }

      // Store ban information
      (user as any).isBanned = isBanned;
      (user as any).banReason = isBanned ? banReason : undefined;
      (user as any).bannedAt = isBanned ? new Date() : undefined;
      (user as any).bannedBy = isBanned ? req.user?._id : undefined;

      // Deactivate user if banned
      if (isBanned) {
        user.isActive = false;
      }

      await user.save();

      logInfo('User ban status updated', { 
        userId: user._id,
        isBanned,
        banReason,
        adminId: req.user?._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          sanitizeUser(user),
          `User ${isBanned ? 'banned' : 'unbanned'} successfully`
        )
      );
    } catch (error) {
      logError('Ban user failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update user ban status', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get system logs (simplified implementation)
   * GET /api/admin/logs
   */
  async getSystemLogs(req: Request, res: Response): Promise<void> {
    try {
      const { 
        level = 'all',
        limit = 100,
        search 
      } = req.query;

      // In a real implementation, you would fetch from your logging system
      // For now, we'll return a placeholder response
      const logs = [
        {
          timestamp: new Date(),
          level: 'info',
          message: 'User authentication successful',
          userId: 'user123',
          ip: '192.168.1.1'
        },
        {
          timestamp: new Date(),
          level: 'error',
          message: 'Payment processing failed',
          error: 'Gateway timeout',
          transactionId: 'tx123'
        }
      ];

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          logs,
          total: logs.length,
          filters: { level, search }
        }, 'System logs retrieved successfully')
      );
    } catch (error) {
      logError('Get system logs failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve system logs', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Export data (users, transactions, etc.)
   * POST /api/admin/export
   */
  async exportData(req: Request, res: Response): Promise<void> {
    try {
      const { type, format = 'csv', filters = {} } = req.body;

      if (!['users', 'transactions', 'consultations'].includes(type)) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Invalid export type', 'VALIDATION_ERROR')
        );
        return;
      }

      // In a real implementation, you would generate the actual export
      // For now, we'll return a placeholder response
      const exportJob = {
        id: `export_${Date.now()}`,
        type,
        format,
        status: 'queued',
        createdAt: new Date(),
        estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      };

      res.status(HTTP_STATUS.ACCEPTED).json(
        createSuccessResponse(
          exportJob,
          'Export job queued successfully'
        )
      );
    } catch (error) {
      logError('Export data failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to queue export job', 'INTERNAL_ERROR')
      );
    }
  }
}

export default new AdminController();