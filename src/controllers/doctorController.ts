import { Request, Response } from 'express';
import { IUser, IAvailability } from '../types';
import User from '../models/User';
import Consultation from '../models/Consultation';
import PaymentService from '../services/paymentService';
import EmailService from '../services/emailService';
import { AuthRequest } from '../middleware/auth';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  calculatePagination,
  getPaginationQuery,
  getDayOfWeek,
  logInfo,
  logError
} from '../utils/helpers';
import { 
  HTTP_STATUS, 
  DEFAULT_PAGE_SIZE 
} from '../utils/constants';

class DoctorController {
  /**
   * Search doctors
   * GET /api/doctors
   */
  async searchDoctors(req: Request, res: Response): Promise<void> {
    try {
      const { 
        page = 1, 
        limit = DEFAULT_PAGE_SIZE, 
        specialization,
        location,
        availability,
        minRating,
        maxFee,
        language,
        search
      } = req.query;

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      // Build search query
      const query: any = {
        role: 'doctor',
        isActive: true,
        'doctorProfile.isVerified': true
      };

      // Filter by specialization
      if (specialization) {
        query['doctorProfile.specialization'] = { 
          $in: [new RegExp(specialization as string, 'i')] 
        };
      }

      // Filter by availability
      if (availability === 'true') {
        query['doctorProfile.isAvailable'] = true;
      }

      // Filter by minimum rating
      if (minRating) {
        query['doctorProfile.rating'] = { $gte: Number(minRating) };
      }

      // Filter by maximum consultation fee
      if (maxFee) {
        query['doctorProfile.consultationFee'] = { $lte: Number(maxFee) };
      }

      // Filter by language
      if (language) {
        query['doctorProfile.languages'] = { 
          $in: [new RegExp(language as string, 'i')] 
        };
      }

      // Text search
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { 'doctorProfile.bio': { $regex: search, $options: 'i' } },
          { 'doctorProfile.specialization': { $in: [new RegExp(search as string, 'i')] } }
        ];
      }

      // Location filter (simplified - in production, use geospatial queries)
      if (location) {
        query.$or = query.$or || [];
        query.$or.push(
          { 'address.city': { $regex: location, $options: 'i' } },
          { 'address.state': { $regex: location, $options: 'i' } },
          { 'address.country': { $regex: location, $options: 'i' } }
        );
      }

      // Get total count
      const totalDoctors = await User.countDocuments(query);

