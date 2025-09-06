import mongoose, { Schema, Model } from 'mongoose';
import { 
  ITransaction, 
  ITransactionMetadata, 
  IExchangeRate, 
  IWallet, 
  IWalletBalance, 
  IEarnings, 
  IEarningsBreakdown 
} from '../types/Transaction';

// Exchange Rate Schema
const exchangeRateSchema = new Schema<IExchangeRate>({
  usdRate: {
    type: Number,
    required: true,
    min: 0
  },
  eurRate: {
    type: Number,
    min: 0
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  source: {
    type: String,
    required: true,
    trim: true,
    default: 'coingecko'
  }
}, { _id: false });

// Transaction Metadata Schema
const transactionMetadataSchema = new Schema<ITransactionMetadata>({
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  category: {
    type: String,
    trim: true
  },
  tags: [String],
  internalNotes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  customerNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  relatedTransactionIds: [String],
  recurringPayment: {
    type: Boolean,
    default: false
  },
  installmentInfo: {
    installmentNumber: {
      type: Number,
      min: 1
    },
    totalInstallments: {
      type: Number,
      min: 1
    },
    parentTransactionId: String
  }
}, { _id: false });

// Main Transaction Schema
const transactionSchema = new Schema<ITransaction>({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  transactionHash: {
    type: String,
    trim: true,
    sparse: true,
    validate: {
      validator: function(v: string) {
        return !v || /^0x[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'Invalid transaction hash format'
    }
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  doctorId: {
    type: String,
    ref: 'User',
    validate: {
      validator: function(this: ITransaction, v: string) {
        // Doctor ID is required for certain transaction types
        const requiresDoctor = ['video_consultation', 'home_visit', 'doctor_withdrawal'].includes(this.type);
        return !requiresDoctor || !!v;
      },
      message: 'Doctor ID is required for this transaction type'
    }
  },
  consultationId: {
    type: String,
    ref: 'Consultation',
    validate: {
      validator: function(this: ITransaction, v: string) {
        // Consultation ID is required for consultation payments
        const requiresConsultation = ['ai_consultation', 'video_consultation', 'home_visit'].includes(this.type);
        return !requiresConsultation || !!v;
      },
      message: 'Consultation ID is required for consultation payments'
    }
  },
  appointmentId: {
    type: String,
    ref: 'Appointment'
  },
  aiChatSessionId: {
    type: String,
    ref: 'AIChatSession'
  },
  type: {
    type: String,
    required: true,
    enum: ['ai_consultation', 'video_consultation', 'home_visit', 'doctor_withdrawal', 'refund', 'platform_fee']
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
    min: 0,
    default: 0
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  netAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  blockchainNetwork: {
    type: String,
    required: true,
    enum: ['ethereum', 'polygon']
  },
  fromAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid from address format'
    }
  },
  toAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid to address format'
    }
  },
  contractAddress: {
    type: String,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return !v || /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid contract address format'
    }
  },
  gasUsed: {
    type: Number,
    min: 0
  },
  gasPrice: {
    type: String,
    trim: true
  },
  blockNumber: {
    type: Number,
    min: 0
  },
  confirmations: {
    type: Number,
    min: 0,
    default: 0
  },
  failureReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  refundTransactionHash: {
    type: String,
    trim: true,
    validate: {
      validator: function(v: string) {
        return !v || /^0x[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'Invalid refund transaction hash format'
    }
  },
  metadata: transactionMetadataSchema,
  exchangeRate: exchangeRateSchema,
  completedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Wallet Balance Schema
const walletBalanceSchema = new Schema<IWalletBalance>({
  currency: {
    type: String,
    required: true,
    enum: ['ETH', 'USDC', 'MATIC', 'USDT']
  },
  balance: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  lockedBalance: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  lastUpdated: {
    type: Date,
    required: true,
    default: Date.now
  }
}, { _id: false });

// Wallet Schema
const walletSchema = new Schema<IWallet>({
  address: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid wallet address format'
    }
  },
  balance: [walletBalanceSchema],
  nonce: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  lastActivity: {
    type: Date,
    required: true,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  }
}, {
  timestamps: true
});

// Earnings Breakdown Schema
const earningsBreakdownSchema = new Schema<IEarningsBreakdown>({
  period: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly']
  },
  date: {
    type: Date,
    required: true
  },
  consultations: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  grossEarnings: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  platformFees: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  netEarnings: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  currency: {
    type: String,
    required: true,
    enum: ['ETH', 'USDC', 'MATIC', 'USDT']
  }
}, { timestamps: true });

// Earnings Schema
const earningsSchema = new Schema<IEarnings>({
  doctorId: {
    type: String,
    required: true,
    unique: true,
    ref: 'User'
  },
  totalEarnings: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  availableBalance: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  pendingBalance: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  withdrawnAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  platformFeesDeducted: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  earnings: [earningsBreakdownSchema],
  lastWithdrawal: Date,
  nextWithdrawalEligible: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for Transaction
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ transactionHash: 1 }, { sparse: true });
transactionSchema.index({ userId: 1 });
transactionSchema.index({ doctorId: 1 }, { sparse: true });
transactionSchema.index({ consultationId: 1 }, { sparse: true });
transactionSchema.index({ appointmentId: 1 }, { sparse: true });
transactionSchema.index({ aiChatSessionId: 1 }, { sparse: true });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ currency: 1 });
transactionSchema.index({ blockchainNetwork: 1 });
transactionSchema.index({ fromAddress: 1 });
transactionSchema.index({ toAddress: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ completedAt: -1 }, { sparse: true });

