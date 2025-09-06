// API Constants
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE = 1;

// Authentication
export const JWT_EXPIRE_TIME = '7d';
export const JWT_REFRESH_EXPIRE_TIME = '30d';
export const WALLET_NONCE_EXPIRE_TIME = 300000; // 5 minutes in ms
export const PASSWORD_SALT_ROUNDS = 12;

// Rate Limiting
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX = 100; // requests per window
export const AUTH_RATE_LIMIT_MAX = 5; // login attempts per window
export const AI_RATE_LIMIT_MAX = 20; // AI requests per window

// File Upload
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];
export const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

// Consultation
export const CONSULTATION_TYPES = {
  AI_CHAT: 'ai_chat',
  VIDEO_CALL: 'video_call',
  HOME_VISIT: 'home_visit'
} as const;

export const CONSULTATION_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
} as const;

export const URGENCY_LEVELS = {
  ROUTINE: 'routine',
  URGENT: 'urgent',
  EMERGENCY: 'emergency'
} as const;

// Payment & Blockchain
export const SUPPORTED_CURRENCIES = ['ETH', 'USDC', 'MATIC', 'USDT'] as const;
export const SUPPORTED_NETWORKS = ['ethereum', 'polygon'] as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded'
} as const;

export const PLATFORM_FEE_PERCENTAGE = 5; // 5%
export const AI_CONSULTATION_BASE_FEE = 0.001; // in ETH
export const VIDEO_CONSULTATION_BASE_FEE = 0.05; // in ETH
export const HOME_VISIT_BASE_FEE = 0.1; // in ETH

// Gas fee estimates (in ETH)
export const GAS_ESTIMATES = {
  ETHEREUM: {
    TRANSFER: 0.002,
    CONTRACT_CALL: 0.005
  },
  POLYGON: {
    TRANSFER: 0.0001,
    CONTRACT_CALL: 0.0005
  }
};

// User Roles
export const USER_ROLES = {
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  ADMIN: 'admin'
} as const;

// Appointment
export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  RESCHEDULED: 'rescheduled'
} as const;

export const APPOINTMENT_TYPES = {
  VIDEO_CALL: 'video_call',
  HOME_VISIT: 'home_visit'
} as const;

export const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 
  'friday', 'saturday', 'sunday'
] as const;

// AI Chat
export const AI_CHAT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ESCALATED_TO_DOCTOR: 'escalated_to_doctor',
  ABANDONED: 'abandoned'
} as const;

export const MESSAGE_TYPES = {
  TEXT: 'text',
  SYMPTOM_INPUT: 'symptom_input',
  ANALYSIS_RESULT: 'analysis_result',
  QUESTION: 'question',
  CLARIFICATION: 'clarification'
} as const;

// Transaction Types
export const TRANSACTION_TYPES = {
  AI_CONSULTATION: 'ai_consultation',
  VIDEO_CONSULTATION: 'video_consultation',
  HOME_VISIT: 'home_visit',
  DOCTOR_WITHDRAWAL: 'doctor_withdrawal',
  REFUND: 'refund',
  PLATFORM_FEE: 'platform_fee'
} as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  APPOINTMENT_REMINDER: 'appointment_reminder',
  CONSULTATION_UPDATE: 'consultation_update',
  PAYMENT_CONFIRMATION: 'payment_confirmation',
  SYSTEM_ALERT: 'system_alert',
  DOCTOR_VERIFICATION: 'doctor_verification',
  NEW_MESSAGE: 'new_message'
} as const;

export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  IN_APP: 'in_app'
} as const;

export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
} as const;

// Time zones
export const DEFAULT_TIMEZONE = 'UTC';
export const SUPPORTED_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney'
];

// OpenAI Configuration
export const AI_MODELS = {
  GPT_4: 'gpt-4',
  GPT_4_TURBO: 'gpt-4-1106-preview',
  GPT_3_5_TURBO: 'gpt-3.5-turbo'
} as const;

export const AI_ANALYSIS_VERSION = '1.0.0';
export const AI_CONFIDENCE_THRESHOLD = 0.7;
export const AI_MAX_TOKENS = 1000;
export const AI_TEMPERATURE = 0.3;

// Email Templates
export const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  CONSULTATION_COMPLETED: 'consultation_completed',
  PAYMENT_CONFIRMATION: 'payment_confirmation',
  DOCTOR_VERIFICATION: 'doctor_verification',
  PASSWORD_RESET: 'password_reset'
} as const;

// Validation Rules
export const VALIDATION_RULES = {
  PASSWORD_MIN_LENGTH: 8,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 50,
  EMAIL_MAX_LENGTH: 254,
  PHONE_MIN_LENGTH: 10,
  PHONE_MAX_LENGTH: 15,
  BIO_MAX_LENGTH: 1000,
  SYMPTOMS_MAX_COUNT: 20,
  ALLERGIES_MAX_COUNT: 50,
  MEDICATIONS_MAX_COUNT: 50
};

// Error Messages
export const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Validation failed',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  NOT_FOUND: 'Resource not found',
  DUPLICATE_ENTRY: 'Resource already exists',
  PAYMENT_FAILED: 'Payment processing failed',
  BLOCKCHAIN_ERROR: 'Blockchain transaction failed',
  AI_SERVICE_ERROR: 'AI service unavailable',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
  INTERNAL_ERROR: 'Internal server error'
};

// Success Messages
export const SUCCESS_MESSAGES = {
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  PAYMENT_CONFIRMED: 'Payment confirmed successfully',
  EMAIL_SENT: 'Email sent successfully',
  CONSULTATION_COMPLETED: 'Consultation completed successfully'
};

// Socket Events
export const SOCKET_EVENTS = {
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  JOIN_CONSULTATION: 'join_consultation',
  LEAVE_CONSULTATION: 'leave_consultation',
  VIDEO_OFFER: 'video_offer',
  VIDEO_ANSWER: 'video_answer',
  ICE_CANDIDATE: 'ice_candidate',
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  NOTIFICATION: 'notification',
  STATUS_UPDATE: 'status_update'
} as const;

// Regular Expressions
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-\(\)]{10,15}$/,
  WALLET_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
  TRANSACTION_HASH: /^0x[a-fA-F0-9]{64}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
} as const;