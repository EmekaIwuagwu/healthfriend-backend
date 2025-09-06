import { Document } from 'mongoose';
import { IAddress } from './User';

export interface IConsultation extends Document {
  _id: string;
  consultationId: string;
  type: 'ai_chat' | 'video_call' | 'home_visit';
  patientId: string;
  doctorId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDateTime?: Date;
  startTime?: Date;
  endTime?: Date;
  symptoms: string[];
  description: string;
  aiAnalysis?: IAIAnalysis;
  doctorNotes?: string;
  prescription?: IPrescription[];
  diagnosis?: string;
  followUpRequired: boolean;
  followUpDate?: Date;
  payment: IPayment;
  rating?: IConsultationRating;
  homeVisitDetails?: IHomeVisitDetails;
  videoCallDetails?: IVideoCallDetails;
  medicalDocuments?: string[]; // File URLs
  createdAt: Date;
  updatedAt: Date;
}

export interface IAIAnalysis {
  riskLevel: 'low' | 'medium' | 'high';
  suggestedActions: string[];
  recommendSeeDoctor: boolean;
  confidence: number; // 0-1
  possibleConditions?: string[];
  urgencyLevel: 'routine' | 'urgent' | 'emergency';
  timestamp: Date;
  aiModel: string;
  analysisVersion: string;
}

export interface IPrescription {
  medicationId?: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  startDate: Date;
  endDate?: Date;
  refillsRemaining?: number;
  _id?: string;
}

export interface IConsultationRating {
  rating: number; // 1-5
  feedback?: string;
  ratedAt: Date;
  categories?: {
    communication: number;
    professionalism: number;
    effectiveness: number;
    punctuality: number;
  };
}

export interface IHomeVisitDetails {
  address: IAddress;
  estimatedArrival: Date;
  actualArrival?: Date;
  visitDuration?: number; // in minutes
  travelFee: number;
  distanceKm?: number;
  specialInstructions?: string;
  accessNotes?: string;
}

export interface IVideoCallDetails {
  sessionId: string;
  roomId: string;
  recordingUrl?: string;
  duration?: number; // in minutes
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  participantsJoined: Date[];
  technicalIssues?: string[];
}

export interface IPayment {
  transactionHash?: string;
  amount: number;
  currency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
  gasFee: number;
  platformFee: number;
  doctorEarnings: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paidAt?: Date;
  refundedAt?: Date;
  refundReason?: string;
  blockchainNetwork: 'ethereum' | 'polygon';
  paymentMethod: 'wallet' | 'card';
}

// Request/Response interfaces
export interface IConsultationRequest {
  type: 'ai_chat' | 'video_call' | 'home_visit';
  doctorId?: string;
  scheduledDateTime?: Date;
  symptoms: string[];
  description: string;
  paymentCurrency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
  homeVisitAddress?: IAddress;
  urgency?: 'routine' | 'urgent' | 'emergency';
}

export interface IConsultationUpdate {
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  doctorNotes?: string;
  prescription?: IPrescription[];
  diagnosis?: string;
  followUpRequired?: boolean;
  followUpDate?: Date;
}

export interface IConsultationFilter {
  type?: 'ai_chat' | 'video_call' | 'home_visit';
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  doctorId?: string;
  patientId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  riskLevel?: 'low' | 'medium' | 'high';
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'scheduledDateTime' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface IConsultationStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  byType: {
    aiChat: number;
    videoCall: number;
    homeVisit: number;
  };
  averageRating: number;
  totalRevenue: number;
}