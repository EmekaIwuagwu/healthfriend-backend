import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, Server as HTTPServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';

// Import configurations and utilities
import { connectDatabase } from './config/database';
import { 
  globalErrorHandler, 
  notFoundHandler,
  catchAsync 
} from './middleware/errorHandler';
import { 
  createSuccessResponse, 
  logInfo, 
  logError 
} from './utils/helpers';
import { 
  HTTP_STATUS,
  GLOBAL_RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW 
} from './utils/constants';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import consultationRoutes from './routes/consultations';
import doctorRoutes from './routes/doctors';
import patientRoutes from './routes/patients';
import aiRoutes from './routes/ai';
//import paymentRoutes from './routes/payments';
import adminRoutes from './routes/admin';

// Import socket handler
import SocketHandler from './socket/socketHandler';

// Load environment variables
dotenv.config();

class HealthFriendApp {
  public app: Application;
  public server: HTTPServer;
  private socketHandler: SocketHandler;
  private readonly PORT: number;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.PORT = parseInt(process.env.PORT || '5000', 10);

    this.initializeDatabase();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeSocketHandler();
    this.initializeErrorHandling();
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    try {
      await connectDatabase();
      logInfo('Database connection initialized');
    } catch (error) {
      logError('Database initialization failed:', error);
      process.exit(1);
    }
  }

  /**
   * Initialize middleware
   */
  private initializeMiddleware(): void {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);

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
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key'
      ],
      credentials: true,
      maxAge: 86400 // 24 hours
    }));

    // Compression middleware
    this.app.use(compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    }));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Global rate limiting
    this.app.use(rateLimit({
      windowMs: RATE_LIMIT_WINDOW,
      max: GLOBAL_RATE_LIMIT_MAX || 1000,
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later',
        error: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        return req.ip;
      },
      skip: (req) => {
        // Skip rate limiting for health checks and webhooks
        const skipPaths = ['/health', '/webhook'];
        return skipPaths.some(path => req.path.startsWith(path));
      }
    }));

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        logInfo('HTTP Request', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      });
      
      next();
    });

    // Static file serving
    this.app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
    this.app.use('/public', express.static(path.join(__dirname, '../public')));

    logInfo('Middleware initialized');
  }

  /**
   * Initialize API routes
   */
  private initializeRoutes(): void {
    // API version prefix
    const API_PREFIX = '/api/v1';

    // Health check endpoint (before rate limiting)
    this.app.get('/health', catchAsync(async (req: Request, res: Response) => {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        services: {
          database: 'connected',
          redis: 'connected', // You would check actual Redis connection
          socketIO: 'active'
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(healthStatus, 'Service is healthy')
      );
    }));

    // API routes
    this.app.use(`${API_PREFIX}/auth`, authRoutes);
    this.app.use(`${API_PREFIX}/users`, userRoutes);
    this.app.use(`${API_PREFIX}/consultations`, consultationRoutes);
    this.app.use(`${API_PREFIX}/doctors`, doctorRoutes);
    this.app.use(`${API_PREFIX}/patients`, patientRoutes);
    this.app.use(`${API_PREFIX}/ai`, aiRoutes);
    this.app.use(`${API_PREFIX}/payments`, paymentRoutes);
    this.app.use(`${API_PREFIX}/admin`, adminRoutes);

    // API documentation route
    this.app.get(`${API_PREFIX}/docs`, (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'HealthFriend API Documentation',
        data: {
          version: '1.0.0',
          endpoints: {
            auth: `${API_PREFIX}/auth`,
            users: `${API_PREFIX}/users`,
            consultations: `${API_PREFIX}/consultations`,
            doctors: `${API_PREFIX}/doctors`,
            patients: `${API_PREFIX}/patients`,
            ai: `${API_PREFIX}/ai`,
            payments: `${API_PREFIX}/payments`,
            admin: `${API_PREFIX}/admin`
          },
          features: [
            'JWT Authentication',
            'Wallet-based Login',
            'Video Consultations',
            'AI Health Assistant',
            'Crypto Payments',
            'Real-time Chat',
            'File Upload',
            'Admin Dashboard'
          ]
        }
      });
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'HealthFriend Backend API',
        data: {
          version: '1.0.0',
          status: 'running',
          documentation: `${API_PREFIX}/docs`,
          health: '/health'
        }
      });
    });

    logInfo('Routes initialized');
  }

  /**
   * Initialize Socket.IO handler
   */
  private initializeSocketHandler(): void {
    this.socketHandler = new SocketHandler(this.server);
    logInfo('Socket.IO handler initialized');
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(globalErrorHandler);

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
      logError('Unhandled Promise Rejection:', { reason, promise });
      // Gracefully close the server
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logError('Uncaught Exception:', error);
      // Exit immediately for uncaught exceptions
      process.exit(1);
    });

    // Graceful shutdown signals
    process.on('SIGTERM', () => {
      logInfo('SIGTERM received, starting graceful shutdown');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logInfo('SIGINT received, starting graceful shutdown');
      this.gracefulShutdown('SIGINT');
    });

    logInfo('Error handling initialized');
  }

  /**
   * Get allowed origins for CORS
   */
  private getAllowedOrigins(): string[] {
    const origins = [
      'http://localhost:3000', // React dev server
      'http://localhost:3001', // Alternative dev port
      'https://healthfriend.vercel.app', // Production frontend
    ];

    // Add environment-specific origins
    if (process.env.FRONTEND_URL) {
      origins.push(process.env.FRONTEND_URL);
    }

    if (process.env.ALLOWED_ORIGINS) {
      const additionalOrigins = process.env.ALLOWED_ORIGINS.split(',');
      origins.push(...additionalOrigins);
    }

    return origins;
  }

  /**
   * Start the server
   */
  public start(): void {
    this.server.listen(this.PORT, () => {
      logInfo('Server started successfully', {
        port: this.PORT,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid
      });

      // Log available endpoints
      this.logAvailableEndpoints();
    });
  }

  /**
   * Log available endpoints
   */
  private logAvailableEndpoints(): void {
    const baseUrl = `http://localhost:${this.PORT}`;
    
    logInfo('Available endpoints:', {
      health: `${baseUrl}/health`,
      docs: `${baseUrl}/api/v1/docs`,
      auth: `${baseUrl}/api/v1/auth`,
      users: `${baseUrl}/api/v1/users`,
      consultations: `${baseUrl}/api/v1/consultations`,
      doctors: `${baseUrl}/api/v1/doctors`,
      patients: `${baseUrl}/api/v1/patients`,
      ai: `${baseUrl}/api/v1/ai`,
      payments: `${baseUrl}/api/v1/payments`,
      admin: `${baseUrl}/api/v1/admin`
    });
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    logInfo(`Graceful shutdown initiated by ${signal}`);

    try {
      // Stop accepting new connections
      this.server.close(async () => {
        logInfo('HTTP server closed');

        // Close Socket.IO connections
        if (this.socketHandler) {
          await this.socketHandler.shutdown();
        }

        // Close database connection
        // await disconnectDatabase(); // You would implement this

        logInfo('Graceful shutdown completed');
        process.exit(0);
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logError('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);

    } catch (error) {
      logError('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get server instance
   */
  public getServer(): HTTPServer {
    return this.server;
  }

  /**
   * Get Express app instance
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Get Socket handler instance
   */
  public getSocketHandler(): SocketHandler {
    return this.socketHandler;
  }
}

// Create and start the application
const healthFriendApp = new HealthFriendApp();

// Start server only if this file is run directly
if (require.main === module) {
  healthFriendApp.start();
}

export default healthFriendApp;