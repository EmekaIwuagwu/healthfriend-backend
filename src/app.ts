import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Import middleware
import { globalErrorHandler, notFoundHandler, requestLogger } from './middleware/errorHandler';
import { authenticateToken } from './middleware/auth';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import consultationRoutes from './routes/consultations';
import doctorRoutes from './routes/doctors';
import aiRoutes from './routes/ai';
import paymentRoutes from './routes/payments';
import adminRoutes from './routes/admin';

// Import services
import { connectDatabase } from './config/database';
import { setupSocketHandlers } from './socket/socketHandler';

// Import constants
import { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX, API_PREFIX } from './utils/constants';
import { logInfo, logError } from './utils/helpers';

// Load environment variables
dotenv.config();

class HealthFriendApp {
  public app: Application;
  public server: any;
  public io: SocketIOServer;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '5000', 10);
    
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.createServer();
  }

  /**
   * Initialize Express middlewares
   */
  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.getCorsOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: RATE_LIMIT_WINDOW,
      max: RATE_LIMIT_MAX,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Logging
    if (process.env.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Request logging middleware
    this.app.use(requestLogger);

    // Trust proxy (for deployment behind load balancer)
    this.app.set('trust proxy', 1);
  }

  /**
   * Initialize API routes
   */
  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', this.healthCheck);
    this.app.get('/', this.rootEndpoint);

    // API routes
    this.app.use(`${API_PREFIX}/auth`, authRoutes);
    this.app.use(`${API_PREFIX}/users`, userRoutes);
    this.app.use(`${API_PREFIX}/consultations`, consultationRoutes);
    this.app.use(`${API_PREFIX}/doctors`, doctorRoutes);
    this.app.use(`${API_PREFIX}/ai`, aiRoutes);
    this.app.use(`${API_PREFIX}/payments`, paymentRoutes);
    this.app.use(`${API_PREFIX}/admin`, adminRoutes);

    // Serve static files for uploads
    this.app.use('/uploads', express.static('uploads'));
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(globalErrorHandler);
  }

  /**
   * Create HTTP server and Socket.IO
   */
  private createServer(): void {
    this.server = createServer(this.app);
    
    // Initialize Socket.IO
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.getCorsOrigins(),
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Setup socket handlers
    setupSocketHandlers(this.io);
  }

  /**
   * Get CORS origins based on environment
   */
  private getCorsOrigins(): string[] | string {
    if (process.env.NODE_ENV === 'production') {
      return process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['https://healthfriend.app'];
    }
    return ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];
  }

  /**
   * Health check endpoint
   */
  private healthCheck = (req: Request, res: Response): void => {
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: 'connected', // Will be updated based on actual connection status
        ai: 'connected',
        payment: 'connected',
        email: 'connected'
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
        external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100
      }
    };

    res.status(200).json(healthData);
  };

  /**
   * Root endpoint
   */
  private rootEndpoint = (req: Request, res: Response): void => {
    res.status(200).json({
      message: 'Welcome to HealthFriend API',
      version: process.env.npm_package_version || '1.0.0',
      documentation: `${req.protocol}://${req.get('host')}/docs`,
      status: 'running',
      timestamp: new Date().toISOString()
    });
  };

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Connect to database
      await connectDatabase();
      logInfo('Database connected successfully');

      // Start server
      this.server.listen(this.port, () => {
        logInfo(`HealthFriend API server running on port ${this.port}`);
        logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logInfo(`API Documentation: http://localhost:${this.port}/docs`);
        
        if (process.env.NODE_ENV === 'development') {
          logInfo(`Health Check: http://localhost:${this.port}/health`);
          logInfo(`Socket.IO Test: http://localhost:${this.port}/socket.io/`);
        }
      });

      // Graceful shutdown handlers
      this.setupGracefulShutdown();

    } catch (error) {
      logError('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach(signal => {
      process.on(signal, async () => {
        logInfo(`${signal} received. Starting graceful shutdown...`);
        
        try {
          // Close server
          await new Promise<void>((resolve) => {
            this.server.close(() => {
              logInfo('HTTP server closed');
              resolve();
            });
          });

          // Close Socket.IO
          this.io.close();
          logInfo('Socket.IO server closed');

          // Close database connection
          const mongoose = require('mongoose');
          await mongoose.connection.close();
          logInfo('Database connection closed');

          logInfo('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logError('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error: Error) => {
      logError('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logError('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        logInfo('Server stopped');
        resolve();
      });
    });
  }
}

// Create and export app instance
const healthFriendApp = new HealthFriendApp();

// Start server if this file is run directly
if (require.main === module) {
  healthFriendApp.start().catch((error) => {
    logError('Failed to start application:', error);
    process.exit(1);
  });
}

export default healthFriendApp;
export { HealthFriendApp };