import Joi from 'joi';
import { REGEX_PATTERNS, VALIDATION_RULES, SUPPORTED_CURRENCIES, SUPPORTED_NETWORKS } from './constants';

// User validation schemas
export const userRegistrationSchema = Joi.object({
  walletAddress: Joi.string()
    .pattern(REGEX_PATTERNS.WALLET_ADDRESS)
    .required()
    .messages({
      'string.pattern.base': 'Invalid wallet address format',
      'any.required': 'Wallet address is required'
    }),
  firstName: Joi.string()
    .min(VALIDATION_RULES.NAME_MIN_LENGTH)
    .max(VALIDATION_RULES.NAME_MAX_LENGTH)
    .required()
    .messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 50 characters',
      'any.required': 'First name is required'
    }),
  lastName: Joi.string()
    .min(VALIDATION_RULES.NAME_MIN_LENGTH)
    .max(VALIDATION_RULES.NAME_MAX_LENGTH)
    .required()
    .messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 50 characters',
      'any.required': 'Last name is required'
    }),
  email: Joi.string()
    .email()
    .max(VALIDATION_RULES.EMAIL_MAX_LENGTH)
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'string.max': 'Email cannot exceed 254 characters',
      'any.required': 'Email is required'
    }),
  role: Joi.string()
    .valid('patient', 'doctor')
    .required()
    .messages({
      'any.only': 'Role must be either patient or doctor',
      'any.required': 'Role is required'
    }),
  phone: Joi.string()
    .pattern(REGEX_PATTERNS.PHONE)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid phone number format'
    }),
  dateOfBirth: Joi.date()
    .max('now')
    .optional()
    .messages({
      'date.max': 'Date of birth cannot be in the future'
    }),
  gender: Joi.string()
    .valid('male', 'female', 'other')
    .optional()
});

export const userLoginSchema = Joi.object({
  walletAddress: Joi.string()
    .pattern(REGEX_PATTERNS.WALLET_ADDRESS)
    .required()
    .messages({
      'string.pattern.base': 'Invalid wallet address format',
      'any.required': 'Wallet address is required'
    }),
  signature: Joi.string()
    .required()
    .messages({
      'any.required': 'Signature is required'
    }),
  message: Joi.string()
    .required()
    .messages({
      'any.required': 'Message is required'
    })
});

export const userUpdateSchema = Joi.object({
  firstName: Joi.string()
    .min(VALIDATION_RULES.NAME_MIN_LENGTH)
    .max(VALIDATION_RULES.NAME_MAX_LENGTH)
    .optional(),
  lastName: Joi.string()
    .min(VALIDATION_RULES.NAME_MIN_LENGTH)
    .max(VALIDATION_RULES.NAME_MAX_LENGTH)
    .optional(),
  email: Joi.string()
    .email()
    .max(VALIDATION_RULES.EMAIL_MAX_LENGTH)
    .optional(),
  phone: Joi.string()
    .pattern(REGEX_PATTERNS.PHONE)
    .optional(),
  dateOfBirth: Joi.date()
    .max('now')
    .optional(),
  gender: Joi.string()
    .valid('male', 'female', 'other')
    .optional(),
  address: Joi.object({
    street: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    country: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional()
    }).optional()
  }).optional(),
  allergies: Joi.array()
    .items(Joi.string())
    .max(VALIDATION_RULES.ALLERGIES_MAX_COUNT)
    .optional(),
  currentMedications: Joi.array()
    .items(Joi.string())
    .max(VALIDATION_RULES.MEDICATIONS_MAX_COUNT)
    .optional(),
  emergencyContact: Joi.object({
    name: Joi.string().required(),
    phone: Joi.string().pattern(REGEX_PATTERNS.PHONE).required(),
    relationship: Joi.string().required()
  }).optional()
});

