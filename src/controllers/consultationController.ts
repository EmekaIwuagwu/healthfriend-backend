import { Request, Response } from 'express';
import { 
  IConsultation, 
  IConsultationRequest, 
  IConsultationUpdate,
  IPrescription 
} from '../types';
import Consultation from '../models/Consultation';
import User from '../models/User';
import PaymentService from '../services/paymentService';
import EmailService from '../services/emailService';
import { AuthRequest } from '../middleware/auth';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  generateConsultationId,
  calculatePagination,
  getPaginationQuery,
  logInfo,
  logError
} from '../utils/helpers';
import { 
  HTTP_STATUS, 
  DEFAULT_PAGE_SIZE,
  CONSULTATION_STATUS 
} from '../utils/constants';

class ConsultationController {
  /**
   * Create a new consultation
   * POST /api/consultations
   */
  async createConsultation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const consultationData: IConsultationRequest = req.body;

      // Validate doctor availability for video calls and home visits
      if (consultationData.type !== 'ai_chat' && consultationData.doctorId) {
        const doctor = await User.findById(consultationData.doctorId);
        if (!doctor || doctor.role !== 'doctor' || !doctor.doctorProfile?.isVerified) {
          res.status(HTTP_STATUS.BAD_REQUEST).json(
            createErrorResponse('Invalid or unverified doctor', 'VALIDATION_ERROR')
          );
          return;
        }

        if (!doctor.doctorProfile.isAvailable) {
          res.status(HTTP_STATUS.BAD_REQUEST).json(
            createErrorResponse('Doctor is not available', 'VALIDATION_ERROR')
          );
          return;
        }
      }

      // Calculate consultation fee
      const doctorFee = consultationData.doctorId ? 
        (await User.findById(consultationData.doctorId))?.doctorProfile?.consultationFee : 
        undefined;
      
      const feeCalculation = PaymentService.calculateConsultationFees(
        consultationData.type,
        consultationData.type === 'home_visit' ? 
          (await User.findById(consultationData.doctorId))?.doctorProfile?.homeVisitFee : 
          doctorFee,
        consultationData.paymentCurrency
      );

      // Create consultation
      const consultation = new Consultation({
        consultationId: generateConsultationId(),
        type: consultationData.type,
        patientId: req.user._id,
        doctorId: consultationData.doctorId,
        scheduledDateTime: consultationData.scheduledDateTime,
        symptoms: consultationData.symptoms,
        description: consultationData.description,
        status: 'pending',
        followUpRequired: false,
        payment: {
          amount: feeCalculation.totalFee,
          currency: consultationData.paymentCurrency,
          gasFee: feeCalculation.gasFee,
          platformFee: feeCalculation.platformFee,
          doctorEarnings: feeCalculation.doctorEarnings,
          status: 'pending',
          blockchainNetwork: 'ethereum', // Default network
          paymentMethod: 'wallet'
        },
        homeVisitDetails: consultationData.type === 'home_visit' ? {
          address: consultationData.homeVisitAddress!,
          estimatedArrival: consultationData.scheduledDateTime!,
          travelFee: 0 // Calculate based on distance
        } : undefined,
        videoCallDetails: consultationData.type === 'video_call' ? {
          sessionId: `session_${Date.now()}`,
          roomId: `room_${generateConsultationId()}`,
          participantsJoined: []
        } : undefined
      });

      await consultation.save();

      // Create payment transaction
      const paymentTransaction = await PaymentService.createPaymentTransaction({
        userId: req.user._id.toString(),
        doctorId: consultationData.doctorId,
        consultationId: consultation.consultationId,
        type: consultationData.type,
        amount: feeCalculation.totalFee,
        currency: consultationData.paymentCurrency,
        blockchainNetwork: 'ethereum',
        fromAddress: req.user.walletAddress,
        metadata: {
          description: `${consultationData.type} consultation payment`,
          category: 'consultation'
        }
      });

      logInfo('Consultation created', { 
        consultationId: consultation.consultationId,
        type: consultationData.type,
        patientId: req.user._id,
        doctorId: consultationData.doctorId 
      });

