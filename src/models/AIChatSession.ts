import mongoose, { Schema, Model } from 'mongoose';
import { 
  IAIChatSession, 
  IChatMessage, 
  IMessageAttachment, 
  ISessionFeedback 
} from '../types/AIChatSession';
import { IAIAnalysis, IPayment } from '../types/Consultation';

// Message Attachment Schema
const messageAttachmentSchema = new Schema<IMessageAttachment>({
  type: {
    type: String,
    required: true,
    enum: ['image', 'document', 'audio']
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  filename: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  }
}, { _id: false });

// Chat Message Schema
const chatMessageSchema = new Schema<IChatMessage>({
  messageId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  sender: {
    type: String,
    required: true,
    enum: ['user', 'ai']
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  messageType: {
    type: String,
    required: true,
    enum: ['text', 'symptom_input', 'analysis_result', 'question', 'clarification'],
    default: 'text'
  },
  metadata: {
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    suggestedQuestions: [String],
    riskAssessment: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    requiresFollowUp: {
      type: Boolean,
      default: false
    }
  },
  attachments: [messageAttachmentSchema]
}, { timestamps: true });

// Session Feedback Schema
const sessionFeedbackSchema = new Schema<ISessionFeedback>({
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  helpful: {
    type: Boolean,
    required: true
  },
  accurate: {
    type: Boolean,
    required: true
  },
  easyToUnderstand: {
    type: Boolean,
    required: true
  },
  feedback: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  wouldRecommend: {
    type: Boolean,
    required: true
  },
  improvementSuggestions: [String],
  ratedAt: {
    type: Date,
    required: true,
    default: Date.now
  }
}, { _id: false });

// AI Analysis Schema (reused from Consultation)
const aiAnalysisSchema = new Schema<IAIAnalysis>({
  riskLevel: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high']
  },
  suggestedActions: {
    type: [String],
    required: true
  },
  recommendSeeDoctor: {
    type: Boolean,
    required: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  possibleConditions: [String],
  urgencyLevel: {
    type: String,
    required: true,
    enum: ['routine', 'urgent', 'emergency'],
    default: 'routine'
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  aiModel: {
    type: String,
    required: true,
    default: 'gpt-4'
  },
  analysisVersion: {
    type: String,
    required: true,
    default: '1.0.0'
  }
}, { _id: false });

// Payment Schema (reused from Consultation)
const paymentSchema = new Schema<IPayment>({
  transactionHash: {
    type: String,
    trim: true,
    validate: {
      validator: function(v: string) {
        return !v || /^0x[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'Invalid transaction hash format'
    }
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    enum: ['ETH', 'USDC', 'MATIC', 'USDT']
  },
  gasFee: {
    type: Number,
    required: true,
    min: 0
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0
  },
  doctorEarnings: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paidAt: Date,
  refundedAt: Date,
  refundReason: {
    type: String,
    trim: true
  },
  blockchainNetwork: {
    type: String,
    required: true,
    enum: ['ethereum', 'polygon']
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['wallet', 'card'],
    default: 'wallet'
  }
}, { _id: false });

// Main AI Chat Session Schema
const aiChatSessionSchema = new Schema<IAIChatSession>({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  messages: {
    type: [chatMessageSchema],
    default: [],
    validate: {
      validator: function(v: IChatMessage[]) {
        return v.length <= 100; // Limit messages per session
      },
      message: 'Maximum 100 messages per session allowed'
    }
  },
  symptoms: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0 && v.length <= 20;
      },
      message: 'Must have between 1 and 20 symptoms'
    }
  },
  finalAnalysis: aiAnalysisSchema,
  status: {
    type: String,
    required: true,
    enum: ['active', 'completed', 'escalated_to_doctor', 'abandoned'],
    default: 'active'
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  payment: {
    type: paymentSchema,
    required: true
  },
  escalationReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  doctorConsultationId: {
    type: String,
    ref: 'Consultation'
  },
  sessionDuration: {
    type: Number,
    min: 0
  },
  messageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  language: {
    type: String,
    required: true,
    default: 'en',
    trim: true
  },
  userFeedback: sessionFeedbackSchema,
  completedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
aiChatSessionSchema.index({ sessionId: 1 });
aiChatSessionSchema.index({ userId: 1 });
aiChatSessionSchema.index({ status: 1 });
aiChatSessionSchema.index({ createdAt: -1 });
aiChatSessionSchema.index({ completedAt: -1 });
aiChatSessionSchema.index({ 'payment.status': 1 });
aiChatSessionSchema.index({ 'finalAnalysis.riskLevel': 1 });

// Compound indexes
aiChatSessionSchema.index({ userId: 1, status: 1 });
aiChatSessionSchema.index({ userId: 1, createdAt: -1 });
aiChatSessionSchema.index({ status: 1, createdAt: -1 });
aiChatSessionSchema.index({ 'messages.messageId': 1 });

// Pre-save middleware
aiChatSessionSchema.pre('save', function(next) {
  // Update message count
  this.messageCount = this.messages.length;

  // Calculate session duration when completed
  if (this.isModified('status') && this.status !== 'active' && !this.completedAt) {
    this.completedAt = new Date();
    this.sessionDuration = Math.round((this.completedAt.getTime() - this.createdAt.getTime()) / 60000);
  }

  // Update total cost based on message count (example pricing model)
  const baseCost = 0.001; // Base cost in ETH
  const costPerMessage = 0.0001; // Cost per message in ETH
  this.totalCost = baseCost + (this.messageCount * costPerMessage);

  next();
});

// Instance methods
aiChatSessionSchema.methods.isActive = function(): boolean {
  return this.status === 'active';
};

aiChatSessionSchema.methods.isCompleted = function(): boolean {
  return this.status === 'completed';
};

aiChatSessionSchema.methods.canAddMessage = function(): boolean {
  return this.status === 'active' && this.messages.length < 100;
};

aiChatSessionSchema.methods.addMessage = function(
  messageId: string,
  sender: 'user' | 'ai',
  content: string,
  messageType: string = 'text',
  metadata?: any,
  attachments?: IMessageAttachment[]
): Promise<IAIChatSession> {
  if (!this.canAddMessage()) {
    throw new Error('Cannot add message to inactive session or session limit reached');
  }

  const message: IChatMessage = {
    messageId,
    sender,
    content,
    timestamp: new Date(),
    messageType: messageType as any,
    metadata,
    attachments
  };

  this.messages.push(message);
  return this.save();
};

aiChatSessionSchema.methods.addAIAnalysis = function(analysis: IAIAnalysis): Promise<IAIChatSession> {
  this.finalAnalysis = analysis;
  
  // Auto-escalate if high risk
  if (analysis.riskLevel === 'high' || analysis.recommendSeeDoctor) {
    this.status = 'escalated_to_doctor';
    this.escalationReason = 'High risk level detected by AI analysis';
  }

  return this.save();
};

aiChatSessionSchema.methods.completeSession = function(): Promise<IAIChatSession> {
  if (this.status !== 'active') {
    throw new Error('Can only complete active sessions');
  }

  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

aiChatSessionSchema.methods.escalateToDoctor = function(
  reason: string,
  doctorConsultationId?: string
): Promise<IAIChatSession> {
  if (this.status !== 'active') {
    throw new Error('Can only escalate active sessions');
  }

  this.status = 'escalated_to_doctor';
  this.escalationReason = reason;
  this.doctorConsultationId = doctorConsultationId;
  return this.save();
};

aiChatSessionSchema.methods.abandonSession = function(): Promise<IAIChatSession> {
  if (this.status !== 'active') {
    throw new Error('Can only abandon active sessions');
  }

  this.status = 'abandoned';
  this.completedAt = new Date();
  return this.save();
};

aiChatSessionSchema.methods.addFeedback = function(feedback: ISessionFeedback): Promise<IAIChatSession> {
  if (this.status === 'active') {
    throw new Error('Cannot add feedback to active session');
  }

  this.userFeedback = feedback;
  return this.save();
};

aiChatSessionSchema.methods.getLastMessage = function(): IChatMessage | null {
  return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
};

aiChatSessionSchema.methods.getMessagesByType = function(messageType: string): IChatMessage[] {
  return this.messages.filter(msg => msg.messageType === messageType);
};

aiChatSessionSchema.methods.getUserMessages = function(): IChatMessage[] {
  return this.messages.filter(msg => msg.sender === 'user');
};

aiChatSessionSchema.methods.getAIMessages = function(): IChatMessage[] {
  return this.messages.filter(msg => msg.sender === 'ai');
};

// Static methods
aiChatSessionSchema.statics.findBySessionId = function(sessionId: string): Promise<IAIChatSession | null> {
  return this.findOne({ sessionId });
};

aiChatSessionSchema.statics.findByUser = function(userId: string, status?: string) {
  const query: any = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

aiChatSessionSchema.statics.findActiveSessions = function(userId?: string) {
  const query: any = { status: 'active' };
  if (userId) query.userId = userId;
  return this.find(query).sort({ createdAt: -1 });
};

aiChatSessionSchema.statics.findEscalatedSessions = function() {
  return this.find({ status: 'escalated_to_doctor' }).sort({ createdAt: -1 });
};

aiChatSessionSchema.statics.getSessionStats = function(userId?: string) {
  const matchStage: any = {};
  if (userId) matchStage.userId = userId;

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        activeSessions: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        completedSessions: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        escalatedSessions: { $sum: { $cond: [{ $eq: ['$status', 'escalated_to_doctor'] }, 1, 0] } },
        abandonedSessions: { $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] } },
        averageSessionDuration: { $avg: '$sessionDuration' },
        averageMessageCount: { $avg: '$messageCount' },
        totalRevenue: { $sum: '$totalCost' },
        averageRating: { $avg: '$userFeedback.rating' }
      }
    },
    {
      $addFields: {
        escalationRate: { $divide: ['$escalatedSessions', '$totalSessions'] },
        completionRate: { $divide: ['$completedSessions', '$totalSessions'] },
        abandonmentRate: { $divide: ['$abandonedSessions', '$totalSessions'] }
      }
    }
  ]);
};

aiChatSessionSchema.statics.getCommonSymptoms = function(limit: number = 10) {
  return this.aggregate([
    { $unwind: '$symptoms' },
    {
      $group: {
        _id: '$symptoms',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $project: {
        symptom: '$_id',
        count: 1,
        _id: 0
      }
    }
  ]);
};

aiChatSessionSchema.statics.findByMessageId = function(messageId: string): Promise<IAIChatSession | null> {
  return this.findOne({ 'messages.messageId': messageId });
};

// Virtual fields
aiChatSessionSchema.virtual('duration').get(function() {
  if (this.completedAt && this.createdAt) {
    return Math.round((this.completedAt.getTime() - this.createdAt.getTime()) / 60000);
  }
  return null;
});

aiChatSessionSchema.virtual('userInfo', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

aiChatSessionSchema.virtual('isEscalated').get(function() {
  return this.status === 'escalated_to_doctor';
});

aiChatSessionSchema.virtual('hasHighRisk').get(function() {
  return this.finalAnalysis?.riskLevel === 'high';
});

// Create and export the model
const AIChatSession: Model<IAIChatSession> = mongoose.model<IAIChatSession>('AIChatSession', aiChatSessionSchema);

export default AIChatSession;