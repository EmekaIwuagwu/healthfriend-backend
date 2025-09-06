import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ethers } from 'ethers';
import { 
  PLATFORM_FEE_PERCENTAGE, 
  AI_CONSULTATION_BASE_FEE, 
  VIDEO_CONSULTATION_BASE_FEE, 
  HOME_VISIT_BASE_FEE,
  GAS_ESTIMATES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE
} from './constants';
import { IUser, ApiResponse, PaginationInfo } from '../types';

// ID Generation
export const generateId = (prefix: string = ''): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `${prefix}${prefix ? '_' : ''}${timestamp}_${randomPart}`;
};

export const generateNonce = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const generateSessionId = (): string => {
  return generateId('session');
};

export const generateConsultationId = (): string => {
  return generateId('consultation');
};

export const generateAppointmentId = (): string => {
  return generateId('appointment');
};

export const generateTransactionId = (): string => {
  return generateId('transaction');
};

// Password & Authentication Helpers
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

export const generateJWT = (payload: any, expiresIn: string = '7d'): string => {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn });
};

export const verifyJWT = (token: string): any => {
  return jwt.verify(token, process.env.JWT_SECRET!);
};

export const generateRefreshToken = (payload: any): string => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d' });
};

// Wallet & Signature Verification
export const verifyWalletSignature = (
  message: string,
  signature: string,
  walletAddress: string
): boolean => {
  try {
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

export const createAuthMessage = (walletAddress: string, nonce: string): string => {
  const timestamp = Date.now();
  return `Welcome to HealthFriend!

Please sign this message to authenticate your wallet:

Wallet Address: ${walletAddress}
Nonce: ${nonce}
Timestamp: ${timestamp}

This request will not trigger a blockchain transaction or cost any gas fees.`;
};

// Payment & Fee Calculations
export const calculatePlatformFee = (amount: number): number => {
  return (amount * PLATFORM_FEE_PERCENTAGE) / 100;
};

export const calculateDoctorEarnings = (amount: number, platformFee: number): number => {
  return amount - platformFee;
};

export const calculateConsultationFee = (
  type: 'ai_chat' | 'video_call' | 'home_visit',
  doctorFee?: number
): number => {
  switch (type) {
    case 'ai_chat':
      return AI_CONSULTATION_BASE_FEE;
    case 'video_call':
      return doctorFee || VIDEO_CONSULTATION_BASE_FEE;
    case 'home_visit':
      return doctorFee || HOME_VISIT_BASE_FEE;
    default:
      return AI_CONSULTATION_BASE_FEE;
  }
};

export const estimateGasFee = (
  network: 'ethereum' | 'polygon',
  transactionType: 'transfer' | 'contract_call' = 'transfer'
): number => {
  const networkGas = GAS_ESTIMATES[network.toUpperCase() as keyof typeof GAS_ESTIMATES];
  return transactionType === 'transfer' ? networkGas.TRANSFER : networkGas.CONTRACT_CALL;
};

export const calculateTotalTransactionCost = (
  amount: number,
  gasFee: number,
  platformFee?: number
): number => {
  const fee = platformFee || calculatePlatformFee(amount);
  return amount + gasFee + fee;
};

// Date & Time Helpers
export const formatDate = (date: Date, format: 'short' | 'long' | 'time' = 'short'): string => {
  const options: Intl.DateTimeFormatOptions = {
    short: { year: 'numeric', month: 'short', day: 'numeric' },
    long: { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    },
    time: { hour: '2-digit', minute: '2-digit' }
  };
  
  return new Intl.DateTimeFormat('en-US', options[format]).format(date);
};

export const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60000);
};

export const addHours = (date: Date, hours: number): Date => {
  return new Date(date.getTime() + hours * 3600000);
};

export const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * 86400000);
};

export const isDateInFuture = (date: Date): boolean => {
  return date.getTime() > Date.now();
};

export const isDateInPast = (date: Date): boolean => {
  return date.getTime() < Date.now();
};

export const getDayOfWeek = (date: Date): string => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
};