// Compound indexes
transactionSchema.index({ userId: 1, status: 1 });
transactionSchema.index({ doctorId: 1, status: 1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ doctorId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ blockchainNetwork: 1, status: 1 });

// Indexes for Wallet
walletSchema.index({ address: 1 });
walletSchema.index({ isActive: 1 });
walletSchema.index({ lastActivity: -1 });

// Indexes for Earnings
earningsSchema.index({ doctorId: 1 });
earningsSchema.index({ 'earnings.date': -1 });
earningsSchema.index({ 'earnings.period': 1, 'earnings.date': -1 });

// Pre-save middleware for Transaction
transactionSchema.pre('save', function(next) {
  // Calculate net amount if not provided
  if (!this.netAmount || this.isModified('amount') || this.isModified('gasFee') || this.isModified('platformFee')) {
    this.netAmount = this.amount - this.gasFee - this.platformFee;
  }

  // Set completion timestamp when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Validate net amount is not negative
  if (this.netAmount < 0) {
    return next(new Error('Net amount cannot be negative'));
  }

  next();
});

// Post-save middleware for Transaction
transactionSchema.post('save', function(doc) {
  // Update doctor earnings when transaction is completed
  if (doc.status === 'completed' && doc.doctorId && ['video_consultation', 'home_visit'].includes(doc.type)) {
    updateDoctorEarnings(doc);
  }
});

// Instance methods for Transaction
transactionSchema.methods.isCompleted = function(): boolean {
  return this.status === 'completed';
};

transactionSchema.methods.isPending = function(): boolean {
  return this.status === 'pending';
};

transactionSchema.methods.canBeRefunded = function(): boolean {
  return this.status === 'completed' && !this.refundTransactionHash;
};

transactionSchema.methods.complete = function(
  transactionHash?: string,
  blockNumber?: number,
  gasUsed?: number
): Promise<ITransaction> {
  if (this.status !== 'pending') {
    throw new Error('Only pending transactions can be completed');
  }

  this.status = 'completed';
  this.completedAt = new Date();
  
  if (transactionHash) this.transactionHash = transactionHash;
  if (blockNumber) this.blockNumber = blockNumber;
  if (gasUsed) this.gasUsed = gasUsed;

  return this.save();
};

transactionSchema.methods.fail = function(reason: string): Promise<ITransaction> {
  if (this.status !== 'pending') {
    throw new Error('Only pending transactions can be marked as failed');
  }

  this.status = 'failed';
  this.failureReason = reason;
  return this.save();
};

transactionSchema.methods.refund = function(refundTransactionHash: string): Promise<ITransaction> {
  if (!this.canBeRefunded()) {
    throw new Error('Transaction cannot be refunded');
  }

  this.status = 'refunded';
  this.refundTransactionHash = refundTransactionHash;
  return this.save();
};

transactionSchema.methods.cancel = function(): Promise<ITransaction> {
  if (this.status !== 'pending') {
    throw new Error('Only pending transactions can be cancelled');
  }

  this.status = 'cancelled';
  return this.save();
};

transactionSchema.methods.addConfirmation = function(): Promise<ITransaction> {
  this.confirmations = (this.confirmations || 0) + 1;
  return this.save();
};

transactionSchema.methods.getUSDValue = function(): number | null {
  if (this.exchangeRate) {
    return this.amount * this.exchangeRate.usdRate;
  }
  return null;
};

transactionSchema.methods.getFormattedAmount = function(): string {
  return `${this.amount.toFixed(6)} ${this.currency}`;
};

// Static methods for Transaction
transactionSchema.statics.findByTransactionId = function(transactionId: string): Promise<ITransaction | null> {
  return this.findOne({ transactionId });
};

