import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { IUser, IUserRegistration, IUserLogin, IAuthTokens } from '../types';
import User from '../models/User';
import WalletService from '../services/walletService';
import EmailService from '../services/emailService';
import { AuthRequest } from '../middleware/auth';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  generateJWT, 
  generateRefreshToken,
  sanitizeUser,
  logInfo,
  logError
} from '../utils/helpers';
import { 
  HTTP_STATUS, 
  JWT_EXPIRE_TIME, 
  JWT_REFRESH_EXPIRE_TIME 
} from '../utils/constants';

class AuthController {
  /**
   * Generate wallet authentication nonce
   * POST /api/auth/nonce
   */
  async generateNonce(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress } = req.body;

      if (!walletAddress) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Wallet address is required', 'VALIDATION_ERROR')
        );
        return;
      }

      // Validate wallet address format
      const validation = WalletService.validateWalletAddress(walletAddress);
      if (!validation.isValid) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse(validation.error || 'Invalid wallet address', 'VALIDATION_ERROR')
        );
        return;
      }

      // Generate nonce and message
      const { nonce, message } = WalletService.generateAuthNonce(walletAddress);

      logInfo('Authentication nonce generated', { walletAddress });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          nonce,
          message,
          walletAddress
        }, 'Nonce generated successfully')
      );
    } catch (error) {
      logError('Nonce generation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to generate nonce', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Authenticate user with wallet signature
   * POST /api/auth/wallet-login
   */
  async walletLogin(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress, signature, message, userInfo } = req.body;

      if (!walletAddress || !signature || !message) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Wallet address, signature, and message are required', 'VALIDATION_ERROR')
        );
        return;
      }

      // Connect wallet and authenticate
      const { user, isNewUser } = await WalletService.connectWallet(
        walletAddress,
        signature,
        message,
        userInfo
      );

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Send welcome email for new users
      if (isNewUser) {
        try {
          await EmailService.sendWelcomeEmail({
            user,
            loginUrl: `${process.env.FRONTEND_URL}/dashboard`
          });
        } catch (emailError) {
          logError('Welcome email failed:', emailError);
          // Don't fail the login if email fails
        }
      }

      logInfo('User wallet login successful', { 
        userId: user._id,
        walletAddress,
        isNewUser,
        role: user.role 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          ...tokens,
          isNewUser,
          requiresProfileCompletion: this.requiresProfileCompletion(user)
        }, isNewUser ? 'Account created successfully' : 'Login successful')
      );
    } catch (error) {
      logError('Wallet login failed:', error);
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        createErrorResponse(
          error instanceof Error ? error.message : 'Authentication failed', 
          'AUTHENTICATION_ERROR'
        )
      );
    }
  }

  /**
   * Register new user
   * POST /api/auth/register
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const registrationData: IUserRegistration = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email: registrationData.email.toLowerCase() },
          { walletAddress: registrationData.walletAddress.toLowerCase() }
        ]
      });

      if (existingUser) {
        res.status(HTTP_STATUS.CONFLICT).json(
          createErrorResponse('User already exists with this email or wallet address', 'DUPLICATE_ENTRY')
        );
        return;
      }

      // Create new user
      const user = new User({
        ...registrationData,
        walletAddress: registrationData.walletAddress.toLowerCase(),
        email: registrationData.email.toLowerCase(),
        isActive: true,
        emailVerified: false
      });

      await user.save();

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Send welcome email
      try {
        await EmailService.sendWelcomeEmail({
          user,
          loginUrl: `${process.env.FRONTEND_URL}/dashboard`
        });
      } catch (emailError) {
        logError('Welcome email failed:', emailError);
      }

      logInfo('User registered successfully', { 
        userId: user._id,
        email: user.email,
        role: user.role 
      });

      res.status(HTTP_STATUS.CREATED).json(
        createSuccessResponse({
          ...tokens,
          requiresProfileCompletion: this.requiresProfileCompletion(user)
        }, 'Registration successful')
      );
    } catch (error) {
      logError('User registration failed:', error);
      
      if (error instanceof Error && error.message.includes('duplicate key')) {
        res.status(HTTP_STATUS.CONFLICT).json(
          createErrorResponse('User already exists', 'DUPLICATE_ENTRY')
        );
      } else {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse('Registration failed', 'INTERNAL_ERROR')
        );
      }
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh-token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Refresh token is required', 'VALIDATION_ERROR')
        );
        return;
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
      
      // Find user
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('User not found or inactive', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      // Generate new tokens
      const tokens = this.generateTokens(user);

      logInfo('Token refreshed successfully', { userId: user._id });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(tokens, 'Token refreshed successfully')
      );
    } catch (error) {
      logError('Token refresh failed:', error);
      
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Invalid refresh token', 'AUTHENTICATION_ERROR')
        );
      } else if (error instanceof jwt.TokenExpiredError) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Refresh token expired', 'AUTHENTICATION_ERROR')
        );
      } else {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse('Token refresh failed', 'INTERNAL_ERROR')
        );
      }
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  async getCurrentUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('User not authenticated', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      // Get fresh user data with populated fields
      const user = await User.findById(req.user._id)
        .select('-signature -nonce')
        .lean();

      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          user: sanitizeUser(user as any),
          requiresProfileCompletion: this.requiresProfileCompletion(user as any)
        }, 'User profile retrieved successfully')
      );
    } catch (error) {
      logError('Get current user failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to retrieve user profile', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   */
  async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      // In a stateless JWT system, logout is mainly client-side
      // However, we can log the logout event and potentially blacklist the token
      
      if (req.user) {
        logInfo('User logged out', { userId: req.user._id });
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(null, 'Logout successful')
      );
    } catch (error) {
      logError('Logout failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Logout failed', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Send password reset email (for future email/password auth)
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Email is required', 'VALIDATION_ERROR')
        );
        return;
      }

      const user = await User.findOne({ email: email.toLowerCase() });
      
      // Always return success to prevent email enumeration
      if (!user) {
        res.status(HTTP_STATUS.OK).json(
          createSuccessResponse(null, 'If an account exists with this email, a reset link has been sent')
        );
        return;
      }

      // Generate reset token (valid for 1 hour)
      const resetToken = jwt.sign(
        { userId: user._id, type: 'password_reset' },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

      // Send password reset email
      try {
        await EmailService.sendPasswordReset(user.email, resetToken, resetUrl);
        logInfo('Password reset email sent', { userId: user._id, email: user.email });
      } catch (emailError) {
        logError('Password reset email failed:', emailError);
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(null, 'If an account exists with this email, a reset link has been sent')
      );
    } catch (error) {
      logError('Forgot password failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Password reset request failed', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Verify email address
   * POST /api/auth/verify-email
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Verification token is required', 'VALIDATION_ERROR')
        );
        return;
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      if (decoded.type !== 'email_verification') {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Invalid verification token', 'VALIDATION_ERROR')
        );
        return;
      }

      // Find and update user
      const user = await User.findById(decoded.userId);
      if (!user) {
        res.status(HTTP_STATUS.NOT_FOUND).json(
          createErrorResponse('User not found', 'NOT_FOUND')
        );
        return;
      }

      if (user.emailVerified) {
        res.status(HTTP_STATUS.OK).json(
          createSuccessResponse(null, 'Email already verified')
        );
        return;
      }

      user.emailVerified = true;
      await user.save();

      logInfo('Email verified successfully', { userId: user._id, email: user.email });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(null, 'Email verified successfully')
      );
    } catch (error) {
      logError('Email verification failed:', error);
      
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Invalid or expired verification token', 'VALIDATION_ERROR')
        );
      } else {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse('Email verification failed', 'INTERNAL_ERROR')
        );
      }
    }
  }

  /**
   * Resend email verification
   * POST /api/auth/resend-verification
   */
  async resendVerification(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Authentication required', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      if (req.user.emailVerified) {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse('Email already verified', 'VALIDATION_ERROR')
        );
        return;
      }

      // Generate verification token
      const verificationToken = jwt.sign(
        { userId: req.user._id, type: 'email_verification' },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' }
      );

      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

      // Send verification email (implement based on your email template)
      // For now, just log the URL
      logInfo('Email verification requested', { 
        userId: req.user._id, 
        email: req.user.email,
        verificationUrl 
      });

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(null, 'Verification email sent')
      );
    } catch (error) {
      logError('Resend verification failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to send verification email', 'INTERNAL_ERROR')
      );
    }
  }

  /**
   * Check authentication status
   * GET /api/auth/status
   */
  async checkAuthStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const isAuthenticated = !!req.user;
      
      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          isAuthenticated,
          user: isAuthenticated ? sanitizeUser(req.user!) : null
        }, 'Authentication status checked')
      );
    } catch (error) {
      logError('Auth status check failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Failed to check authentication status', 'INTERNAL_ERROR')
      );
    }
  }

  // Private helper methods

  private generateTokens(user: IUser): IAuthTokens {
    const payload = {
      userId: user._id,
      walletAddress: user.walletAddress,
      role: user.role
    };

    const accessToken = generateJWT(payload, JWT_EXPIRE_TIME);
    const refreshToken = generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      user: sanitizeUser(user)
    };
  }

  private requiresProfileCompletion(user: IUser): boolean {
    // Check if user needs to complete their profile
    const requiredFields = ['firstName', 'lastName', 'email'];
    const missingFields = requiredFields.filter(field => !user[field as keyof IUser]);
    
    // For doctors, check if doctor profile exists
    if (user.role === 'doctor') {
      return missingFields.length > 0 || !user.doctorProfile || !user.doctorProfile.specialization?.length;
    }

    return missingFields.length > 0;
  }

  /**
   * Validate user session
   * GET /api/auth/validate-session
   */
  async validateSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('Session invalid', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      // Check if user is still active
      const currentUser = await User.findById(req.user._id);
      if (!currentUser || !currentUser.isActive) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createErrorResponse('User account is inactive', 'AUTHENTICATION_ERROR')
        );
        return;
      }

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse({
          valid: true,
          user: sanitizeUser(currentUser),
          sessionInfo: {
            lastLogin: currentUser.lastLogin,
            emailVerified: currentUser.emailVerified,
            role: currentUser.role
          }
        }, 'Session is valid')
      );
    } catch (error) {
      logError('Session validation failed:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse('Session validation failed', 'INTERNAL_ERROR')
      );
    }
  }
}

export default new AuthController();