      // Get doctors with sorting
      const doctors = await User.find(query)
        .select('-signature -nonce')
        .sort({ 
          'doctorProfile.rating': -1, 
          'doctorProfile.totalReviews': -1,
          'doctorProfile.isAvailable': -1 
        })
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
          doctors: doctors.map(doctor => this.sanitizeDoctorProfile(doctor as any)),
          pagination,
          filters: {
            specialization,
            location,
            availability,
            minRating,
            maxFee,
            language
          }
        }, 'Doctors retrieved successfully')
      );
    } catch (error) {
      logError('Search doctors failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to search doctors', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get doctor profile by ID
   * GET /api/doctors/:id
   */
  async getDoctorById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const doctor = await User.findOne({
        _id: id,
        role: 'doctor',
        isActive: true
      })
      .select('-signature -nonce')
      .lean();

      if (!doctor) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Doctor not found', 'NOT_FOUND')
        );
        return;
      }

      // Get doctor's recent reviews
      const recentReviews = await Consultation.find({
        doctorId: id,
        'rating.rating': { $exists: true }
      })
      .populate('patientId', 'firstName lastName avatar')
      .select('rating createdAt')
      .sort({ 'rating.ratedAt': -1 })
      .limit(10)
      .lean();

      // Get consultation statistics
      const consultationStats = await this.getDoctorConsultationStats(id);

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          doctor: this.sanitizeDoctorProfile(doctor as any),
          recentReviews,
          stats: consultationStats
        }, 'Doctor profile retrieved successfully')
      );
    } catch (error) {
      logError('Get doctor by ID failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve doctor profile', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Update doctor availability
   * PUT /api/doctors/availability
   */
  async updateAvailability(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'doctor') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      const { availability, isAvailable } = req.body;

      const doctor = await User.findById(req.user._id);
      if (!doctor) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Doctor not found', 'NOT_FOUND')
        );
        return;
      }

      if (!doctor.doctorProfile) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Doctor profile not found', 'VALIDATION_ERROR')
        );
        return;
      }

      // Update availability schedule
      if (availability) {
        doctor.doctorProfile.availability = availability;
      }

      // Update general availability status
      if (typeof isAvailable === 'boolean') {
        doctor.doctorProfile.isAvailable = isAvailable;
      }

      await doctor.save();

      logInfo('Doctor availability updated', { 
        doctorId: doctor._id,
        isAvailable: doctor.doctorProfile.isAvailable 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          availability: doctor.doctorProfile.availability,
          isAvailable: doctor.doctorProfile.isAvailable
        }, 'Availability updated successfully')
      );
    } catch (error) {
      logError('Update doctor availability failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update availability', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get doctor reviews
   * GET /api/doctors/:id/reviews
   */
  async getDoctorReviews(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { 
        page = 1, 
        limit = DEFAULT_PAGE_SIZE,
        minRating,
        sortBy = 'newest'
      } = req.query;

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      // Build query
      const query: any = {
        doctorId: id,
        'rating.rating': { $exists: true }
      };

      if (minRating) {
        query['rating.rating'] = { $gte: Number(minRating) };
      }

      // Build sort options
      let sortOptions: any = { 'rating.ratedAt': -1 }; // Default: newest first
      
      if (sortBy === 'oldest') {
        sortOptions = { 'rating.ratedAt': 1 };
      } else if (sortBy === 'highest') {
        sortOptions = { 'rating.rating': -1, 'rating.ratedAt': -1 };
      } else if (sortBy === 'lowest') {
        sortOptions = { 'rating.rating': 1, 'rating.ratedAt': -1 };
      }

      // Get total count
      const totalReviews = await Consultation.countDocuments(query);

      // Get reviews
      const reviews = await Consultation.find(query)
        .populate('patientId', 'firstName lastName avatar')
        .select('rating createdAt consultationId type')
        .sort(sortOptions)
        .skip(skip)
        .limit(queryLimit)
        .lean();

      // Calculate rating distribution
      const ratingDistribution = await this.getRatingDistribution(id);

      const pagination = calculatePagination(
        Number(page),
        Number(limit),
        totalReviews
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          reviews: reviews.map(review => ({
            consultationId: review.consultationId,
            consultationType: review.type,
            rating: review.rating,
            patient: review.patientId,
            createdAt: review.createdAt
          })),
          ratingDistribution,
          pagination
        }, 'Doctor reviews retrieved successfully')
      );
    } catch (error) {
      logError('Get doctor reviews failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve doctor reviews', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Submit doctor verification documents
   * POST /api/doctors/verification
   */
  async submitVerification(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'doctor') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Verification documents are required', 'VALIDATION_ERROR')
        );
        return;
      }

      const doctor = await User.findById(req.user._id);
      if (!doctor || !doctor.doctorProfile) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Doctor profile not found', 'NOT_FOUND')
        );
        return;
      }

      // Store document file paths
      const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
      const documentPaths = files.map(file => `/uploads/verification/${file.filename}`);

      doctor.doctorProfile.documentsUploaded = documentPaths;
      doctor.doctorProfile.isVerified = false; // Reset verification status
      await doctor.save();

      // Notify admin about new verification request
      // In production, you would send notification to admin dashboard
      logInfo('Doctor verification documents submitted', { 
        doctorId: doctor._id,
        documentCount: documentPaths.length 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          documentsUploaded: documentPaths.length,
          status: 'under_review'
        }, 'Verification documents submitted successfully')
      );
    } catch (error) {
      logError('Submit doctor verification failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to submit verification documents', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Update doctor verification status (Admin only)
   * PUT /api/doctors/:id/verification
   */
  async updateVerificationStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'admin') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Admin access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      const { id } = req.params;
      const { isVerified, reason } = req.body;

      const doctor = await User.findOne({ _id: id, role: 'doctor' });
      if (!doctor || !doctor.doctorProfile) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Doctor not found', 'NOT_FOUND')
        );
        return;
      }

      doctor.doctorProfile.isVerified = isVerified;
      if (isVerified) {
        doctor.doctorProfile.verificationDate = new Date();
      }
      await doctor.save();

      // Send verification status email
      try {
        await EmailService.sendDoctorVerificationStatus({
          doctor,
          verificationStatus: isVerified ? 'approved' : 'rejected',
          reason,
          dashboardUrl: `${process.env.FRONTEND_URL}/doctor/dashboard`
        });
      } catch (emailError) {
        logError('Verification status email failed:', emailError);
      }

      logInfo('Doctor verification status updated', { 
        doctorId: doctor._id,
        isVerified,
        verifiedBy: req.user._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          doctorId: doctor._id,
          isVerified,
          verificationDate: doctor.doctorProfile.verificationDate
        }, `Doctor verification ${isVerified ? 'approved' : 'rejected'} successfully`)
      );
    } catch (error) {
      logError('Update verification status failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update verification status', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get doctor earnings
   * GET /api/doctors/earnings
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

      // Get earnings breakdown by period
      const [dailyEarnings, weeklyEarnings, monthlyEarnings] = await Promise.all([
        this.getEarningsByPeriod(req.user._id.toString(), 'daily'),
        this.getEarningsByPeriod(req.user._id.toString(), 'weekly'),
        this.getEarningsByPeriod(req.user._id.toString(), 'monthly')
      ]);

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          ...earnings,
          breakdown: {
            daily: dailyEarnings,
            weekly: weeklyEarnings,
            monthly: monthlyEarnings
          }
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
   * Get doctor dashboard data
   * GET /api/doctors/dashboard
   */
  async getDoctorDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'doctor') {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      const doctorId = req.user._id.toString();

      // Get dashboard data in parallel
      const [
        upcomingConsultations,
        recentConsultations,
        earnings,
        consultationStats,
        patientStats,
        ratingStats
      ] = await Promise.all([
        this.getUpcomingConsultations(doctorId),
        this.getRecentConsultations(doctorId),
        PaymentService.getDoctorEarnings(doctorId),
        this.getDoctorConsultationStats(doctorId),
        this.getDoctorPatientStats(doctorId),
        this.getDoctorRatingStats(doctorId)
      ]);

      const dashboardData = {
        upcomingConsultations,
        recentConsultations,
        earnings: {
          totalEarnings: earnings.totalEarnings,
          availableBalance: earnings.availableBalance,
          canWithdraw: earnings.canWithdraw
        },
        stats: {
          consultations: consultationStats,
          patients: patientStats,
          ratings: ratingStats
        },
        profile: {
          isVerified: req.user.doctorProfile?.isVerified || false,
          isAvailable: req.user.doctorProfile?.isAvailable || false,
          completionRate: consultationStats.completionRate
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(dashboardData, 'Doctor dashboard data retrieved successfully')
      );
    } catch (error) {
      logError('Get doctor dashboard failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve dashboard data', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get available time slots for a doctor
   * GET /api/doctors/:id/availability
   */
  async getDoctorAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { date } = req.query;

      if (!date) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Date parameter is required', 'VALIDATION_ERROR')
        );
        return;
      }

      const doctor = await User.findOne({
        _id: id,
        role: 'doctor',
        'doctorProfile.isVerified': true,
        'doctorProfile.isAvailable': true
      });

      if (!doctor) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Doctor not found or not available', 'NOT_FOUND')
        );
        return;
      }

      const requestedDate = new Date(date as string);
      const dayOfWeek = getDayOfWeek(requestedDate);

      // Get doctor's availability for the day
      const dayAvailability = doctor.doctorProfile?.availability?.find(
        avail => avail.day === dayOfWeek
      );

      if (!dayAvailability) {
        res.status(HTTP_STATUS.OK).json(
          createSuccessResponse({
            date,
            availableSlots: [],
            doctorNotAvailable: true
          }, 'Doctor is not available on this day')
        );
        return;
      }

      // Get existing appointments for the date
      const existingAppointments = await Consultation.find({
        doctorId: id,
        scheduledDateTime: {
          $gte: new Date(requestedDate.setHours(0, 0, 0, 0)),
          $lt: new Date(requestedDate.setHours(23, 59, 59, 999))
        },
        status: { $in: ['pending', 'confirmed', 'in_progress'] }
      }).select('scheduledDateTime duration');

      // Generate available time slots
      const availableSlots = this.generateTimeSlots(
        dayAvailability,
        existingAppointments,
        requestedDate
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          date,
          doctorId: id,
          availableSlots,
          workingHours: {
            start: dayAvailability.startTime,
            end: dayAvailability.endTime
          }
        }, 'Doctor availability retrieved successfully')
      );
    } catch (error) {
      logError('Get doctor availability failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve doctor availability', 'INTERNAL_ERROR')
      );
    }
  }

  // Private helper methods

  private sanitizeDoctorProfile(doctor: IUser): any {
    return {
      _id: doctor._id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      avatar: doctor.avatar,
      address: doctor.address,
      doctorProfile: {
        specialization: doctor.doctorProfile?.specialization,
        yearsExperience: doctor.doctorProfile?.yearsExperience,
        education: doctor.doctorProfile?.education,
        certifications: doctor.doctorProfile?.certifications,
        languages: doctor.doctorProfile?.languages,
        consultationFee: doctor.doctorProfile?.consultationFee,
        homeVisitFee: doctor.doctorProfile?.homeVisitFee,
        bio: doctor.doctorProfile?.bio,
        rating: doctor.doctorProfile?.rating,
        totalReviews: doctor.doctorProfile?.totalReviews,
        isAvailable: doctor.doctorProfile?.isAvailable,
        isVerified: doctor.doctorProfile?.isVerified,
        verificationDate: doctor.doctorProfile?.verificationDate
      }
    };
  }

  private async getDoctorConsultationStats(doctorId: string): Promise<any> {
    try {
      const [total, completed, cancelled, averageRating] = await Promise.all([
        Consultation.countDocuments({ doctorId }),
        Consultation.countDocuments({ doctorId, status: 'completed' }),
        Consultation.countDocuments({ doctorId, status: 'cancelled' }),
        Consultation.aggregate([
          { $match: { doctorId, 'rating.rating': { $exists: true } } },
          { $group: { _id: null, averageRating: { $avg: '$rating.rating' } } }
        ])
      ]);

      return {
        total,
        completed,
        cancelled,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        cancellationRate: total > 0 ? (cancelled / total) * 100 : 0,
        averageRating: averageRating[0]?.averageRating || 0
      };
    } catch (error) {
      logError('Get doctor consultation stats failed:', error);
      return {
        total: 0,
        completed: 0,
        cancelled: 0,
        completionRate: 0,
        cancellationRate: 0,
        averageRating: 0
      };
    }
  }

  private async getRatingDistribution(doctorId: string): Promise<Record<number, number>> {
    try {
      const distribution = await Consultation.aggregate([
        { $match: { doctorId, 'rating.rating': { $exists: true } } },
        { $group: { _id: '$rating.rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);

      const result: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      distribution.forEach(item => {
        result[item._id] = item.count;
      });

      return result;
    } catch (error) {
      logError('Get rating distribution failed:', error);
      return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    }
  }

  private async getEarningsByPeriod(doctorId: string, period: 'daily' | 'weekly' | 'monthly'): Promise<number> {
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

      const result = await Consultation.aggregate([
        {
          $match: {
            doctorId,
            'payment.status': 'completed',
            createdAt: { $gte: startDate }
          }
        },
        { $group: { _id: null, total: { $sum: '$payment.doctorEarnings' } } }
      ]);

      return result[0]?.total || 0;
    } catch (error) {
      logError(`Get ${period} earnings failed:`, error);
      return 0;
    }
  }

  private async getUpcomingConsultations(doctorId: string): Promise<any[]> {
    try {
      return await Consultation.find({
        doctorId,
        scheduledDateTime: { $gte: new Date() },
        status: { $in: ['pending', 'confirmed'] }
      })
      .populate('patientId', 'firstName lastName avatar')
      .sort({ scheduledDateTime: 1 })
      .limit(5)
      .lean();
    } catch (error) {
      logError('Get upcoming consultations failed:', error);
      return [];
    }
  }

  private async getRecentConsultations(doctorId: string): Promise<any[]> {
    try {
      return await Consultation.find({
        doctorId,
        status: 'completed'
      })
      .populate('patientId', 'firstName lastName avatar')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    } catch (error) {
      logError('Get recent consultations failed:', error);
      return [];
    }
  }

  private async getDoctorPatientStats(doctorId: string): Promise<any> {
    try {
      const uniquePatients = await Consultation.distinct('patientId', { doctorId });
      const returningPatients = await Consultation.aggregate([
        { $match: { doctorId } },
        { $group: { _id: '$patientId', consultationCount: { $sum: 1 } } },
        { $match: { consultationCount: { $gt: 1 } } },
        { $count: 'returningPatients' }
      ]);

      return {
        totalPatients: uniquePatients.length,
        returningPatients: returningPatients[0]?.returningPatients || 0,
        retentionRate: uniquePatients.length > 0 ? 
          ((returningPatients[0]?.returningPatients || 0) / uniquePatients.length) * 100 : 0
      };
    } catch (error) {
      logError('Get doctor patient stats failed:', error);
      return {
        totalPatients: 0,
        returningPatients: 0,
        retentionRate: 0
      };
    }
  }

  private async getDoctorRatingStats(doctorId: string): Promise<any> {
    try {
      const ratingStats = await Consultation.aggregate([
        { $match: { doctorId, 'rating.rating': { $exists: true } } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating.rating' },
            totalRatings: { $sum: 1 },
            fiveStarRatings: { $sum: { $cond: [{ $eq: ['$rating.rating', 5] }, 1, 0] } }
          }
        }
      ]);

      const stats = ratingStats[0] || { averageRating: 0, totalRatings: 0, fiveStarRatings: 0 };
      
      return {
        averageRating: stats.averageRating,
        totalRatings: stats.totalRatings,
        fiveStarPercentage: stats.totalRatings > 0 ? 
          (stats.fiveStarRatings / stats.totalRatings) * 100 : 0
      };
    } catch (error) {
      logError('Get doctor rating stats failed:', error);
      return {
        averageRating: 0,
        totalRatings: 0,
        fiveStarPercentage: 0
      };
    }
  }

  private generateTimeSlots(
    availability: IAvailability,
    existingAppointments: any[],
    date: Date
  ): Array<{ startTime: string; endTime: string; available: boolean }> {
    const slots: Array<{ startTime: string; endTime: string; available: boolean }> = [];
    const slotDuration = 30; // 30 minutes per slot

    const startTime = new Date(`${date.toDateString()} ${availability.startTime}`);
    const endTime = new Date(`${date.toDateString()} ${availability.endTime}`);

    let currentTime = new Date(startTime);
    
    while (currentTime < endTime) {
      const slotStart = new Date(currentTime);
      const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);

      // Check if slot conflicts with existing appointments
      const isAvailable = !existingAppointments.some(appointment => {
        const appointmentStart = new Date(appointment.scheduledDateTime);
        const appointmentEnd = new Date(appointmentStart.getTime() + (appointment.duration || 30) * 60000);
        
        return slotStart < appointmentEnd && slotEnd > appointmentStart;
      });

      slots.push({
        startTime: slotStart.toTimeString().slice(0, 5),
        endTime: slotEnd.toTimeString().slice(0, 5),
        available: isAvailable
      });

      currentTime = slotEnd;
    }

    return slots;
  }
}

export default new DoctorController();