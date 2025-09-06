import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Consultation from '../models/Consultation';
import AIChatSession from '../models/AIChatSession';
import { IUser } from '../types/User';
import { 
  logInfo, 
  logError, 
  logWarning 
} from '../utils/helpers';

// Extend Socket interface to include user
interface AuthenticatedSocket extends Socket {
  user?: IUser;
  userId?: string;
}

// Active connections tracking
interface UserConnection {
  socketId: string;
  userId: string;
  userRole: string;
  connectedAt: Date;
  lastActivity: Date;
  roomId?: string;
}

// Video call signaling data
interface VideoCallData {
  consultationId: string;
  offer?: any;
  answer?: any;
  candidate?: any;
}

// Chat message data
interface ChatMessage {
  consultationId: string;
  message: string;
  type: 'text' | 'file' | 'system';
  attachments?: string[];
}

// Typing indicator data
interface TypingData {
  consultationId: string;
  userId: string;
  isTyping: boolean;
}

class SocketHandler {
  private io: SocketIOServer;
  private activeConnections: Map<string, UserConnection> = new Map();
  private consultationRooms: Map<string, Set<string>> = new Map();
  private aiChatSessions: Map<string, Set<string>> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startCleanupTask();

    logInfo('Socket.IO server initialized');
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        
        // Find user
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
          return next(new Error('User not found or inactive'));
        }

        // Attach user to socket
        socket.user = user;
        socket.userId = user._id.toString();

        next();
      } catch (error) {
        logError('Socket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup main event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
      this.setupConsultationHandlers(socket);
      this.setupChatHandlers(socket);
      this.setupVideoCallHandlers(socket);
      this.setupAIChatHandlers(socket);
      this.setupNotificationHandlers(socket);
      this.setupGeneralHandlers(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    if (!socket.user) return;

    const connection: UserConnection = {
      socketId: socket.id,
      userId: socket.userId!,
      userRole: socket.user.role,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    this.activeConnections.set(socket.id, connection);

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);

    // Join role-based room
    socket.join(`role:${socket.user.role}`);

    logInfo('User connected via socket', {
      userId: socket.userId,
      userRole: socket.user.role,
      socketId: socket.id
    });

    // Emit connection success
    socket.emit('authenticated', {
      userId: socket.userId,
      role: socket.user.role,
      connectedAt: connection.connectedAt
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Update last activity on any event
    socket.onAny(() => {
      this.updateLastActivity(socket.id);
    });
  }

  /**
   * Setup consultation-related handlers
   */
  private setupConsultationHandlers(socket: AuthenticatedSocket): void {
    // Join consultation room
    socket.on('join_consultation', async (consultationId: string) => {
      try {
        if (!socket.user) return;

        // Verify user has access to this consultation
        const consultation = await Consultation.findById(consultationId);
        if (!consultation) {
          socket.emit('error', { message: 'Consultation not found' });
          return;
        }

        const hasAccess = 
          consultation.patientId.toString() === socket.userId ||
          consultation.doctorId.toString() === socket.userId ||
          socket.user.role === 'admin';

        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied to consultation' });
          return;
        }

        // Join consultation room
        const roomId = `consultation:${consultationId}`;
        socket.join(roomId);

        // Track room membership
        if (!this.consultationRooms.has(consultationId)) {
          this.consultationRooms.set(consultationId, new Set());
        }
        this.consultationRooms.get(consultationId)!.add(socket.id);

        // Update connection info
        const connection = this.activeConnections.get(socket.id);
        if (connection) {
          connection.roomId = roomId;
        }

        // Notify others in the room
        socket.to(roomId).emit('user_joined_consultation', {
          userId: socket.userId,
          userRole: socket.user.role,
          joinedAt: new Date()
        });

        socket.emit('consultation_joined', { consultationId });

        logInfo('User joined consultation room', {
          userId: socket.userId,
          consultationId,
          roomId
        });

      } catch (error) {
        logError('Join consultation failed:', error);
        socket.emit('error', { message: 'Failed to join consultation' });
      }
    });

    // Leave consultation room
    socket.on('leave_consultation', (consultationId: string) => {
      this.leaveConsultationRoom(socket, consultationId);
    });

    // Update consultation status
    socket.on('consultation_status_update', async (data: { consultationId: string; status: string }) => {
      try {
        if (!socket.user || socket.user.role !== 'doctor') return;

        const consultation = await Consultation.findById(data.consultationId);
        if (!consultation || consultation.doctorId.toString() !== socket.userId) {
          return;
        }

        // Update consultation status
        consultation.status = data.status as any;
        await consultation.save();

        // Broadcast status update
        this.io.to(`consultation:${data.consultationId}`).emit('consultation_status_changed', {
          consultationId: data.consultationId,
          status: data.status,
          updatedBy: socket.userId,
          updatedAt: new Date()
        });

        logInfo('Consultation status updated', {
          consultationId: data.consultationId,
          status: data.status,
          doctorId: socket.userId
        });

      } catch (error) {
        logError('Consultation status update failed:', error);
      }
    });
  }

  /**
   * Setup chat message handlers
   */
  private setupChatHandlers(socket: AuthenticatedSocket): void {
    // Send chat message
    socket.on('send_message', async (data: ChatMessage) => {
      try {
        if (!socket.user) return;

        const { consultationId, message, type, attachments } = data;

        // Verify access to consultation
        const consultation = await Consultation.findById(consultationId);
        if (!consultation) {
          socket.emit('error', { message: 'Consultation not found' });
          return;
        }

        const hasAccess = 
          consultation.patientId.toString() === socket.userId ||
          consultation.doctorId.toString() === socket.userId;

        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Save message to database (you would implement this)
        const messageData = {
          consultationId,
          senderId: socket.userId,
          senderRole: socket.user.role,
          message,
          type,
          attachments: attachments || [],
          sentAt: new Date()
        };

        // Broadcast message to consultation room
        this.io.to(`consultation:${consultationId}`).emit('new_message', messageData);

        logInfo('Chat message sent', {
          consultationId,
          senderId: socket.userId,
          messageType: type
        });

      } catch (error) {
        logError('Send message failed:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing_start', (data: TypingData) => {
      if (!socket.user) return;
      
      socket.to(`consultation:${data.consultationId}`).emit('user_typing_start', {
        userId: socket.userId,
        consultationId: data.consultationId
      });
    });

    socket.on('typing_stop', (data: TypingData) => {
      if (!socket.user) return;
      
      socket.to(`consultation:${data.consultationId}`).emit('user_typing_stop', {
        userId: socket.userId,
        consultationId: data.consultationId
      });
    });
  }

  /**
   * Setup video call signaling handlers
   */
  private setupVideoCallHandlers(socket: AuthenticatedSocket): void {
    // WebRTC offer
    socket.on('video_offer', (data: VideoCallData) => {
      if (!socket.user) return;

      socket.to(`consultation:${data.consultationId}`).emit('video_offer', {
        ...data,
        from: socket.userId
      });

      logInfo('Video offer sent', {
        consultationId: data.consultationId,
        from: socket.userId
      });
    });

    // WebRTC answer
    socket.on('video_answer', (data: VideoCallData) => {
      if (!socket.user) return;

      socket.to(`consultation:${data.consultationId}`).emit('video_answer', {
        ...data,
        from: socket.userId
      });

      logInfo('Video answer sent', {
        consultationId: data.consultationId,
        from: socket.userId
      });
    });

    // ICE candidate
    socket.on('ice_candidate', (data: VideoCallData) => {
      if (!socket.user) return;

      socket.to(`consultation:${data.consultationId}`).emit('ice_candidate', {
        ...data,
        from: socket.userId
      });
    });

    // End video call
    socket.on('end_video_call', (data: { consultationId: string }) => {
      if (!socket.user) return;

      socket.to(`consultation:${data.consultationId}`).emit('video_call_ended', {
        consultationId: data.consultationId,
        endedBy: socket.userId,
        endedAt: new Date()
      });

      logInfo('Video call ended', {
        consultationId: data.consultationId,
        endedBy: socket.userId
      });
    });
  }

  /**
   * Setup AI chat handlers
   */
  private setupAIChatHandlers(socket: AuthenticatedSocket): void {
    // Join AI chat session
    socket.on('join_ai_chat', async (sessionId: string) => {
      try {
        if (!socket.user) return;

        // Verify user owns this AI chat session
        const session = await AIChatSession.findById(sessionId);
        if (!session || session.userId.toString() !== socket.userId) {
          socket.emit('error', { message: 'AI chat session not found or access denied' });
          return;
        }

        const roomId = `ai_chat:${sessionId}`;
        socket.join(roomId);

        // Track AI chat session
        if (!this.aiChatSessions.has(sessionId)) {
          this.aiChatSessions.set(sessionId, new Set());
        }
        this.aiChatSessions.get(sessionId)!.add(socket.id);

        socket.emit('ai_chat_joined', { sessionId });

        logInfo('User joined AI chat session', {
          userId: socket.userId,
          sessionId
        });

      } catch (error) {
        logError('Join AI chat failed:', error);
        socket.emit('error', { message: 'Failed to join AI chat' });
      }
    });

    // AI analysis update
    socket.on('ai_analysis_update', (data: { sessionId: string; analysis: any }) => {
      if (!socket.user) return;

      socket.to(`ai_chat:${data.sessionId}`).emit('ai_analysis_updated', {
        sessionId: data.sessionId,
        analysis: data.analysis,
        updatedAt: new Date()
      });
    });
  }

  /**
   * Setup notification handlers
   */
  private setupNotificationHandlers(socket: AuthenticatedSocket): void {
    // Mark notification as read
    socket.on('mark_notification_read', (notificationId: string) => {
      if (!socket.user) return;

      // In a real implementation, you would update the notification in the database
      socket.emit('notification_marked_read', { notificationId });
    });

    // Request notification history
    socket.on('get_notifications', async () => {
      if (!socket.user) return;

      // In a real implementation, you would fetch user notifications
      const notifications = []; // Fetch from database

      socket.emit('notifications_loaded', { notifications });
    });
  }

  /**
   * Setup general handlers
   */
  private setupGeneralHandlers(socket: AuthenticatedSocket): void {
    // Doctor availability update
    socket.on('update_availability', async (data: { isAvailable: boolean }) => {
      try {
        if (!socket.user || socket.user.role !== 'doctor') return;

        // Update doctor availability in database
        const user = await User.findById(socket.userId);
        if (user && user.doctorProfile) {
          user.doctorProfile.isAvailable = data.isAvailable;
          await user.save();

          // Broadcast availability update
          this.io.emit('doctor_availability_changed', {
            doctorId: socket.userId,
            isAvailable: data.isAvailable,
            updatedAt: new Date()
          });

          logInfo('Doctor availability updated', {
            doctorId: socket.userId,
            isAvailable: data.isAvailable
          });
        }

      } catch (error) {
        logError('Update availability failed:', error);
      }
    });

    // Connection quality feedback
    socket.on('connection_quality', (data: { quality: 'excellent' | 'good' | 'fair' | 'poor' }) => {
      if (!socket.user) return;

      logInfo('Connection quality reported', {
        userId: socket.userId,
        quality: data.quality,
        socketId: socket.id
      });
    });

    // Ping/pong for connection monitoring
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: AuthenticatedSocket): void {
    if (!socket.user) return;

    const connection = this.activeConnections.get(socket.id);
    if (connection) {
      // Leave any consultation rooms
      if (connection.roomId) {
        const consultationId = connection.roomId.split(':')[1];
        this.leaveConsultationRoom(socket, consultationId);
      }

      // Remove from active connections
      this.activeConnections.delete(socket.id);

      logInfo('User disconnected from socket', {
        userId: socket.userId,
        socketId: socket.id,
        connectedDuration: Date.now() - connection.connectedAt.getTime()
      });
    }
  }

  /**
   * Leave consultation room
   */
  private leaveConsultationRoom(socket: AuthenticatedSocket, consultationId: string): void {
    const roomId = `consultation:${consultationId}`;
    socket.leave(roomId);

    // Remove from room tracking
    const roomSockets = this.consultationRooms.get(consultationId);
    if (roomSockets) {
      roomSockets.delete(socket.id);
      if (roomSockets.size === 0) {
        this.consultationRooms.delete(consultationId);
      }
    }

    // Notify others in the room
    socket.to(roomId).emit('user_left_consultation', {
      userId: socket.userId,
      consultationId,
      leftAt: new Date()
    });

    socket.emit('consultation_left', { consultationId });

    logInfo('User left consultation room', {
      userId: socket.userId,
      consultationId
    });
  }

  /**
   * Update last activity for a connection
   */
  private updateLastActivity(socketId: string): void {
    const connection = this.activeConnections.get(socketId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * Send notification to specific user
   */
  public sendNotificationToUser(userId: string, notification: any): void {
    this.io.to(`user:${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date()
    });

    logInfo('Notification sent to user', {
      userId,
      type: notification.type
    });
  }

  /**
   * Send notification to all users with specific role
   */
  public sendNotificationToRole(role: string, notification: any): void {
    this.io.to(`role:${role}`).emit('notification', {
      ...notification,
      timestamp: new Date()
    });

    logInfo('Notification sent to role', {
      role,
      type: notification.type
    });
  }

  /**
   * Broadcast system announcement
   */
  public broadcastSystemAnnouncement(announcement: any): void {
    this.io.emit('system_announcement', {
      ...announcement,
      timestamp: new Date()
    });

    logInfo('System announcement broadcasted', {
      type: announcement.type
    });
  }

  /**
   * Get active connections count
   */
  public getActiveConnectionsCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Get connections by role
   */
  public getConnectionsByRole(): Record<string, number> {
    const roleCount: Record<string, number> = {};
    
    for (const connection of this.activeConnections.values()) {
      roleCount[connection.userRole] = (roleCount[connection.userRole] || 0) + 1;
    }

    return roleCount;
  }

  /**
   * Cleanup inactive connections
   */
  private startCleanupTask(): void {
    setInterval(() => {
      const now = Date.now();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
      let cleanedCount = 0;

      for (const [socketId, connection] of this.activeConnections.entries()) {
        if (now - connection.lastActivity.getTime() > inactiveThreshold) {
          this.activeConnections.delete(socketId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logInfo('Cleaned up inactive connections', { count: cleanedCount });
      }
    }, 5 * 60 * 1000); // Run cleanup every 5 minutes
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logInfo('Shutting down Socket.IO server...');
    
    // Notify all connected users
    this.io.emit('server_shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date()
    });

    // Close all connections
    this.io.close();
    
    logInfo('Socket.IO server shutdown complete');
  }
}

export default SocketHandler;