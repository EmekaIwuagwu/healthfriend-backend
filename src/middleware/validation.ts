import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { createErrorResponse } from '../utils/helpers';
import { HTTP_STATUS } from '../utils/constants';
import {
  userRegistrationSchema,
  userLoginSchema,
  userUpdateSchema,
  doctorProfileSchema,
  consultationRequestSchema,
  consultationUpdateSchema,
  startAIChatSchema,
  sendMessageSchema,
  appointmentRequestSchema,
  paymentConfirmationSchema,
  withdrawalRequestSchema,
  ratingSchema,
  paginationSchema,
  dateRangeSchema
} from '../utils/validators';

// Generic validation middleware factory
export const validate = (schema: Joi.ObjectSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const dataToValidate = req[source];
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false
      });

      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message.replace(/"/g, ''),
          code: detail.type
        }));

        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse(
            'Validation failed',
            'VALIDATION_ERROR',
            validationErrors
          )
        );
        return;
      }

      // Replace the original data with validated and sanitized data
      req[source] = value;
      next();
    } catch (err) {
      console.error('Validation middleware error:', err);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Validation processing error', 'INTERNAL_ERROR')
      );
    }
  };
};

// User validation middlewares
export const validateUserRegistration = validate(userRegistrationSchema, 'body');
export const validateUserLogin = validate(userLoginSchema, 'body');
export const validateUserUpdate = validate(userUpdateSchema, 'body');
export const validateDoctorProfile = validate(doctorProfileSchema, 'body');

// Consultation validation middlewares
export const validateConsultationRequest = validate(consultationRequestSchema, 'body');
export const validateConsultationUpdate = validate(consultationUpdateSchema, 'body');

// AI Chat validation middlewares
export const validateStartAIChat = validate(startAIChatSchema, 'body');
export const validateSendMessage = validate(sendMessageSchema, 'body');

// Appointment validation middlewares
export const validateAppointmentRequest = validate(appointmentRequestSchema, 'body');

// Payment validation middlewares
export const validatePaymentConfirmation = validate(paymentConfirmationSchema, 'body');
export const validateWithdrawalRequest = validate(withdrawalRequestSchema, 'body');

// Rating validation middleware
export const validateRating = validate(ratingSchema, 'body');

// Query validation middlewares
export const validatePagination = validate(paginationSchema, 'query');
export const validateDateRange = validate(dateRangeSchema, 'query');

// Combined query validation for lists with pagination and date range
export const validateListQuery = (req: Request, res: Response, next: NextFunction): void => {
  // Combine pagination and date range schemas
  const combinedSchema = Joi.object({
    ...paginationSchema.describe().keys,
    ...dateRangeSchema.describe().keys,
    // Additional common query parameters
    search: Joi.string().trim().max(100).optional(),
    status: Joi.string().trim().optional(),
    type: Joi.string().trim().optional()
  });

  validate(combinedSchema, 'query')(req, res, next);
};

// Custom validation middlewares

// Validate MongoDB ObjectID
export const validateObjectId = (paramName: string = 'id') => {
  const objectIdSchema = Joi.object({
    [paramName]: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
      'string.pattern.base': `${paramName} must be a valid ObjectId`
    })
  });

  return validate(objectIdSchema, 'params');
};

// Validate wallet address
export const validateWalletAddress = (fieldName: string = 'walletAddress') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const walletAddressSchema = Joi.object({
      [fieldName]: Joi.string()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid wallet address format'
        })
    });

    validate(walletAddressSchema, 'body')(req, res, next);
  };
};

// Validate transaction hash
export const validateTransactionHash = (fieldName: string = 'transactionHash') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const transactionHashSchema = Joi.object({
      [fieldName]: Joi.string()
        .pattern(/^0x[a-fA-F0-9]{64}$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid transaction hash format'
        })
    });

    validate(transactionHashSchema, 'body')(req, res, next);
  };
};

// Validate consultation access
export const validateConsultationAccess = (req: Request, res: Response, next: NextFunction): void => {
  const consultationAccessSchema = Joi.object({
    consultationId: Joi.string().required().messages({
      'any.required': 'Consultation ID is required'
    })
  });

  validate(consultationAccessSchema, 'params')(req, res, next);
};

