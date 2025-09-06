// User types
export * from './User';

// Consultation types
export * from './Consultation';

// AI Chat Session types
export * from './AIChatSession';

// Appointment types
export * from './Appointment';

// Transaction types
export * from './Transaction';

// Common interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  errors?: ValidationError[];
  pagination?: PaginationInfo;
  timestamp: Date;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SearchQuery {
  q?: string;
  filters?: Record<string, any>;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface NotificationPayload {
  userId: string;
  type: 'appointment_reminder' | 'consultation_update' | 'payment_confirmation' | 'system_alert';
  title: string;
  message: string;
  data?: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channels: ('email' | 'sms' | 'push' | 'in_app')[];
  scheduledFor?: Date;
}

export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer?: Buffer;
}

export interface EmailTemplate {
  template: string;
  subject: string;
  variables: Record<string, any>;
}

// Socket.io event types
export interface SocketEvents {
  // Authentication
  'authenticate': (token: string) => void;
  'authenticated': (user: Partial<IUser>) => void;
  'authentication_error': (error: string) => void;

  // Video Call Events
  'join_consultation': (consultationId: string) => void;
  'leave_consultation': (consultationId: string) => void;
  'video_offer': (data: { consultationId: string; offer: any }) => void;
  'video_answer': (data: { consultationId: string; answer: any }) => void;
  'ice_candidate': (data: { consultationId: string; candidate: any }) => void;
  'consultation_ended': (consultationId: string) => void;

  // Chat Events
  'send_message': (data: { consultationId: string; message: string; type: 'text' | 'file' }) => void;
  'new_message': (data: { messageId: string; sender: string; content: string; timestamp: Date }) => void;
  'typing_start': (data: { consultationId: string; userId: string }) => void;
  'typing_stop': (data: { consultationId: string; userId: string }) => void;

  // Status Updates
  'doctor_availability_update': (data: { doctorId: string; isAvailable: boolean }) => void;
  'consultation_status_update': (data: { consultationId: string; status: string }) => void;
  'appointment_reminder': (data: { appointmentId: string; reminderType: string }) => void;

  // Notifications
  'notification': (notification: NotificationPayload) => void;
  'read_notification': (notificationId: string) => void;

  // AI Chat Events
  'ai_analysis_update': (data: { sessionId: string; analysis: Partial<IAIAnalysis> }) => void;
  'ai_response': (data: { sessionId: string; message: string; suggestions?: string[] }) => void;

  // System Events
  'system_maintenance': (data: { message: string; scheduledFor: Date }) => void;
  'connection_quality': (data: { quality: 'excellent' | 'good' | 'fair' | 'poor' }) => void;
}

// HTTP Status Codes
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504
}

// Error types
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  PAYMENT_ERROR = 'PAYMENT_ERROR',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

// Import the interfaces for use in the exports
import { IUser } from './User';
import { IAIAnalysis } from './Consultation';