// Doctor profile validation
export const doctorProfileSchema = Joi.object({
  specialization: Joi.array()
    .items(Joi.string())
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one specialization is required'
    }),
  licenseNumber: Joi.string()
    .required()
    .messages({
      'any.required': 'License number is required'
    }),
  yearsExperience: Joi.number()
    .integer()
    .min(0)
    .max(60)
    .required()
    .messages({
      'number.min': 'Years of experience cannot be negative',
      'number.max': 'Years of experience cannot exceed 60'
    }),
  education: Joi.array()
    .items(Joi.string())
    .min(1)
    .required(),
  certifications: Joi.array()
    .items(Joi.string())
    .optional(),
  languages: Joi.array()
    .items(Joi.string())
    .min(1)
    .required(),
  consultationFee: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'Consultation fee must be positive'
    }),
  homeVisitFee: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'Home visit fee must be positive'
    }),
  bio: Joi.string()
    .max(VALIDATION_RULES.BIO_MAX_LENGTH)
    .optional(),
  availability: Joi.array()
    .items(Joi.object({
      day: Joi.string()
        .valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
        .required(),
      startTime: Joi.string()
        .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          'string.pattern.base': 'Start time must be in HH:MM format'
        }),
      endTime: Joi.string()
        .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          'string.pattern.base': 'End time must be in HH:MM format'
        })
    }))
    .optional()
});

// Consultation validation schemas
export const consultationRequestSchema = Joi.object({
  type: Joi.string()
    .valid('ai_chat', 'video_call', 'home_visit')
    .required()
    .messages({
      'any.only': 'Type must be ai_chat, video_call, or home_visit'
    }),
  doctorId: Joi.string()
    .when('type', {
      is: Joi.valid('video_call', 'home_visit'),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .messages({
      'any.required': 'Doctor ID is required for video calls and home visits'
    }),
  scheduledDateTime: Joi.date()
    .min('now')
    .when('type', {
      is: Joi.valid('video_call', 'home_visit'),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .messages({
      'date.min': 'Scheduled date time must be in the future'
    }),
  symptoms: Joi.array()
    .items(Joi.string().trim().min(1))
    .min(1)
    .max(VALIDATION_RULES.SYMPTOMS_MAX_COUNT)
    .required()
    .messages({
      'array.min': 'At least one symptom is required',
      'array.max': `Cannot exceed ${VALIDATION_RULES.SYMPTOMS_MAX_COUNT} symptoms`
    }),
  description: Joi.string()
    .min(10)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Description must be at least 10 characters',
      'string.max': 'Description cannot exceed 1000 characters'
    }),
  paymentCurrency: Joi.string()
    .valid(...SUPPORTED_CURRENCIES)
    .required()
    .messages({
      'any.only': `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`
    }),
  homeVisitAddress: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().required(),
    zipCode: Joi.string().required(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).required(),
      lng: Joi.number().min(-180).max(180).required()
    }).optional()
  }).when('type', {
    is: 'home_visit',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  urgency: Joi.string()
    .valid('routine', 'urgent', 'emergency')
    .optional()
});

export const consultationUpdateSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'in_progress', 'completed', 'cancelled')
    .optional(),
  doctorNotes: Joi.string()
    .max(2000)
    .optional(),
  prescription: Joi.array()
    .items(Joi.object({
      medication: Joi.string().required(),
      dosage: Joi.string().required(),
      frequency: Joi.string().required(),
      duration: Joi.string().required(),
      instructions: Joi.string().required(),
      startDate: Joi.date().required(),
      endDate: Joi.date().optional(),
      refillsRemaining: Joi.number().integer().min(0).optional()
    }))
    .optional(),
  diagnosis: Joi.string()
    .max(500)
    .optional(),
  followUpRequired: Joi.boolean()
    .optional(),
  followUpDate: Joi.date()
    .min('now')
    .optional()
});

// AI Chat validation schemas
export const startAIChatSchema = Joi.object({
  symptoms: Joi.array()
    .items(Joi.string().trim().min(1))
    .min(1)
    .max(VALIDATION_RULES.SYMPTOMS_MAX_COUNT)
    .required(),
  description: Joi.string()
    .min(10)
    .max(1000)
    .required(),
  urgency: Joi.string()
    .valid('routine', 'urgent', 'emergency')
    .optional(),
  language: Joi.string()
    .optional(),
  paymentCurrency: Joi.string()
    .valid(...SUPPORTED_CURRENCIES)
    .required()
});

