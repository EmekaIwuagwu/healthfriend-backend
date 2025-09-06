import { Document } from 'mongoose';
import { IAIAnalysis, IPayment } from './Consultation';

export interface IAIChatSession extends Document {
  _id: string;
  sessionId: string;
  userId: string;
  messages: IChatMessage[];
  symptoms: string[];
  finalAnalysis?: IAIAnalysis;
  status: 'active' | 'completed' | 'escalated_to_doctor' | 'abandoned';
  totalCost: number;
  payment: IPayment;
  escalationReason?: string;
  doctorConsultationId?: string;
  sessionDuration?: number; // in minutes
  messageCount: number;
  language: string;
  userFeedback?: ISessionFeedback;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface IChatMessage {
  messageId: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
  messageType: 'text' | 'symptom_input' | 'analysis_result' | 'question' | 'clarification';
  metadata?: {
    confidence?: number;
    suggestedQuestions?: string[];
    riskAssessment?: 'low' | 'medium' | 'high';
    requiresFollowUp?: boolean;
  };
  attachments?: IMessageAttachment[];
  _id?: string;
}

export interface IMessageAttachment {
  type: 'image' | 'document' | 'audio';
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  description?: string;
}

export interface ISessionFeedback {
  rating: number; // 1-5
  helpful: boolean;
  accurate: boolean;
  easyToUnderstand: boolean;
  feedback?: string;
  wouldRecommend: boolean;
  improvementSuggestions?: string[];
  ratedAt: Date;
}

// Request/Response interfaces
export interface IStartAIChatRequest {
  symptoms: string[];
  description: string;
  urgency?: 'routine' | 'urgent' | 'emergency';
  language?: string;
  paymentCurrency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
}

export interface ISendMessageRequest {
  sessionId: string;
  content: string;
  messageType?: 'text' | 'symptom_input' | 'clarification';
  attachments?: IMessageAttachment[];
}

export interface IAIChatResponse {
  sessionId: string;
  message: IChatMessage;
  analysis?: Partial<IAIAnalysis>;
  suggestedQuestions?: string[];
  shouldEscalate?: boolean;
  escalationReason?: string;
  sessionStatus: 'active' | 'completed' | 'escalated_to_doctor';
  cost: number;
}

export interface ISymptomAnalysisRequest {
  symptoms: string[];
  chatHistory: IChatMessage[];
  patientAge?: number;
  patientGender?: 'male' | 'female' | 'other';
  medicalHistory?: string[];
  currentMedications?: string[];
  allergies?: string[];
}

export interface IEscalationRequest {
  sessionId: string;
  reason: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  preferredDoctorSpecialization?: string;
  scheduledDateTime?: Date;
}

export interface IAIChatSessionFilter {
  userId?: string;
  status?: 'active' | 'completed' | 'escalated_to_doctor' | 'abandoned';
  dateFrom?: Date;
  dateTo?: Date;
  riskLevel?: 'low' | 'medium' | 'high';
  escalated?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'completedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface IAIChatStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  escalatedSessions: number;
  abandonedSessions: number;
  averageSessionDuration: number;
  averageMessageCount: number;
  totalRevenue: number;
  escalationRate: number;
  satisfactionRate: number;
  commonSymptoms: Array<{
    symptom: string;
    count: number;
    percentage: number;
  }>;
}