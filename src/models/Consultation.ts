import mongoose, { Schema, Model } from 'mongoose';
import { 
  IConsultation, 
  IAIAnalysis, 
  IPrescription, 
  IConsultationRating, 
  IHomeVisitDetails, 
  IVideoCallDetails, 
  IPayment 
} from '../types/Consultation';
import { IAddress } from '../types/User';

// AI Analysis Schema
const aiAnalysisSchema = new Schema<IAIAnalysis>({
  riskLevel: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high']
  },
  suggestedActions: {
    type: [String],
    required: true
  },
  recommendSeeDoctor: {
    type: Boolean,
    required: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  possibleConditions: [String],
  urgencyLevel: {
    type: String,
    required: true,
    enum: ['routine', 'urgent', 'emergency'],
    default: 'routine'
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  aiModel: {
    type: String,
    required: true,
    default: 'gpt-4'
  },
  analysisVersion: {
    type: String,
    required: true,
    default: '1.0.0'
  }
}, { _id: false });

// Prescription Schema
const prescriptionSchema = new Schema<IPrescription>({
  medicationId: String,
  medication: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    required: true,
    trim: true
  },
  frequency: {
    type: String,
    required: true,
    trim: true
  },
  duration: {
    type: String,
    required: true,
    trim: true
  },
  instructions: {
    type: String,
    required: true,
    trim: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: Date,
  refillsRemaining: {
    type: Number,
    min: 0,
    default: 0
  }
}, { timestamps: true });

// Consultation Rating Schema
const consultationRatingSchema = new Schema<IConsultationRating>({
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  feedback: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  ratedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  categories: {
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5
    },
    effectiveness: {
      type: Number,
      min: 1,
      max: 5
    },
    punctuality: {
      type: Number,
      min: 1,
      max: 5
    }
  }
}, { _id: false });

// Address Schema (for home visits)
const addressSchema = new Schema<IAddress>({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  coordinates: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 }
  }
}, { _id: false });

// Home Visit Details Schema
const homeVisitDetailsSchema = new Schema<IHomeVisitDetails>({
  address: {
    type: addressSchema,
    required: true
  },
  estimatedArrival: {
    type: Date,
    required: true
  },
  actualArrival: Date,
  visitDuration: {
    type: Number,
    min: 0
  },
  travelFee: {
    type: Number,
    required: true,
    min: 0
  },
  distanceKm: {
    type: Number,
    min: 0
  },
  specialInstructions: {
    type: String,
    trim: true,
    maxlength: 500
  },
  accessNotes: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, { _id: false });

// Video Call Details Schema
const videoCallDetailsSchema = new Schema<IVideoCallDetails>({
  sessionId: {
    type: String,
    required: true,
    trim: true
  },
  roomId: {
    type: String,
    required: true,
    trim: true
  },
  recordingUrl: {
    type: String,
    trim: true
  },
  duration: {
    type: Number,
    min: 0
  },
  connectionQuality: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor']
  },
  participantsJoined: {
    type: [Date],
    default: []
  },
  technicalIssues: [String]
}, { _id: false });

