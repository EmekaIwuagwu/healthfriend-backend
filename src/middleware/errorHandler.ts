import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { createErrorResponse, logError } from '../utils/helpers';
import { HTTP_STATUS, ERROR_MESSAGES } from '../utils/constants';

// Custom Error Class
export class AppError extends Error {
  public statusCode: number;
  public code?: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// MongoDB Error Handlers
const handleCastError = (err: mongoose.Error.CastError) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, HTTP_STATUS.BAD_REQUEST, 'CAST_ERROR');
};

const handleDuplicateFieldsError = (err: any) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field} '${value}' already exists. Please use a different value.`;
  return new AppError(message, HTTP_STATUS.CONFLICT, 'DUPLICATE_ENTRY');
};

const handleValidationError = (err: mongoose.Error.ValidationError) => {
  const errors = Object.values(err.errors).map(error => {
    if (error instanceof mongoose.Error.ValidatorError) {
      return {
        field: error.path,
        message: error.message,
        code: error.kind
      };
    }
    return {
      field: 'unknown',
      message: error.message,
      code: 'validation_error'
    };
  });

  const message = 'Invalid input data';
  const appError = new AppError(message, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  (appError as any).errors = errors;
  return appError;
};

// JWT Error Handlers
const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again.', HTTP_STATUS.UNAUTHORIZED, 'AUTHENTICATION_ERROR');
};

const handleJWTExpiredError = () => {
  return new AppError('Your token has expired. Please log in again.', HTTP_STATUS.UNAUTHORIZED, 'AUTHENTICATION_ERROR');
};

// Rate Limiting Error Handler
const handleRateLimitError = () => {
  return new AppError('Too many requests from this IP. Please try again later.', HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMIT_ERROR');
};

// Blockchain/Web3 Error Handler
const handleBlockchainError = (err: any) => {
  let message = 'Blockchain transaction failed';
  
  if (err.code === 'INSUFFICIENT_FUNDS') {
    message = 'Insufficient funds for this transaction';
  } else if (err.code === 'NONCE_TOO_LOW') {
    message = 'Transaction nonce is too low';
  } else if (err.code === 'REPLACEMENT_UNDERPRICED') {
    message = 'Gas price too low for replacement transaction';
  } else if (err.code === 'NETWORK_ERROR') {
    message = 'Network connection error. Please try again';
  } else if (err.reason) {
    message = err.reason;
  }

  return new AppError(message, HTTP_STATUS.BAD_REQUEST, 'BLOCKCHAIN_ERROR');
};

// AI Service Error Handler
const handleAIServiceError = (err: any) => {
  let message = 'AI service is currently unavailable';
  
  if (err.status === 429) {
    message = 'AI service rate limit exceeded. Please try again later';
  } else if (err.status === 401) {
    message = 'AI service authentication failed';
  } else if (err.type === 'invalid_request_error') {
    message = 'Invalid request to AI service';
  }

  return new AppError(message, HTTP_STATUS.SERVICE_UNAVAILABLE, 'AI_SERVICE_ERROR');
};

// File Upload Error Handler
const handleMulterError = (err: any) => {
  let message = 'File upload error';
  let statusCode = HTTP_STATUS.BAD_REQUEST;

  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      message = 'File size exceeds the maximum limit';
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files uploaded';
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected file field';
      break;
    case 'LIMIT_PART_COUNT':
      message = 'Too many parts in multipart data';
      break;
    case 'LIMIT_FIELD_KEY':
      message = 'Field name too long';
      break;
    case 'LIMIT_FIELD_VALUE':
      message = 'Field value too long';
      break;
    case 'LIMIT_FIELD_COUNT':
      message = 'Too many fields in form data';
      break;
    default:
      if (err.message) {
        message = err.message;
      }
  }

  return new AppError(message, statusCode, 'FILE_UPLOAD_ERROR');
};

// Email Service Error Handler
const handleEmailError = (err: any) => {
  let message = 'Email service error';
  
  if (err.code === 'EAUTH') {
    message = 'Email authentication failed';
  } else if (err.code === 'ECONNECTION') {
    message = 'Email service connection failed';
  } else if (err.responseCode >= 500) {
    message = 'Email server error';
  } else if (err.responseCode >= 400) {
    message = 'Invalid email configuration';
  }

  return new AppError(message, HTTP_STATUS.SERVICE_UNAVAILABLE, 'EMAIL_SERVICE_ERROR');
};

// Send error response for development
const sendErrorDev = (err: AppError, res: Response) => {
  const response = createErrorResponse(
    err.message,
    err.code || 'INTERNAL_ERROR',
    (err as any).errors
  );

  // Add stack trace and additional error details in development
  (response as any).stack = err.stack;
  (response as any).error = err;

  res.status(err.statusCode).json(response);
};

// Send error response for production
const sendErrorProd = (err: AppError, res: Response) => {
  // Only send error details for operational/trusted errors
  if (err.isOperational) {
    const response = createErrorResponse(
      err.message,
      err.code || 'INTERNAL_ERROR',
      (err as any).errors
    );
    res.status(err.statusCode).json(response);
  } else {
    // Don't leak error details for programming errors
    logError('Non-operational error:', err);
    
    const response = createErrorResponse(
      ERROR_MESSAGES.INTERNAL_ERROR,
      'INTERNAL_ERROR'
    );
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
  }
};

// Not Found Handler (404)
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const err = new AppError(
    `Route ${req.originalUrl} not found`,
    HTTP_STATUS.NOT_FOUND,
    'NOT_FOUND'
  );
  next(err);
};

// Global Error Handler
export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Set default values
  err.statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Log error details
  logError('Global error handler:', {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id
  });

  let error = { ...err };
  error.message = err.message;

  // Handle specific error types
  if (err.name === 'CastError') {
    error = handleCastError(err);
  } else if (err.code === 11000) {
    error = handleDuplicateFieldsError(err);
  } else if (err.name === 'ValidationError') {
    error = handleValidationError(err);
  } else if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  } else if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  } else if (err.type === 'entity.too.large') {
    error = new AppError('Request payload too large', HTTP_STATUS.BAD_REQUEST, 'PAYLOAD_TOO_LARGE');
  } else if (err.code && err.code.startsWith('BLOCKCHAIN_')) {
    error = handleBlockchainError(err);
  } else if (err.name === 'OpenAIError' || err.type === 'openai_error') {
    error = handleAIServiceError(err);
  } else if (err.code && err.code.startsWith('LIMIT_')) {
    error = handleMulterError(err);
  } else if (err.code && ['EAUTH', 'ECONNECTION'].includes(err.code)) {
    error = handleEmailError(err);
  } else if (err.code === 'ECONNREFUSED') {
    error = new AppError('Service connection refused', HTTP_STATUS.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  } else if (err.code === 'ETIMEDOUT') {
    error = new AppError('Request timeout', HTTP_STATUS.REQUEST_TIMEOUT, 'REQUEST_TIMEOUT');
  } else if (err.name === 'MongooseServerSelectionError') {
    error = new AppError('Database connection failed', HTTP_STATUS.SERVICE_UNAVAILABLE, 'DATABASE_ERROR');
  } else if (!err.isOperational) {
    // Convert unknown errors to operational errors
    error = new AppError(
      process.env.NODE_ENV === 'production' ? ERROR_MESSAGES.INTERNAL_ERROR : err.message,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR'
    );
  }

  // Send appropriate error response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

// Async Error Wrapper
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Unhandled Promise Rejection Handler
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (err: Error) => {
    logError('UNHANDLED PROMISE REJECTION! Shutting down...', err);
    process.exit(1);
  });
};

// Uncaught Exception Handler  
export const handleUncaughtException = () => {
  process.on('uncaughtException', (err: Error) => {
    logError('UNCAUGHT EXCEPTION! Shutting down...', err);
    process.exit(1);
  });
};

// Graceful Shutdown Handler
export const handleGracefulShutdown = (server: any) => {
  const signals = ['SIGTERM', 'SIGINT'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      server.close(() => {
        console.log('HTTP server closed');
        
        // Close database connection
        require('mongoose').connection.close(() => {
          console.log('Database connection closed');
          process.exit(0);
        });
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.log('Forcefully shutting down');
        process.exit(1);
      }, 10000);
    });
  });
};

// Health Check Middleware
export const healthCheck = (req: Request, res: Response) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100
    }
  };

  res.status(HTTP_STATUS.OK).json(health);
};

// Request Logger Middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;
    const userAgent = req.get('User-Agent') || '';
    const ip = req.ip;
    const userId = (req as any).user?.id || 'anonymous';

    // Log format: [timestamp] method url statusCode duration userId ip
    console.log(
      `[${new Date().toISOString()}] ${method} ${url} ${statusCode} ${duration}ms ${userId} ${ip}`
    );

    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logError('Slow request detected:', {
        method,
        url,
        duration,
        statusCode,
        userId,
        ip,
        userAgent
      });
    }

    // Log error responses
    if (statusCode >= 400) {
      logError('Error response:', {
        method,
        url,
        statusCode,
        duration,
        userId,
        ip
      });
    }
  });

  next();
};

// CORS Error Handler
export const handleCorsError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.message && err.message.includes('CORS')) {
    const corsError = new AppError(
      'Cross-origin request blocked',
      HTTP_STATUS.FORBIDDEN,
      'CORS_ERROR'
    );
    return next(corsError);
  }
  next(err);
};

// API Version Deprecation Handler
export const handleDeprecatedAPI = (version: string, deprecationDate: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('Warning', `299 - "API version ${version} is deprecated. Will be removed after ${deprecationDate}"`);
    next();
  };
};

export default {
  AppError,
  notFoundHandler,
  globalErrorHandler,
  catchAsync,
  handleUnhandledRejection,
  handleUncaughtException,
  handleGracefulShutdown,
  healthCheck,
  requestLogger,
  handleCorsError,
  handleDeprecatedAPI
};