      res.status(HTTP_STATUS.CREATED).json(
        createSuccessResponse({
          consultation,
          paymentDetails: {
            transactionId: paymentTransaction.transactionId,
            amount: feeCalculation.totalFee,
            currency: consultationData.paymentCurrency,
            breakdown: feeCalculation
          }
        }, 'Consultation created successfully')
      );
    } catch (error) {
      logError('Create consultation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to create consultation', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get consultation by ID
   * GET /api/consultations/:id
   */
  async getConsultationById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const consultation = await Consultation.findOne({ consultationId: id })
        .populate('patientId', 'firstName lastName email avatar')
        .populate('doctorId', 'firstName lastName email avatar doctorProfile.specialization doctorProfile.rating')
        .lean();

      if (!consultation) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Consultation not found', 'NOT_FOUND')
        );
        return;
      }

      // Check access permissions
      if (!req.user || 
          (req.user._id.toString() !== consultation.patientId.toString() && 
           req.user._id.toString() !== consultation.doctorId?.toString() &&
           req.user.role !== 'admin')) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Access denied', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(consultation, 'Consultation retrieved successfully')
      );
    } catch (error) {
      logError('Get consultation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve consultation', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get user consultations
   * GET /api/consultations
   */
  async getUserConsultations(req: AuthRequest, res: Response): Promise<void> {
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
        status,
        type,
        dateFrom,
        dateTo 
      } = req.query;

      const { skip, limit: queryLimit } = getPaginationQuery(
        Number(page), 
        Number(limit)
      );

      // Build query based on user role
      const query: any = {};
      
      if (req.user.role === 'patient') {
        query.patientId = req.user._id;
      } else if (req.user.role === 'doctor') {
        query.doctorId = req.user._id;
      } else if (req.user.role === 'admin') {
        // Admin can see all consultations
      }

      // Add filters
      if (status) {
        query.status = status;
      }
      
      if (type) {
        query.type = type;
      }
      
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
        if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
      }

      // Get total count
      const totalConsultations = await Consultation.countDocuments(query);

      // Get consultations
      const consultations = await Consultation.find(query)
        .populate('patientId', 'firstName lastName email avatar')
        .populate('doctorId', 'firstName lastName email avatar doctorProfile.specialization doctorProfile.rating')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(queryLimit)
        .lean();

      const pagination = calculatePagination(
        Number(page),
        Number(limit),
        totalConsultations
      );

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          consultations,
          pagination
        }, 'Consultations retrieved successfully')
      );
    } catch (error) {
      logError('Get user consultations failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve consultations', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Update consultation
   * PUT /api/consultations/:id
   */
  async updateConsultation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData: IConsultationUpdate = req.body;

      const consultation = await Consultation.findOne({ consultationId: id });
      if (!consultation) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Consultation not found', 'NOT_FOUND')
        );
        return;
      }

      // Check permissions - only doctor or admin can update
      if (!req.user || 
          (req.user._id.toString() !== consultation.doctorId?.toString() &&
           req.user.role !== 'admin')) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Only the assigned doctor or admin can update consultation', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      // Update allowed fields
      const allowedFields: (keyof IConsultationUpdate)[] = [
        'status', 'doctorNotes', 'prescription', 'diagnosis', 
        'followUpRequired', 'followUpDate'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          (consultation as any)[field] = updateData[field];
        }
      });

      await consultation.save();

      // Send completion email if status is completed
      if (updateData.status === 'completed') {
        try {
          const patient = await User.findById(consultation.patientId);
          const doctor = await User.findById(consultation.doctorId);
          
          if (patient) {
            await EmailService.sendConsultationCompleted({
              patient,
              doctor: doctor || undefined,
              consultation,
              consultationUrl: `${process.env.FRONTEND_URL}/consultations/${consultation.consultationId}`
            });
          }
        } catch (emailError) {
          logError('Consultation completion email failed:', emailError);
        }
      }

      logInfo('Consultation updated', { 
        consultationId: consultation.consultationId,
        updatedBy: req.user._id,
        status: consultation.status 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(consultation, 'Consultation updated successfully')
      );
    } catch (error) {
      logError('Update consultation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to update consultation', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Add consultation rating
   * POST /api/consultations/:id/rate
   */
  async rateConsultation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { rating, feedback, categories } = req.body;

      const consultation = await Consultation.findOne({ consultationId: id });
      if (!consultation) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Consultation not found', 'NOT_FOUND')
        );
        return;
      }

      // Check permissions - only patient can rate
      if (!req.user || req.user._id.toString() !== consultation.patientId.toString()) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Only the patient can rate the consultation', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      // Check if consultation can be rated
      if (!consultation.canBeRated()) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Consultation cannot be rated', 'VALIDATION_ERROR')
        );
        return;
      }

      // Add rating
      await consultation.addRating(rating, feedback, categories);

      // Update doctor's overall rating
      if (consultation.doctorId && consultation.type !== 'ai_chat') {
        const doctor = await User.findById(consultation.doctorId);
        if (doctor) {
          await doctor.updateDoctorRating(rating);
        }
      }

      logInfo('Consultation rated', { 
        consultationId: consultation.consultationId,
        rating,
        patientId: req.user._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(consultation, 'Consultation rated successfully')
      );
    } catch (error) {
      logError('Rate consultation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to rate consultation', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Cancel consultation
   * POST /api/consultations/:id/cancel
   */
  async cancelConsultation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const consultation = await Consultation.findOne({ consultationId: id });
      if (!consultation) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Consultation not found', 'NOT_FOUND')
        );
        return;
      }

      // Check permissions - patient, doctor, or admin can cancel
      if (!req.user || 
          (req.user._id.toString() !== consultation.patientId.toString() && 
           req.user._id.toString() !== consultation.doctorId?.toString() &&
           req.user.role !== 'admin')) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Access denied', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      // Check if consultation can be cancelled
      if (!['pending', 'in_progress'].includes(consultation.status)) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Consultation cannot be cancelled', 'VALIDATION_ERROR')
        );
        return;
      }

      consultation.status = 'cancelled';
      if (reason) {
        consultation.doctorNotes = `Cancellation reason: ${reason}`;
      }
      await consultation.save();

      // Process refund if payment was completed
      if (consultation.payment.status === 'completed') {
        try {
          await PaymentService.processRefund(
            consultation.consultationId,
            consultation.payment.amount,
            reason || 'Consultation cancelled'
          );
        } catch (refundError) {
          logError('Refund processing failed:', refundError);
        }
      }

      logInfo('Consultation cancelled', { 
        consultationId: consultation.consultationId,
        cancelledBy: req.user._id,
        reason 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(consultation, 'Consultation cancelled successfully')
      );
    } catch (error) {
      logError('Cancel consultation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to cancel consultation', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Complete consultation
   * POST /api/consultations/:id/complete
   */
  async completeConsultation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { doctorNotes, prescription, diagnosis, followUpRequired, followUpDate } = req.body;

      const consultation = await Consultation.findOne({ consultationId: id });
      if (!consultation) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Consultation not found', 'NOT_FOUND')
        );
        return;
      }

      // Check permissions - only doctor can complete
      if (!req.user || 
          (req.user._id.toString() !== consultation.doctorId?.toString() &&
           req.user.role !== 'admin')) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Only the assigned doctor can complete consultation', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      // Update consultation
      consultation.status = 'completed';
      consultation.endTime = new Date();
      
      if (doctorNotes) consultation.doctorNotes = doctorNotes;
      if (diagnosis) consultation.diagnosis = diagnosis;
      if (prescription) consultation.prescription = prescription;
      if (followUpRequired !== undefined) consultation.followUpRequired = followUpRequired;
      if (followUpDate) consultation.followUpDate = new Date(followUpDate);

      await consultation.save();

      // Send completion email
      try {
        const patient = await User.findById(consultation.patientId);
        const doctor = await User.findById(consultation.doctorId);
        
        if (patient) {
          await EmailService.sendConsultationCompleted({
            patient,
            doctor: doctor || undefined,
            consultation,
            consultationUrl: `${process.env.FRONTEND_URL}/consultations/${consultation.consultationId}`
          });
        }
      } catch (emailError) {
        logError('Consultation completion email failed:', emailError);
      }

      logInfo('Consultation completed', { 
        consultationId: consultation.consultationId,
        completedBy: req.user._id 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(consultation, 'Consultation completed successfully')
      );
    } catch (error) {
      logError('Complete consultation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to complete consultation', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get consultation statistics
   * GET /api/consultations/stats
   */
  async getConsultationStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.role === 'doctor' ? req.user._id : undefined;
      const [stats] = await Consultation.getConsultationStats(undefined, userId);

      // Get additional stats
      const [
        totalRevenue,
        completionRate,
        averageRating,
        consultationsByType,
        recentConsultations
      ] = await Promise.all([
        this.getTotalRevenue(userId),
        this.getCompletionRate(userId),
        this.getAverageRating(userId),
        this.getConsultationsByType(userId),
        this.getRecentConsultationsCount(userId)
      ]);

      const combinedStats = {
        ...stats,
        totalRevenue,
        completionRate,
        averageRating,
        consultationsByType,
        recentConsultations
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(combinedStats, 'Consultation statistics retrieved successfully')
      );
    } catch (error) {
      logError('Get consultation stats failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve consultation statistics', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Get upcoming consultations
   * GET /api/consultations/upcoming
   */
  async getUpcomingConsultations(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const query: any = {
        scheduledDateTime: { $gte: new Date() },
        status: { $in: ['pending', 'confirmed'] }
      };

      if (req.user.role === 'patient') {
        query.patientId = req.user._id;
      } else if (req.user.role === 'doctor') {
        query.doctorId = req.user._id;
      }

      const upcomingConsultations = await Consultation.find(query)
        .populate('patientId', 'firstName lastName email avatar')
        .populate('doctorId', 'firstName lastName email avatar doctorProfile.specialization')
        .sort({ scheduledDateTime: 1 })
        .limit(10)
        .lean();

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          upcomingConsultations,
          'Upcoming consultations retrieved successfully'
        )
      );
    } catch (error) {
      logError('Get upcoming consultations failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve upcoming consultations', 'INTERNAL_ERROR')
      );
    }
  }

  // Private helper methods

  private async getTotalRevenue(doctorId?: string): Promise<number> {
    try {
      const matchStage: any = { 'payment.status': 'completed' };
      if (doctorId) matchStage.doctorId = doctorId;

      const result = await Consultation.aggregate([
        { $match: matchStage },
        { $group: { _id: null, total: { $sum: '$payment.amount' } } }
      ]);

      return result[0]?.total || 0;
    } catch (error) {
      logError('Get total revenue failed:', error);
      return 0;
    }
  }

  private async getCompletionRate(doctorId?: string): Promise<number> {
    try {
      const matchStage: any = {};
      if (doctorId) matchStage.doctorId = doctorId;

      const [total, completed] = await Promise.all([
        Consultation.countDocuments(matchStage),
        Consultation.countDocuments({ ...matchStage, status: 'completed' })
      ]);

      return total > 0 ? (completed / total) * 100 : 0;
    } catch (error) {
      logError('Get completion rate failed:', error);
      return 0;
    }
  }

  private async getAverageRating(doctorId?: string): Promise<number> {
    try {
      const matchStage: any = { 'rating.rating': { $exists: true } };
      if (doctorId) matchStage.doctorId = doctorId;

      const result = await Consultation.aggregate([
        { $match: matchStage },
        { $group: { _id: null, averageRating: { $avg: '$rating.rating' } } }
      ]);

      return result[0]?.averageRating || 0;
    } catch (error) {
      logError('Get average rating failed:', error);
      return 0;
    }
  }

  private async getConsultationsByType(doctorId?: string): Promise<Record<string, number>> {
    try {
      const matchStage: any = {};
      if (doctorId) matchStage.doctorId = doctorId;

      const result = await Consultation.aggregate([
        { $match: matchStage },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]);

      const consultationsByType: Record<string, number> = {
        ai_chat: 0,
        video_call: 0,
        home_visit: 0
      };

      result.forEach(item => {
        consultationsByType[item._id] = item.count;
      });

      return consultationsByType;
    } catch (error) {
      logError('Get consultations by type failed:', error);
      return { ai_chat: 0, video_call: 0, home_visit: 0 };
    }
  }

  private async getRecentConsultationsCount(doctorId?: string): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const matchStage: any = { createdAt: { $gte: thirtyDaysAgo } };
      if (doctorId) matchStage.doctorId = doctorId;

      return await Consultation.countDocuments(matchStage);
    } catch (error) {
      logError('Get recent consultations count failed:', error);
      return 0;
    }
  }
}

export default new ConsultationController();