// Validate appointment scheduling
export const validateAppointmentScheduling = (req: Request, res: Response, next: NextFunction): void => {
  const { scheduledDateTime, type, doctorId } = req.body;

  // Custom validation for appointment scheduling business rules
  const errors: Array<{ field: string; message: string; code: string }> = [];

  // Check if appointment is at least 1 hour in the future
  if (scheduledDateTime) {
    const appointmentTime = new Date(scheduledDateTime);
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    
    if (appointmentTime < oneHourFromNow) {
      errors.push({
        field: 'scheduledDateTime',
        message: 'Appointment must be scheduled at least 1 hour in advance',
        code: 'date.min'
      });
    }

    // Check if appointment is within business hours (9 AM - 6 PM)
    const appointmentHour = appointmentTime.getHours();
    if (appointmentHour < 9 || appointmentHour >= 18) {
      errors.push({
        field: 'scheduledDateTime',
        message: 'Appointments can only be scheduled between 9 AM and 6 PM',
        code: 'time.invalid'
      });
    }

    // Check if appointment is not on Sunday (assuming Sunday = 0)
    if (appointmentTime.getDay() === 0) {
      errors.push({
        field: 'scheduledDateTime',
        message: 'Appointments cannot be scheduled on Sundays',
        code: 'date.invalid'
      });
    }
  }

  // Check if home visit has reasonable duration (minimum 30 minutes)
  if (type === 'home_visit' && req.body.duration && req.body.duration < 30) {
    errors.push({
      field: 'duration',
      message: 'Home visits must be at least 30 minutes',
      code: 'number.min'
    });
  }

  if (errors.length > 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse('Appointment validation failed', 'VALIDATION_ERROR', errors)
    );
    return;
  }

  next();
};

// Validate file uploads
export const validateFileUpload = (req: Request, res: Response, next: NextFunction): void => {
  const files = req.files as Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
  
  if (!files || (Array.isArray(files) && files.length === 0)) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse('No files uploaded', 'VALIDATION_ERROR')
    );
    return;
  }

  const errors: Array<{ field: string; message: string; code: string }> = [];
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  const filesToValidate = Array.isArray(files) ? files : Object.values(files).flat();

  filesToValidate.forEach((file, index) => {
    // Check file type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      errors.push({
        field: `file[${index}]`,
        message: `File type ${file.mimetype} is not allowed`,
        code: 'file.type.invalid'
      });
    }

    // Check file size
    if (file.size > maxFileSize) {
      errors.push({
        field: `file[${index}]`,
        message: `File size exceeds 10MB limit`,
        code: 'file.size.exceeded'
      });
    }

    // Check filename
    if (!file.originalname || file.originalname.length > 255) {
      errors.push({
        field: `file[${index}]`,
        message: 'Invalid filename',
        code: 'file.name.invalid'
      });
    }
  });

  if (errors.length > 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse('File validation failed', 'VALIDATION_ERROR', errors)
    );
    return;
  }

  next();
};

// Validate AI chat session state
export const validateAIChatState = (req: Request, res: Response, next: NextFunction): void => {
  const { sessionId } = req.params;
  const { content } = req.body;

  const errors: Array<{ field: string; message: string; code: string }> = [];

  // Validate session ID format
  if (!sessionId || !sessionId.startsWith('session_')) {
    errors.push({
      field: 'sessionId',
      message: 'Invalid session ID format',
      code: 'string.format.invalid'
    });
  }

  // Validate message content
  if (content && content.length > 2000) {
    errors.push({
      field: 'content',
      message: 'Message content cannot exceed 2000 characters',
      code: 'string.max'
    });
  }

  if (errors.length > 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse('AI chat validation failed', 'VALIDATION_ERROR', errors)
    );
    return;
  }

  next();
};

// Validate payment amount and currency
export const validatePaymentData = (req: Request, res: Response, next: NextFunction): void => {
  const { amount, currency, blockchainNetwork } = req.body;
  const errors: Array<{ field: string; message: string; code: string }> = [];

  // Validate minimum amounts based on currency
  const minimumAmounts = {
    ETH: 0.0001,
    USDC: 0.01,
    MATIC: 0.01,
    USDT: 0.01
  };

  if (amount && currency && amount < minimumAmounts[currency as keyof typeof minimumAmounts]) {
    errors.push({
      field: 'amount',
      message: `Minimum amount for ${currency} is ${minimumAmounts[currency as keyof typeof minimumAmounts]}`,
      code: 'number.min'
    });
  }

  // Validate currency and network compatibility
  const networkCurrencyCompatibility = {
    ethereum: ['ETH', 'USDC', 'USDT'],
    polygon: ['MATIC', 'USDC', 'USDT']
  };

  if (currency && blockchainNetwork) {
    const compatibleCurrencies = networkCurrencyCompatibility[blockchainNetwork as keyof typeof networkCurrencyCompatibility];
    if (!compatibleCurrencies?.includes(currency)) {
      errors.push({
        field: 'currency',
        message: `Currency ${currency} is not supported on ${blockchainNetwork} network`,
        code: 'currency.network.incompatible'
      });
    }
  }

  if (errors.length > 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse('Payment validation failed', 'VALIDATION_ERROR', errors)
    );
    return;
  }

  next();
};