export const sendMessageSchema = Joi.object({
  sessionId: Joi.string()
    .required(),
  content: Joi.string()
    .min(1)
    .max(1000)
    .required(),
  messageType: Joi.string()
    .valid('text', 'symptom_input', 'clarification')
    .optional()
});

// Appointment validation schemas
export const appointmentRequestSchema = Joi.object({
  doctorId: Joi.string()
    .required(),
  type: Joi.string()
    .valid('video_call', 'home_visit')
    .required(),
  scheduledDateTime: Joi.date()
    .min('now')
    .required(),
  duration: Joi.number()
    .integer()
    .min(15)
    .max(180)
    .optional(),
  notes: Joi.string()
    .max(500)
    .optional(),
  timeZone: Joi.string()
    .required()
});

// Payment validation schemas
export const paymentConfirmationSchema = Joi.object({
  transactionHash: Joi.string()
    .pattern(REGEX_PATTERNS.TRANSACTION_HASH)
    .required()
    .messages({
      'string.pattern.base': 'Invalid transaction hash format'
    }),
  blockchainNetwork: Joi.string()
    .valid(...SUPPORTED_NETWORKS)
    .required(),
  fromAddress: Joi.string()
    .pattern(REGEX_PATTERNS.WALLET_ADDRESS)
    .required(),
  amount: Joi.number()
    .positive()
    .required(),
  currency: Joi.string()
    .valid(...SUPPORTED_CURRENCIES)
    .required()
});

export const withdrawalRequestSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .required(),
  currency: Joi.string()
    .valid(...SUPPORTED_CURRENCIES)
    .required(),
  toAddress: Joi.string()
    .pattern(REGEX_PATTERNS.WALLET_ADDRESS)
    .required(),
  blockchainNetwork: Joi.string()
    .valid(...SUPPORTED_NETWORKS)
    .required(),
  withdrawalType: Joi.string()
    .valid('earnings', 'refund')
    .required()
});

// Rating validation schema
export const ratingSchema = Joi.object({
  rating: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required()
    .messages({
      'number.min': 'Rating must be at least 1',
      'number.max': 'Rating cannot exceed 5'
    }),
  feedback: Joi.string()
    .max(1000)
    .optional(),
  categories: Joi.object({
    communication: Joi.number().integer().min(1).max(5).optional(),
    professionalism: Joi.number().integer().min(1).max(5).optional(),
    effectiveness: Joi.number().integer().min(1).max(5).optional(),
    punctuality: Joi.number().integer().min(1).max(5).optional()
  }).optional()
});

// Query validation schemas
export const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional(),
  sortBy: Joi.string()
    .optional(),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .optional()
});

export const dateRangeSchema = Joi.object({
  dateFrom: Joi.date()
    .optional(),
  dateTo: Joi.date()
    .min(Joi.ref('dateFrom'))
    .optional()
    .messages({
      'date.min': 'End date must be after start date'
    })
});

// Validation helper functions
export const validateSchema = (schema: Joi.ObjectSchema, data: any) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false
  });

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      code: detail.type
    }));
    
    return { isValid: false, errors: validationErrors, data: null };
  }

  return { isValid: true, errors: [], data: value };
};

export const validateWalletAddress = (address: string): boolean => {
  return REGEX_PATTERNS.WALLET_ADDRESS.test(address);
};

export const validateTransactionHash = (hash: string): boolean => {
  return REGEX_PATTERNS.TRANSACTION_HASH.test(hash);
};

export const validateEmail = (email: string): boolean => {
  return REGEX_PATTERNS.EMAIL.test(email);
};

export const validatePhone = (phone: string): boolean => {
  return REGEX_PATTERNS.PHONE.test(phone);
};