export const isTimeSlotAvailable = (
  startTime: string,
  endTime: string,
  existingSlots: Array<{ startTime: string; endTime: string }>
): boolean => {
  const start = new Date(`1970-01-01T${startTime}:00`);
  const end = new Date(`1970-01-01T${endTime}:00`);
  
  return !existingSlots.some(slot => {
    const existingStart = new Date(`1970-01-01T${slot.startTime}:00`);
    const existingEnd = new Date(`1970-01-01T${slot.endTime}:00`);
    
    return (start < existingEnd && end > existingStart);
  });
};

// String Helpers
export const capitalizeFirstLetter = (string: string): string => {
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

export const formatName = (firstName: string, lastName: string): string => {
  return `${capitalizeFirstLetter(firstName)} ${capitalizeFirstLetter(lastName)}`;
};

export const maskEmail = (email: string): string => {
  const [username, domain] = email.split('@');
  const maskedUsername = username.slice(0, 2) + '*'.repeat(Math.max(0, username.length - 2));
  return `${maskedUsername}@${domain}`;
};

export const maskWalletAddress = (address: string): string => {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Array & Object Helpers
export const removeDuplicates = <T>(array: T[]): T[] => {
  return [...new Set(array)];
};

export const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
  return array.reduce((result, item) => {
    const group = String(item[key]);
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {} as Record<string, T[]>);
};

export const sortBy = <T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] => {
  return array.sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
};

export const omitFields = <T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): Omit<T, keyof T> => {
  const result = { ...obj };
  fields.forEach(field => delete result[field]);
  return result;
};

export const pickFields = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  fields: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  fields.forEach(field => {
    if (field in obj) {
      result[field] = obj[field];
    }
  });
  return result;
};

// Pagination Helpers
export const calculatePagination = (
  page: number = DEFAULT_PAGE,
  limit: number = DEFAULT_PAGE_SIZE,
  totalItems: number
): PaginationInfo => {
  const currentPage = Math.max(1, page);
  const itemsPerPage = Math.min(Math.max(1, limit), 100);
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1
  };
};

export const getPaginationQuery = (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  return { skip, limit };
};

// API Response Helpers
export const createSuccessResponse = <T>(
  data: T,
  message: string = 'Success',
  pagination?: PaginationInfo
): ApiResponse<T> => {
  return {
    success: true,
    message,
    data,
    pagination,
    timestamp: new Date()
  };
};

export const createErrorResponse = (
  message: string,
  error?: string,
  errors?: Array<{ field: string; message: string; code: string }>
): ApiResponse => {
  return {
    success: false,
    message,
    error,
    errors,
    timestamp: new Date()
  };
};

// User Helpers
export const sanitizeUser = (user: IUser): Partial<IUser> => {
  return omitFields(user.toObject(), ['signature', 'nonce', '__v']);
};

export const isDoctor = (user: IUser): boolean => {
  return user.role === 'doctor';
};

export const isPatient = (user: IUser): boolean => {
  return user.role === 'patient';
};

export const isAdmin = (user: IUser): boolean => {
  return user.role === 'admin';
};

export const isDoctorVerified = (user: IUser): boolean => {
  return isDoctor(user) && user.doctorProfile?.isVerified === true;
};

// File Helpers
export const getFileExtension = (filename: string): string => {
  return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);
};

export const generateFileName = (originalName: string, prefix: string = ''): string => {
  const extension = getFileExtension(originalName);
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}${prefix ? '_' : ''}${timestamp}_${random}.${extension}`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Validation Helpers
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
  return phoneRegex.test(phone);
};

export const isValidWalletAddress = (address: string): boolean => {
  const walletRegex = /^0x[a-fA-F0-9]{40}$/;
  return walletRegex.test(address);
};

// Error Handling Helpers
export const createAppError = (message: string, statusCode: number = 500, code?: string) => {
  const error = new Error(message) as any;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  return error;
};

export const handleAsyncError = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Logging Helpers
export const logInfo = (message: string, meta?: any) => {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta || '');
};

export const logError = (message: string, error?: any) => {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '');
};

export const logWarning = (message: string, meta?: any) => {
  console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta || '');
};