// Validate doctor availability
export const validateDoctorAvailability = (req: Request, res: Response, next: NextFunction): void => {
  const { availability } = req.body;
  
  if (!availability || !Array.isArray(availability)) {
    return next(); // Skip if no availability data
  }

  const errors: Array<{ field: string; message: string; code: string }> = [];

  availability.forEach((slot, index) => {
    const { day, startTime, endTime } = slot;

    // Validate time format and logic
    if (startTime && endTime) {
      const start = new Date(`1970-01-01T${startTime}:00`);
      const end = new Date(`1970-01-01T${endTime}:00`);

      if (start >= end) {
        errors.push({
          field: `availability[${index}].endTime`,
          message: 'End time must be after start time',
          code: 'time.invalid'
        });
      }

      // Check for minimum slot duration (15 minutes)
      const duration = (end.getTime() - start.getTime()) / (1000 * 60);
      if (duration < 15) {
        errors.push({
          field: `availability[${index}]`,
          message: 'Minimum availability slot is 15 minutes',
          code: 'duration.min'
        });
      }
    }
  });

  // Check for overlapping slots on the same day
  const daySlots = availability.reduce((acc, slot) => {
    if (!acc[slot.day]) acc[slot.day] = [];
    acc[slot.day].push(slot);
    return acc;
  }, {} as any);

  Object.entries(daySlots).forEach(([day, slots]: [string, any[]]) => {
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const slot1 = slots[i];
        const slot2 = slots[j];
        
        const start1 = new Date(`1970-01-01T${slot1.startTime}:00`);
        const end1 = new Date(`1970-01-01T${slot1.endTime}:00`);
        const start2 = new Date(`1970-01-01T${slot2.startTime}:00`);
        const end2 = new Date(`1970-01-01T${slot2.endTime}:00`);

        if (start1 < end2 && start2 < end1) {
          errors.push({
            field: 'availability',
            message: `Overlapping time slots found for ${day}`,
            code: 'time.overlap'
          });
        }
      }
    }
  });

  if (errors.length > 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse('Doctor availability validation failed', 'VALIDATION_ERROR', errors)
    );
    return;
  }

  next();
};

// Validate search query
export const validateSearchQuery = (req: Request, res: Response, next: NextFunction): void => {
  const searchSchema = Joi.object({
    q: Joi.string().trim().min(1).max(100).optional(),
    category: Joi.string().trim().optional(),
    location: Joi.string().trim().max(100).optional(),
    specialization: Joi.string().trim().optional(),
    minRating: Joi.number().min(1).max(5).optional(),
    maxFee: Joi.number().positive().optional(),
    availability: Joi.string().valid('today', 'tomorrow', 'this_week').optional(),
    ...paginationSchema.describe().keys
  });

  validate(searchSchema, 'query')(req, res, next);
};

// Sanitize and validate rich text content
export const validateRichTextContent = (fieldName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const content = req.body[fieldName];
    
    if (!content) {
      return next();
    }

    // Basic HTML sanitization (remove script tags, etc.)
    const sanitizedContent = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');

    // Check content length
    if (sanitizedContent.length > 5000) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse(`${fieldName} content exceeds maximum length`, 'VALIDATION_ERROR')
      );
      return;
    }

    req.body[fieldName] = sanitizedContent;
    next();
  };
};

export default {
  validate,
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  validateDoctorProfile,
  validateConsultationRequest,
  validateConsultationUpdate,
  validateStartAIChat,
  validateSendMessage,
  validateAppointmentRequest,
  validatePaymentConfirmation,
  validateWithdrawalRequest,
  validateRating,
  validatePagination,
  validateDateRange,
  validateListQuery,
  validateObjectId,
  validateWalletAddress,
  validateTransactionHash,
  validateConsultationAccess,
  validateAppointmentScheduling,
  validateFileUpload,
  validateAIChatState,
  validatePaymentData,
  validateDoctorAvailability,
  validateSearchQuery,
  validateRichTextContent
};