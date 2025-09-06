import { Request, Response } from 'express';
import { IUser, IUserUpdate, IDoctorProfileUpdate } from '../types';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
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

class UserController {
  /**
   * Get user profile
   * GET /api/users/profile
   */
  async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const user = await User.findById(req.user._id)
        .select('-signature -nonce')
        .lean();

      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          sanitizeUser(user as any),
          'Profile retrieved successfully'
        )
      );
    } catch (error) {
      logError('Get profile failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve profile', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Update user profile
   * PUT /api/users/profile
   */
  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const updateData: IUserUpdate = req.body;

      // Find and update user
      const user = await User.findById(req.user._id);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      // Update allowed fields
      const allowedFields: (keyof IUserUpdate)[] = [
        'firstName', 'lastName', 'email', 'phone', 'dateOfBirth',
        'gender', 'address', 'allergies', 'currentMedications', 'emergencyContact'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          (user as any)[field] = updateData[field];
        }
      });

      await user.save();

      logInfo('User profile updated', { 
        userId: user._id,
        updatedFields: Object.keys(updateData)
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          sanitizeUser(user),
          'Profile updated successfully'
        )
      );
    } catch (error) {
      logError('Update profile failed:', error);
      
      if (error instanceof Error && error.message.includes('duplicate key')) {
        res.status(HTTP_STATUS.CONFLICT).json(
          createErrorResponse('Email already exists', 'DUPLICATE_ENTRY')
        );
      } else {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse('Failed to update profile', 'INTERNAL_ERROR')
        );
      }
    }
  }

  /**
   * Update doctor profile
   * PUT /api/users/doctor-profile
   */
  async updateDoctorProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      if (req.user.role !== 'doctor') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      const profileData: IDoctorProfileUpdate = req.body;

      const user = await User.findById(req.user._id);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      // Initialize doctor profile if it doesn't exist
      if (!user.doctorProfile) {
        user.doctorProfile = {
          specialization: [],
          licenseNumber: '',
          yearsExperience: 0,
          education: [],
          certifications: [],
          languages: [],
          consultationFee: 0,
          homeVisitFee: 0,
          isVerified: false,
          rating: 0,
          totalReviews: 0,
          isAvailable: true,
          availability: [],
          documentsUploaded: []
        };
      }

      // Update doctor profile fields
      const allowedFields: (keyof IDoctorProfileUpdate)[] = [
        'specialization', 'licenseNumber', 'yearsExperience', 'education',
        'certifications', 'languages', 'consultationFee', 'homeVisitFee',
        'bio', 'availability'
      ];

      allowedFields.forEach(field => {
        if (profileData[field] !== undefined) {
          (user.doctorProfile as any)[field] = profileData[field];
        }
      });

      await user.save();

      logInfo('Doctor profile updated', { 
        userId: user._id,
        updatedFields: Object.keys(profileData)
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          sanitizeUser(user),
          'Doctor profile updated successfully'
        )
      );
    } catch (error) {
      logError('Update doctor profile failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update doctor profile', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Add medical history entry
   * POST /api/users/medical-history
   */
  async addMedicalHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const { condition, diagnosedDate, notes } = req.body;

      if (!condition || !diagnosedDate) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Condition and diagnosed date are required', 'VALIDATION_ERROR')
        );
        return;
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      await user.addMedicalHistory(condition, new Date(diagnosedDate), notes);

      logInfo('Medical history added', { 
        userId: user._id,
        condition 
      });

      res.status(HTTP_STATUS.CREATED).json(
        createSuccessResponse(
          sanitizeUser(user),
          'Medical history added successfully'
        )
      );
    } catch (error) {
      logError('Add medical history failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to add medical history', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Upload avatar
   * POST /api/users/avatar
   */
  async uploadAvatar(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      if (!req.file) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Avatar file is required', 'VALIDATION_ERROR')
        );
        return;
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      // In production, you would upload to cloud storage (AWS S3, etc.)
      // For now, we'll store the file path
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      user.avatar = avatarUrl;
      await user.save();

      logInfo('Avatar uploaded', { 
        userId: user._id,
        filename: req.file.filename 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          avatarUrl,
          user: sanitizeUser(user)
        }, 'Avatar uploaded successfully')
      );
    } catch (error) {
      logError('Avatar upload failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to upload avatar', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get user by ID (Admin only)
   * GET /api/users/:id
   */
  async getUserById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const user = await User.findById(id)
        .select('-signature -nonce')
        .lean();

      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          sanitizeUser(user as any),
          'User retrieved successfully'
        )
      );
    } catch (error) {
      logError('Get user by ID failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve user', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get all users (Admin only)
   * GET /api/users
   */
  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const { 
        page = 1, 
        limit = DEFAULT_PAGE_SIZE, 
        role, 
        search,
        isActive 
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
      
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      // Get total count
      const totalUsers = await User.countDocuments(query);

      // Get users
      const users = await User.find(query)
        .select('-signature -nonce')
        .sort({ createdAt: -1 })
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
   * Update user status (Admin only)
   * PUT /api/users/:id/status
   */
  async updateUserStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

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

      user.isActive = isActive;
      await user.save();

      logInfo('User status updated', { 
        userId: user._id,
        isActive,
        adminAction: true 
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
   * Delete user account
   * DELETE /api/users/:id
   */
  async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Only allow users to delete their own account or admin to delete any
      if (req.user?.role !== 'admin' && req.user?._id.toString() !== id) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Insufficient permissions', 'AUTHORIZATION_ERROR')
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

      // Soft delete by setting isActive to false
      user.isActive = false;
      await user.save();

      logInfo('User account deleted', { 
        userId: user._id,
        deletedBy: req.user?._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(null, 'Account deleted successfully')
      );
    } catch (error) {
      logError('Delete user failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to delete user', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get user statistics
   * GET /api/users/stats
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const [
        totalUsers,
        activeUsers,
        patients,
        doctors,
        verifiedDoctors,
        recentUsers
      ] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ role: 'patient' }),
        User.countDocuments({ role: 'doctor' }),
        User.countDocuments({ 
          role: 'doctor', 
          'doctorProfile.isVerified': true 
        }),
        User.countDocuments({ 
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
        })
      ]);

      const stats = {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        patients,
        doctors,
        verifiedDoctors,
        unverifiedDoctors: doctors - verifiedDoctors,
        recentUsers, // Last 30 days
        userGrowth: {
          daily: await this.getUserGrowthStats('daily'),
          weekly: await this.getUserGrowthStats('weekly'),
          monthly: await this.getUserGrowthStats('monthly')
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(stats, 'User statistics retrieved successfully')
      );
    } catch (error) {
      logError('Get user stats failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve user statistics', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Search users
   * GET /api/users/search
   */
  async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const { 
        q, 
        role, 
        specialization,
        isAvailable,
        page = 1, 
        limit = DEFAULT_PAGE_SIZE 
      } = req.query;

      if (!q) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Search query is required', 'VALIDATION_ERROR')
        );
        return;
      }

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      // Build search query
      const searchQuery: any = {
        $or: [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } }
        ]
      };

      if (role) {
        searchQuery.role = role;
      }

      if (specialization && role === 'doctor') {
        searchQuery['doctorProfile.specialization'] = { 
          $in: [new RegExp(specialization as string, 'i')] 
        };
      }

      if (isAvailable === 'true' && role === 'doctor') {
        searchQuery['doctorProfile.isAvailable'] = true;
        searchQuery['doctorProfile.isVerified'] = true;
      }

      // Get total count
      const totalResults = await User.countDocuments(searchQuery);

      // Get users
      const users = await User.find(searchQuery)
        .select('-signature -nonce')
        .sort({ 
          'doctorProfile.rating': -1, 
          'doctorProfile.totalReviews': -1,
          createdAt: -1 
        })
        .skip(skip)
        .limit(queryLimit)
        .lean();

      const pagination = calculatePagination(
        Number(page),
        Number(limit),
        totalResults
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          users: users.map(user => sanitizeUser(user as any)),
          pagination,
          searchQuery: q
        }, 'Search results retrieved successfully')
      );
    } catch (error) {
      logError('User search failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Search failed', 'INTERNAL_ERROR')
      );
    }
  }

  // Private helper methods

  private async getUserGrowthStats(period: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    try {
      let startDate: Date;
      const now = new Date();

      switch (period) {
        case 'daily':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      return await User.countDocuments({
        createdAt: { $gte: startDate }
      });
    } catch (error) {
      logError(`Get ${period} user growth failed:`, error);
      return 0;
    }
  }

  /**
   * Update user notification preferences
   * PUT /api/users/notification-preferences
   */
  async updateNotificationPreferences(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const { preferences } = req.body;

      const user = await User.findById(req.user._id);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      // Store notification preferences in user metadata
      (user as any).notificationPreferences = preferences;
      await user.save();

      logInfo('Notification preferences updated', { 
        userId: user._id,
        preferences 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          { preferences },
          'Notification preferences updated successfully'
        )
      );
    } catch (error) {
      logError('Update notification preferences failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update notification preferences', 'INTERNAL_ERROR')
      );
    }
  }
}

export default new UserController();