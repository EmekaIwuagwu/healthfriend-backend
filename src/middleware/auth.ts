import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import User from '../models/User';
import { IUser } from '../types/User';
import { createErrorResponse } from '../utils/helpers';
import { HTTP_STATUS } from '../utils/constants';

// Extend Request interface to include user
export interface AuthRequest extends Request {
  user?: IUser;
  userId?: string;
}

// JWT Authentication Middleware
export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('Access token required', 'AUTHENTICATION_ERROR')
      );
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Find user by ID
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('User not found or inactive', 'AUTHENTICATION_ERROR')
      );
      return;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Attach user to request
    req.user = user;
    req.userId = user._id.toString();

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('Invalid token', 'AUTHENTICATION_ERROR')
      );
    } else if (error.name === 'TokenExpiredError') {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('Token expired', 'AUTHENTICATION_ERROR')
      );
    } else {
      console.error('Authentication error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Authentication failed', 'INTERNAL_ERROR')
      );
    }
  }
};

// Optional Authentication Middleware (doesn't throw error if no token)
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id.toString();
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
      }
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

// Role-based Authorization Middleware
export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
      );
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(HTTP_STATUS.FORBIDDEN).json(
        createErrorResponse('Insufficient permissions', 'AUTHORIZATION_ERROR')
      );
      return;
    }

    next();
  };
};

// Admin Only Middleware
export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Admin access required', 'AUTHORIZATION_ERROR')
    );
    return;
  }
  next();
};

// Doctor Only Middleware
export const doctorOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'doctor') {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
    );
    return;
  }
  next();
};

// Verified Doctor Only Middleware
export const verifiedDoctorOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'doctor') {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Doctor access required', 'AUTHORIZATION_ERROR')
    );
    return;
  }

  if (!req.user.doctorProfile?.isVerified) {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Verified doctor access required', 'AUTHORIZATION_ERROR')
    );
    return;
  }

  next();
};

// Patient Only Middleware
export const patientOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'patient') {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Patient access required', 'AUTHORIZATION_ERROR')
    );
    return;
  }
  next();
};

// Self or Admin Access Middleware (user can access their own data or admin can access any)
export const selfOrAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json(
      createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
    );
    return;
  }

  const targetUserId = req.params.id || req.params.userId;
  const isOwnData = req.user._id.toString() === targetUserId;
  const isAdmin = req.user.role === 'admin';

  if (!isOwnData && !isAdmin) {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Access denied', 'AUTHORIZATION_ERROR')
    );
    return;
  }

  next();
};

// Doctor or Patient Access (for consultation access)
export const doctorOrPatient = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || !['doctor', 'patient'].includes(req.user.role)) {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Doctor or patient access required', 'AUTHORIZATION_ERROR')
    );
    return;
  }
  next();
};

// Wallet Signature Verification Middleware
export const verifyWalletSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || !signature || !message) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse('Wallet address, signature, and message are required', 'VALIDATION_ERROR')
      );
      return;
    }

    // Verify the signature
    try {
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Invalid signature', 'AUTHENTICATION_ERROR')
        );
        return;
      }
    } catch (error) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('Signature verification failed', 'AUTHENTICATION_ERROR')
      );
      return;
    }

    next();
  } catch (error) {
    console.error('Wallet signature verification error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Signature verification error', 'INTERNAL_ERROR')
    );
  }
};

// Resource Ownership Middleware Factory
export const requireResourceOwnership = (resourceModel: any, resourceIdParam: string = 'id') => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('Resource not found', 'NOT_FOUND')
        );
        return;
      }

      // Check ownership (works for patient/doctor consultations, appointments, etc.)
      const isOwner = 
        resource.userId?.toString() === req.user._id.toString() || // General ownership
        resource.patientId?.toString() === req.user._id.toString() || // Patient resources
        resource.doctorId?.toString() === req.user._id.toString(); // Doctor resources

      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        res.status(HTTP_STATUS.FORBIDDEN).json(
          createErrorResponse('Access denied to this resource', 'AUTHORIZATION_ERROR')
        );
        return;
      }

      // Attach resource to request for controller use
      (req as any).resource = resource;
      next();
    } catch (error) {
      console.error('Resource ownership check error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Authorization check failed', 'INTERNAL_ERROR')
      );
    }
  };
};

// API Key Authentication (for internal services)
export const authenticateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.INTERNAL_API_KEY;

  if (!apiKey || !validApiKey || apiKey !== validApiKey) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json(
      createErrorResponse('Invalid API key', 'AUTHENTICATION_ERROR')
    );
    return;
  }

  next();
};

// Rate Limiting by User ID
export const rateLimitByUser = (requestsPerMinute: number = 60) => {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(); // Skip rate limiting for unauthenticated requests
    }

    const userId = req.user._id.toString();
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    const userLimit = userRequests.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize user limit
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (userLimit.count >= requestsPerMinute) {
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(
        createErrorResponse('Rate limit exceeded', 'RATE_LIMIT_ERROR')
      );
      return;
    }

    userLimit.count++;
    next();
  };
};

// Refresh Token Verification
export const verifyRefreshToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse('Refresh token required', 'VALIDATION_ERROR')
      );
      return;
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
    (req as any).tokenPayload = decoded;

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('Invalid refresh token', 'AUTHENTICATION_ERROR')
      );
    } else if (error.name === 'TokenExpiredError') {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse('Refresh token expired', 'AUTHENTICATION_ERROR')
      );
    } else {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Token verification failed', 'INTERNAL_ERROR')
      );
    }
  }
};

// Email Verification Required Middleware
export const requireEmailVerification = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !req.user.emailVerified) {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Email verification required', 'AUTHORIZATION_ERROR')
    );
    return;
  }
  next();
};

// Account Status Check Middleware
export const requireActiveAccount = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !req.user.isActive) {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      createErrorResponse('Account is inactive', 'AUTHORIZATION_ERROR')
    );
    return;
  }
  next();
};

export default {
  authenticateToken,
  optionalAuth,
  authorizeRoles,
  adminOnly,
  doctorOnly,
  verifiedDoctorOnly,
  patientOnly,
  selfOrAdmin,
  doctorOrPatient,
  verifyWalletSignature,
  requireResourceOwnership,
  authenticateApiKey,
  rateLimitByUser,
  verifyRefreshToken,
  requireEmailVerification,
  requireActiveAccount
};