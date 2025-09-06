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
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
} as const;

// Rate Limiting
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
export const GLOBAL_RATE_LIMIT_MAX = 1000; // Global requests per window
export const AUTH_RATE_LIMIT_MAX = 5; // Auth requests per window
export const AI_RATE_LIMIT_MAX = 20; // AI requests per window
export const PAYMENT_RATE_LIMIT_MAX = 20; // Payment requests per window
export const ADMIN_RATE_LIMIT_MAX = 200; // Admin requests per window
export const DEFAULT_RATE_LIMIT_MAX = 100; // Default rate limit

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// JWT
export const JWT_EXPIRE_TIME = '24h';
export const JWT_REFRESH_EXPIRE_TIME = '7d';

// Wallet
export const WALLET_NONCE_EXPIRE_TIME = 10 * 60 * 1000; // 10 minutes

// File Upload
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'text/plain'
];

// Error Codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  BLOCKCHAIN_ERROR: 'BLOCKCHAIN_ERROR',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;