// Payment Schema
const paymentSchema = new Schema<IPayment>({
  transactionHash: {
    type: String,
    trim: true,
    validate: {
      validator: function(v: string) {
        return !v || /^0x[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'Invalid transaction hash format'
    }
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    enum: ['ETH', 'USDC', 'MATIC', 'USDT']
  },
  gasFee: {
    type: Number,
    required: true,
    min: 0
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0
  },
  doctorEarnings: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paidAt: Date,
  refundedAt: Date,
  refundReason: {
    type: String,
    trim: true
  },
  blockchainNetwork: {
    type: String,
    required: true,
    enum: ['ethereum', 'polygon']
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['wallet', 'card'],
    default: 'wallet'
  }
}, { _id: false });

// Main Consultation Schema
const consultationSchema = new Schema<IConsultation>({
  consultationId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['ai_chat', 'video_call', 'home_visit']
  },
  patientId: {
    type: String,
    required: true,
    ref: 'User'
  },
  doctorId: {
    type: String,
    ref: 'User',
    validate: {
      validator: function(this: IConsultation, v: string) {
        // Doctor ID is required for video calls and home visits
        if (this.type === 'video_call' || this.type === 'home_visit') {
          return !!v;
        }
        return true;
      },
      message: 'Doctor ID is required for video calls and home visits'
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  scheduledDateTime: {
    type: Date,
    validate: {
      validator: function(this: IConsultation, v: Date) {
        // Scheduled datetime is required for video calls and home visits
        if (this.type === 'video_call' || this.type === 'home_visit') {
          return !!v && v > new Date();
        }
        return true;
      },
      message: 'Scheduled datetime is required for video calls and home visits'
    }
  },
  startTime: Date,
  endTime: Date,
  symptoms: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0 && v.length <= 20;
      },
      message: 'Must have between 1 and 20 symptoms'
    }
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },
  aiAnalysis: aiAnalysisSchema,
  doctorNotes: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  prescription: [prescriptionSchema],
  diagnosis: {
    type: String,
    trim: true,
    maxlength: 500
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date,
    validate: {
      validator: function(v: Date) {
        return !v || v > new Date();
      },
      message: 'Follow-up date must be in the future'
    }
  },
  payment: {
    type: paymentSchema,
    required: true
  },
  rating: consultationRatingSchema,
  homeVisitDetails: {
    type: homeVisitDetailsSchema,
    validate: {
      validator: function(this: IConsultation, v: IHomeVisitDetails) {
        return this.type !== 'home_visit' || !!v;
      },
      message: 'Home visit details are required for home visits'
    }
  },
  videoCallDetails: {
    type: videoCallDetailsSchema,
    validate: {
      validator: function(this: IConsultation, v: IVideoCallDetails) {
        return this.type !== 'video_call' || !!v;
      },
      message: 'Video call details are required for video calls'
    }
  },
  medicalDocuments: {
    type: [String],
    default: []
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
consultationSchema.index({ consultationId: 1 });
consultationSchema.index({ patientId: 1 });
consultationSchema.index({ doctorId: 1 });
consultationSchema.index({ type: 1 });
consultationSchema.index({ status: 1 });
consultationSchema.index({ scheduledDateTime: 1 });
consultationSchema.index({ createdAt: -1 });
consultationSchema.index({ 'payment.status': 1 });
consultationSchema.index({ 'aiAnalysis.riskLevel': 1 });

// Compound indexes
consultationSchema.index({ patientId: 1, status: 1 });
consultationSchema.index({ doctorId: 1, status: 1 });
consultationSchema.index({ type: 1, status: 1 });
consultationSchema.index({ patientId: 1, createdAt: -1 });
consultationSchema.index({ doctorId: 1, scheduledDateTime: 1 });

// Pre-save middleware
consultationSchema.pre('save', function(next) {
  // Set start time when status changes to in_progress
  if (this.isModified('status') && this.status === 'in_progress' && !this.startTime) {
    this.startTime = new Date();
  }

  // Set end time when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.endTime) {
    this.endTime = new Date();
  }

  // Calculate video call duration
  if (this.type === 'video_call' && this.startTime && this.endTime && this.videoCallDetails) {
    const duration = Math.round((this.endTime.getTime() - this.startTime.getTime()) / 60000);
    this.videoCallDetails.duration = duration;
  }

  // Calculate home visit duration
  if (this.type === 'home_visit' && this.homeVisitDetails?.actualArrival && this.endTime) {
    const duration = Math.round((this.endTime.getTime() - this.homeVisitDetails.actualArrival.getTime()) / 60000);
    this.homeVisitDetails.visitDuration = duration;
  }

  next();
});

// Instance methods
consultationSchema.methods.isActive = function(): boolean {
  return this.status === 'in_progress';
};

consultationSchema.methods.isCompleted = function(): boolean {
  return this.status === 'completed';
};

consultationSchema.methods.canBeRated = function(): boolean {
  return this.status === 'completed' && !this.rating;
};

consultationSchema.methods.getDuration = function(): number | null {
  if (this.startTime && this.endTime) {
    return Math.round((this.endTime.getTime() - this.startTime.getTime()) / 60000);
  }
  return null;
};

consultationSchema.methods.markAsCompleted = function(): Promise<IConsultation> {
  this.status = 'completed';
  this.endTime = new Date();
  return this.save();
};

consultationSchema.methods.addRating = function(
  rating: number, 
  feedback?: string, 
  categories?: any
): Promise<IConsultation> {
  if (this.status !== 'completed') {
    throw new Error('Cannot rate consultation that is not completed');
  }

  this.rating = {
    rating,
    feedback,
    ratedAt: new Date(),
    categories
  };

  return this.save();
};

consultationSchema.methods.addPrescription = function(prescriptions: IPrescription[]): Promise<IConsultation> {
  if (this.type === 'ai_chat') {
    throw new Error('AI consultations cannot have prescriptions');
  }

  this.prescription = this.prescription || [];
  this.prescription.push(...prescriptions);
  return this.save();
};

consultationSchema.methods.escalateToDoctor = function(doctorId: string, scheduledDateTime: Date): Promise<IConsultation> {
  if (this.type !== 'ai_chat') {
    throw new Error('Only AI consultations can be escalated');
  }

  this.doctorId = doctorId;
  this.type = 'video_call';
  this.scheduledDateTime = scheduledDateTime;
  this.status = 'pending';

  return this.save();
};

// Static methods
consultationSchema.statics.findByConsultationId = function(consultationId: string): Promise<IConsultation | null> {
  return this.findOne({ consultationId });
};

consultationSchema.statics.findByPatient = function(patientId: string, status?: string) {
  const query: any = { patientId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

consultationSchema.statics.findByDoctor = function(doctorId: string, status?: string) {
  const query: any = { doctorId };
  if (status) query.status = status;
  return this.find(query).sort({ scheduledDateTime: 1 });
};

consultationSchema.statics.findActiveConsultations = function() {
  return this.find({ status: 'in_progress' });
};

consultationSchema.statics.findUpcomingConsultations = function(timeRange: number = 24) {
  const now = new Date();
  const futureTime = new Date(now.getTime() + timeRange * 60 * 60 * 1000);
  
  return this.find({
    status: { $in: ['pending', 'confirmed'] },
    scheduledDateTime: { $gte: now, $lte: futureTime }
  }).sort({ scheduledDateTime: 1 });
};

consultationSchema.statics.getConsultationStats = function(doctorId?: string) {
  const matchStage: any = {};
  if (doctorId) matchStage.doctorId = doctorId;

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        averageRating: { $avg: '$rating.rating' },
        totalRevenue: { $sum: '$payment.amount' }
      }
    }
  ]);
};

// Virtual fields
consultationSchema.virtual('duration').get(function() {
  return this.getDuration();
});

consultationSchema.virtual('patientInfo', {
  ref: 'User',
  localField: 'patientId',
  foreignField: '_id',
  justOne: true
});

consultationSchema.virtual('doctorInfo', {
  ref: 'User',
  localField: 'doctorId',
  foreignField: '_id',
  justOne: true
});

// Create and export the model
const Consultation: Model<IConsultation> = mongoose.model<IConsultation>('Consultation', consultationSchema);

export default Consultation;