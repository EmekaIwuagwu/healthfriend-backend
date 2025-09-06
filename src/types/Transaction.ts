import { Document } from 'mongoose';

export interface ITransaction extends Document {
  _id: string;
  transactionId: string;
  transactionHash?: string;
  userId: string;
  doctorId?: string;
  consultationId?: string;
  appointmentId?: string;
  aiChatSessionId?: string;
  type: 'ai_consultation' | 'video_consultation' | 'home_visit' | 'doctor_withdrawal' | 'refund' | 'platform_fee';
  amount: number;
  currency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
  gasFee: number;
  platformFee: number;
  netAmount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled';
  blockchainNetwork: 'ethereum' | 'polygon';
  fromAddress: string;
  toAddress: string;
  contractAddress?: string;
  gasUsed?: number;
  gasPrice?: string;
  blockNumber?: number;
  confirmations?: number;
  failureReason?: string;
  refundTransactionHash?: string;
  metadata?: ITransactionMetadata;
  exchangeRate?: IExchangeRate;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface ITransactionMetadata {
  description?: string;
  category?: string;
  tags?: string[];
  internalNotes?: string;
  customerNotes?: string;
  relatedTransactionIds?: string[];
  recurringPayment?: boolean;
  installmentInfo?: {
    installmentNumber: number;
    totalInstallments: number;
    parentTransactionId: string;
  };
}

export interface IExchangeRate {
  usdRate: number;
  eurRate?: number;
  timestamp: Date;
  source: string; // e.g., 'coingecko', 'coinbase'
}

export interface IWallet {
  address: string;
  balance: IWalletBalance[];
  nonce: number;
  lastActivity: Date;
  isActive: boolean;
}

export interface IWalletBalance {
  currency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
  balance: number;
  lockedBalance: number; // For pending transactions
  lastUpdated: Date;
}

// Request/Response interfaces
export interface ITransactionRequest {
  type: 'ai_consultation' | 'video_consultation' | 'home_visit';
  amount: number;
  currency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
  doctorId?: string;
  consultationId?: string;
  blockchainNetwork: 'ethereum' | 'polygon';
  fromAddress: string;
  metadata?: Partial<ITransactionMetadata>;
}

export interface IPaymentConfirmation {
  transactionHash: string;
  blockchainNetwork: 'ethereum' | 'polygon';
  fromAddress: string;
  amount: number;
  currency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
}

export interface IWithdrawalRequest {
  amount: number;
  currency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
  toAddress: string;
  blockchainNetwork: 'ethereum' | 'polygon';
  withdrawalType: 'earnings' | 'refund';
}

export interface IRefundRequest {
  originalTransactionId: string;
  amount?: number; // Partial refund if specified
  reason: string;
  refundMethod: 'automatic' | 'manual';
}

export interface ITransactionFilter {
  userId?: string;
  doctorId?: string;
  type?: 'ai_consultation' | 'video_consultation' | 'home_visit' | 'doctor_withdrawal' | 'refund';
  status?: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled';
  currency?: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
  blockchainNetwork?: 'ethereum' | 'polygon';
  amountMin?: number;
  amountMax?: number;
  dateFrom?: Date;
  dateTo?: Date;
  transactionHash?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'amount' | 'status' | 'completedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ITransactionStats {
  totalTransactions: number;
  totalVolume: number;
  totalPlatformFees: number;
  totalGasFees: number;
  successRate: number;
  averageTransactionValue: number;
  byStatus: {
    pending: number;
    completed: number;
    failed: number;
    refunded: number;
    cancelled: number;
  };
  byCurrency: {
    ETH: { count: number; volume: number };
    USDC: { count: number; volume: number };
    MATIC: { count: number; volume: number };
    USDT: { count: number; volume: number };
  };
  byType: {
    aiConsultation: { count: number; volume: number };
    videoConsultation: { count: number; volume: number };
    homeVisit: { count: number; volume: number };
    doctorWithdrawal: { count: number; volume: number };
    refund: { count: number; volume: number };
  };
  byNetwork: {
    ethereum: { count: number; volume: number; avgGasFee: number };
    polygon: { count: number; volume: number; avgGasFee: number };
  };
  dailyVolume: Array<{
    date: Date;
    volume: number;
    count: number;
  }>;
}

export interface IEarnings {
  doctorId: string;
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  withdrawnAmount: number;
  platformFeesDeducted: number;
  earnings: IEarningsBreakdown[];
  lastWithdrawal?: Date;
  nextWithdrawalEligible: Date;
}

export interface IEarningsBreakdown {
  period: 'daily' | 'weekly' | 'monthly';
  date: Date;
  consultations: number;
  grossEarnings: number;
  platformFees: number;
  netEarnings: number;
  currency: 'ETH' | 'USDC' | 'MATIC' | 'USDT';
}