transactionSchema.statics.findByTransactionHash = function(transactionHash: string): Promise<ITransaction | null> {
  return this.findOne({ transactionHash });
};

transactionSchema.statics.findByUser = function(userId: string, status?: string) {
  const query: any = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

transactionSchema.statics.findByDoctor = function(doctorId: string, status?: string) {
  const query: any = { doctorId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

transactionSchema.statics.findPendingTransactions = function(timeoutMinutes: number = 30) {
  const timeoutDate = new Date(Date.now() - timeoutMinutes * 60000);
  return this.find({
    status: 'pending',
    createdAt: { $lt: timeoutDate }
  });
};

transactionSchema.statics.getTransactionStats = function(userId?: string, doctorId?: string) {
  const matchStage: any = {};
  if (userId) matchStage.userId = userId;
  if (doctorId) matchStage.doctorId = doctorId;

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalVolume: { $sum: '$amount' },
        totalPlatformFees: { $sum: '$platformFee' },
        totalGasFees: { $sum: '$gasFee' },
        averageTransactionValue: { $avg: '$amount' },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        refundedCount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } }
      }
    },
    {
      $addFields: {
        successRate: { $divide: ['$completedCount', '$totalTransactions'] },
        failureRate: { $divide: ['$failedCount', '$totalTransactions'] }
      }
    }
  ]);
};

transactionSchema.statics.getDailyVolume = function(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        volume: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        volume: 1,
        count: 1,
        _id: 0
      }
    },
    { $sort: { date: 1 } }
  ]);
};

// Instance methods for Earnings
earningsSchema.methods.addEarning = function(
  amount: number,
  platformFee: number,
  currency: string,
  period: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<IEarnings> {
  const netEarning = amount - platformFee;
  
  this.totalEarnings += amount;
  this.availableBalance += netEarning;
  this.platformFeesDeducted += platformFee;

  // Add to breakdown
  const today = new Date();
  this.earnings.push({
    period,
    date: today,
    consultations: 1,
    grossEarnings: amount,
    platformFees: platformFee,
    netEarnings: netEarning,
    currency: currency as any
  });

  return this.save();
};

earningsSchema.methods.withdraw = function(amount: number): Promise<IEarnings> {
  if (amount > this.availableBalance) {
    throw new Error('Insufficient balance for withdrawal');
  }

  this.availableBalance -= amount;
  this.withdrawnAmount += amount;
  this.lastWithdrawal = new Date();
  
  // Set next withdrawal eligibility (e.g., 24 hours later)
  this.nextWithdrawalEligible = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return this.save();
};

earningsSchema.methods.canWithdraw = function(): boolean {
  return this.availableBalance > 0 && new Date() >= this.nextWithdrawalEligible;
};

// Static methods for Earnings
earningsSchema.statics.findByDoctor = function(doctorId: string): Promise<IEarnings | null> {
  return this.findOne({ doctorId });
};

earningsSchema.statics.getTopEarners = function(limit: number = 10) {
  return this.find({ totalEarnings: { $gt: 0 } })
    .sort({ totalEarnings: -1 })
    .limit(limit)
    .populate('doctorId', 'firstName lastName doctorProfile.specialization');
};

// Helper function to update doctor earnings
async function updateDoctorEarnings(transaction: ITransaction) {
  if (!transaction.doctorId) return;

  try {
    let earnings = await Earnings.findOne({ doctorId: transaction.doctorId });
    
    if (!earnings) {
      earnings = new Earnings({
        doctorId: transaction.doctorId,
        totalEarnings: 0,
        availableBalance: 0,
        pendingBalance: 0,
        withdrawnAmount: 0,
        platformFeesDeducted: 0,
        earnings: []
      });
    }

    await earnings.addEarning(
      transaction.amount,
      transaction.platformFee,
      transaction.currency
    );
  } catch (error) {
    console.error('Error updating doctor earnings:', error);
  }
}

// Virtual fields
transactionSchema.virtual('usdValue').get(function() {
  return this.getUSDValue();
});

transactionSchema.virtual('formattedAmount').get(function() {
  return this.getFormattedAmount();
});

transactionSchema.virtual('userInfo', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

transactionSchema.virtual('doctorInfo', {
  ref: 'User',
  localField: 'doctorId',
  foreignField: '_id',
  justOne: true
});

// Create and export the models
const Transaction: Model<ITransaction> = mongoose.model<ITransaction>('Transaction', transactionSchema);
const Wallet: Model<IWallet> = mongoose.model<IWallet>('Wallet', walletSchema);
const Earnings: Model<IEarnings> = mongoose.model<IEarnings>('Earnings', earningsSchema);

export { Transaction, Wallet, Earnings };
export default Transaction;