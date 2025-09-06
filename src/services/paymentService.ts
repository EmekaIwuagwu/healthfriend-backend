import { ethers } from 'ethers';
import { 
  ITransaction, 
  IPaymentConfirmation, 
  IWithdrawalRequest, 
  ITransactionRequest 
} from '../types';
import { Transaction, Earnings } from '../models/Transaction';
import { 
  PLATFORM_FEE_PERCENTAGE,
  GAS_ESTIMATES,
  SUPPORTED_CURRENCIES,
  SUPPORTED_NETWORKS
} from '../utils/constants';
import { 
  generateTransactionId, 
  calculatePlatformFee, 
  calculateDoctorEarnings,
  estimateGasFee,
  logError, 
  logInfo 
} from '../utils/helpers';

// Network configuration
interface NetworkConfig {
  rpcUrl: string;
  chainId: number;
  nativeCurrency: string;
  explorerUrl: string;
}

// Token contract addresses for different networks
interface TokenContracts {
  [network: string]: {
    [token: string]: string;
  };
}

export class PaymentService {
  private providers: Map<string, ethers.providers.JsonRpcProvider> = new Map();
  private networkConfigs: Map<string, NetworkConfig> = new Map();
  private tokenContracts: TokenContracts = {};

  constructor() {
    this.initializeNetworks();
    this.initializeTokenContracts();
  }

  /**
   * Initialize blockchain network configurations
   */
  private initializeNetworks(): void {
    try {
      // Ethereum Mainnet
      const ethereumConfig: NetworkConfig = {
        rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your_project_id',
        chainId: 1,
        nativeCurrency: 'ETH',
        explorerUrl: 'https://etherscan.io'
      };

      // Polygon Mainnet
      const polygonConfig: NetworkConfig = {
        rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.infura.io/v3/your_project_id',
        chainId: 137,
        nativeCurrency: 'MATIC',
        explorerUrl: 'https://polygonscan.com'
      };

      this.networkConfigs.set('ethereum', ethereumConfig);
      this.networkConfigs.set('polygon', polygonConfig);

      // Initialize providers
      this.providers.set('ethereum', new ethers.providers.JsonRpcProvider(ethereumConfig.rpcUrl));
      this.providers.set('polygon', new ethers.providers.JsonRpcProvider(polygonConfig.rpcUrl));

      logInfo('Payment service networks initialized');
    } catch (error) {
      logError('Failed to initialize payment networks:', error);
    }
  }

  /**
   * Initialize token contract addresses
   */
  private initializeTokenContracts(): void {
    this.tokenContracts = {
      ethereum: {
        USDC: '0xA0b86a33E6417aAb8cd2B6E079c1e86A2d9c7e5f', // USDC on Ethereum
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'  // USDT on Ethereum
      },
      polygon: {
        USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT on Polygon
        MATIC: '0x0000000000000000000000000000000000001010' // Native MATIC
      }
    };
  }

  /**
   * Create a new payment transaction
   */
  async createPaymentTransaction(request: ITransactionRequest): Promise<ITransaction> {
    try {
      const {
        type,
        amount,
        currency,
        doctorId,
        consultationId,
        blockchainNetwork,
        fromAddress,
        metadata
      } = request;

      logInfo('Creating payment transaction', { 
        type, 
        amount, 
        currency, 
        network: blockchainNetwork 
      });

      // Validate network and currency
      this.validateNetworkCurrency(blockchainNetwork, currency);

      // Calculate fees
      const gasFee = estimateGasFee(blockchainNetwork);
      const platformFee = calculatePlatformFee(amount);
      const doctorEarnings = doctorId ? calculateDoctorEarnings(amount, platformFee) : 0;

      // Generate transaction ID
      const transactionId = generateTransactionId();

      // Get platform wallet address
      const toAddress = this.getPlatformWalletAddress(blockchainNetwork);

      // Create transaction record
      const transaction = new Transaction({
        transactionId,
        userId: request.userId || '',
        doctorId,
        consultationId,
        appointmentId: request.appointmentId,
        aiChatSessionId: request.aiChatSessionId,
        type,
        amount,
        currency,
        gasFee,
        platformFee,
        netAmount: amount - gasFee - platformFee,
        status: 'pending',
        blockchainNetwork,
        fromAddress: fromAddress.toLowerCase(),
        toAddress: toAddress.toLowerCase(),
        metadata,
        exchangeRate: await this.getCurrentExchangeRate(currency)
      });

      await transaction.save();

      logInfo('Payment transaction created', { 
        transactionId, 
        amount, 
        currency 
      });

      return transaction;
    } catch (error) {
      logError('Failed to create payment transaction:', error);
      throw new Error('Payment transaction creation failed');
    }
  }

  /**
   * Confirm blockchain payment
   */
  async confirmPayment(confirmation: IPaymentConfirmation): Promise<ITransaction> {
    try {
      const {
        transactionHash,
        blockchainNetwork,
        fromAddress,
        amount,
        currency
      } = confirmation;

      logInfo('Confirming blockchain payment', { 
        transactionHash, 
        network: blockchainNetwork 
      });

      // Verify transaction on blockchain
      const isValid = await this.verifyBlockchainTransaction(
        transactionHash,
        blockchainNetwork,
        fromAddress,
        amount,
        currency
      );

      if (!isValid) {
        throw new Error('Blockchain transaction verification failed');
      }

      // Find pending transaction
      const transaction = await Transaction.findOne({
        fromAddress: fromAddress.toLowerCase(),
        amount,
        currency,
        blockchainNetwork,
        status: 'pending'
      }).sort({ createdAt: -1 });

      if (!transaction) {
        throw new Error('Matching pending transaction not found');
      }

      // Update transaction with blockchain details
      const blockchainDetails = await this.getTransactionDetails(transactionHash, blockchainNetwork);
      
      await transaction.complete(
        transactionHash,
        blockchainDetails.blockNumber,
        blockchainDetails.gasUsed
      );

      // Update doctor earnings if applicable
      if (transaction.doctorId && ['video_consultation', 'home_visit'].includes(transaction.type)) {
        await this.updateDoctorEarnings(transaction);
      }

      logInfo('Payment confirmed successfully', { 
        transactionId: transaction.transactionId,
        transactionHash 
      });

      return transaction;
    } catch (error) {
      logError('Payment confirmation failed:', error);
      throw new Error('Payment confirmation failed');
    }
  }

  /**
   * Process doctor withdrawal
   */
  async processWithdrawal(request: IWithdrawalRequest): Promise<ITransaction> {
    try {
      const {
        amount,
        currency,
        toAddress,
        blockchainNetwork,
        withdrawalType
      } = request;

      logInfo('Processing withdrawal', { 
        amount, 
        currency, 
        network: blockchainNetwork 
      });

      // Validate withdrawal request
      await this.validateWithdrawal(request);

      // Calculate fees
      const gasFee = estimateGasFee(blockchainNetwork, 'transfer');
      const platformFee = 0; // No platform fee for withdrawals

      // Create withdrawal transaction
      const transactionId = generateTransactionId();
      const fromAddress = this.getPlatformWalletAddress(blockchainNetwork);

      const transaction = new Transaction({
        transactionId,
        userId: (request as any).doctorId,
        doctorId: (request as any).doctorId,
        type: 'doctor_withdrawal',
        amount,
        currency,
        gasFee,
        platformFee,
        netAmount: amount - gasFee,
        status: 'pending',
        blockchainNetwork,
        fromAddress: fromAddress.toLowerCase(),
        toAddress: toAddress.toLowerCase(),
        metadata: {
          withdrawalType,
          description: `Doctor earnings withdrawal`
        }
      });

      await transaction.save();

      // Process blockchain withdrawal
      const withdrawalHash = await this.executeWithdrawal(
        amount,
        currency,
        toAddress,
        blockchainNetwork
      );

      // Update transaction with withdrawal hash
      await transaction.complete(withdrawalHash);

      // Update doctor earnings record
      const doctorEarnings = await Earnings.findOne({ doctorId: (request as any).doctorId });
      if (doctorEarnings) {
        await doctorEarnings.withdraw(amount);
      }

      logInfo('Withdrawal processed successfully', { 
        transactionId,
        withdrawalHash 
      });

      return transaction;
    } catch (error) {
      logError('Withdrawal processing failed:', error);
      throw new Error('Withdrawal processing failed');
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(transactionId: string): Promise<{
    status: string;
    confirmations: number;
    blockchainUrl?: string;
  }> {
    try {
      const transaction = await Transaction.findOne({ transactionId });
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      let confirmations = 0;
      let blockchainUrl = '';

      if (transaction.transactionHash && transaction.status === 'completed') {
        confirmations = await this.getConfirmationCount(
          transaction.transactionHash,
          transaction.blockchainNetwork
        );

        const networkConfig = this.networkConfigs.get(transaction.blockchainNetwork);
        if (networkConfig) {
          blockchainUrl = `${networkConfig.explorerUrl}/tx/${transaction.transactionHash}`;
        }
      }

      return {
        status: transaction.status,
        confirmations,
        blockchainUrl
      };
    } catch (error) {
      logError('Failed to get payment status:', error);
      throw new Error('Payment status check failed');
    }
  }

  /**
   * Calculate consultation fees
   */
  calculateConsultationFees(
    consultationType: 'ai_chat' | 'video_call' | 'home_visit',
    doctorFee?: number,
    currency: string = 'ETH'
  ): {
    baseFee: number;
    platformFee: number;
    gasFee: number;
    totalFee: number;
    doctorEarnings: number;
  } {
    let baseFee = 0;

    switch (consultationType) {
      case 'ai_chat':
        baseFee = 0.001; // Base AI consultation fee
        break;
      case 'video_call':
        baseFee = doctorFee || 0.05; // Doctor's video call fee
        break;
      case 'home_visit':
        baseFee = doctorFee || 0.1; // Doctor's home visit fee
        break;
    }

    const platformFee = calculatePlatformFee(baseFee);
    const gasFee = estimateGasFee('ethereum'); // Default to Ethereum
    const totalFee = baseFee + platformFee + gasFee;
    const doctorEarnings = consultationType !== 'ai_chat' ? calculateDoctorEarnings(baseFee, platformFee) : 0;

    return {
      baseFee,
      platformFee,
      gasFee,
      totalFee,
      doctorEarnings
    };
  }

  /**
   * Get doctor earnings summary
   */
  async getDoctorEarnings(doctorId: string): Promise<{
    totalEarnings: number;
    availableBalance: number;
    pendingBalance: number;
    withdrawnAmount: number;
    canWithdraw: boolean;
    nextWithdrawalEligible: Date;
  }> {
    try {
      let earnings = await Earnings.findOne({ doctorId });
      
      if (!earnings) {
        // Create new earnings record
        earnings = new Earnings({
          doctorId,
          totalEarnings: 0,
          availableBalance: 0,
          pendingBalance: 0,
          withdrawnAmount: 0,
          platformFeesDeducted: 0,
          earnings: []
        });
        await earnings.save();
      }

      return {
        totalEarnings: earnings.totalEarnings,
        availableBalance: earnings.availableBalance,
        pendingBalance: earnings.pendingBalance,
        withdrawnAmount: earnings.withdrawnAmount,
        canWithdraw: earnings.canWithdraw(),
        nextWithdrawalEligible: earnings.nextWithdrawalEligible
      };
    } catch (error) {
      logError('Failed to get doctor earnings:', error);
      throw new Error('Failed to retrieve earnings data');
    }
  }

  /**
   * Process refund
   */
  async processRefund(
    originalTransactionId: string,
    refundAmount?: number,
    reason?: string
  ): Promise<ITransaction> {
    try {
      const originalTransaction = await Transaction.findOne({ transactionId: originalTransactionId });
      
      if (!originalTransaction) {
        throw new Error('Original transaction not found');
      }

      if (!originalTransaction.canBeRefunded()) {
        throw new Error('Transaction cannot be refunded');
      }

      const refundAmountFinal = refundAmount || originalTransaction.amount;
      const gasFee = estimateGasFee(originalTransaction.blockchainNetwork);

      // Create refund transaction
      const refundTransactionId = generateTransactionId();
      const platformWallet = this.getPlatformWalletAddress(originalTransaction.blockchainNetwork);

      const refundTransaction = new Transaction({
        transactionId: refundTransactionId,
        userId: originalTransaction.userId,
        type: 'refund',
        amount: refundAmountFinal,
        currency: originalTransaction.currency,
        gasFee,
        platformFee: 0,
        netAmount: refundAmountFinal - gasFee,
        status: 'pending',
        blockchainNetwork: originalTransaction.blockchainNetwork,
        fromAddress: platformWallet.toLowerCase(),
        toAddress: originalTransaction.fromAddress,
        metadata: {
          originalTransactionId,
          refundReason: reason || 'Customer refund request',
          description: 'Refund for consultation'
        }
      });

      await refundTransaction.save();

      // Execute refund on blockchain
      const refundHash = await this.executeWithdrawal(
        refundAmountFinal,
        originalTransaction.currency,
        originalTransaction.fromAddress,
        originalTransaction.blockchainNetwork
      );

      // Update refund transaction
      await refundTransaction.complete(refundHash);

      // Mark original transaction as refunded
      await originalTransaction.refund(refundHash);

      logInfo('Refund processed successfully', { 
        originalTransactionId,
        refundTransactionId,
        refundHash 
      });

      return refundTransaction;
    } catch (error) {
      logError('Refund processing failed:', error);
      throw new Error('Refund processing failed');
    }
  }

  // Private helper methods

  private async verifyBlockchainTransaction(
    transactionHash: string,
    network: string,
    fromAddress: string,
    amount: number,
    currency: string
  ): Promise<boolean> {
    try {
      const provider = this.providers.get(network);
      if (!provider) {
        throw new Error(`Provider not found for network: ${network}`);
      }

      const transaction = await provider.getTransaction(transactionHash);
      if (!transaction) {
        return false;
      }

      const receipt = await provider.getTransactionReceipt(transactionHash);
      if (!receipt || !receipt.status) {
        return false;
      }

      // Verify sender address
      if (transaction.from.toLowerCase() !== fromAddress.toLowerCase()) {
        return false;
      }

      // Verify amount for native currency transactions
      if (currency === 'ETH' || currency === 'MATIC') {
        const expectedAmount = ethers.utils.parseEther(amount.toString());
        if (!transaction.value.eq(expectedAmount)) {
          return false;
        }
      } else {
        // For token transactions, verify token contract and amount
        return await this.verifyTokenTransaction(transaction, receipt, currency, amount, network);
      }

      return true;
    } catch (error) {
      logError('Blockchain verification failed:', error);
      return false;
    }
  }

  private async verifyTokenTransaction(
    transaction: ethers.providers.TransactionResponse,
    receipt: ethers.providers.TransactionReceipt,
    currency: string,
    amount: number,
    network: string
  ): Promise<boolean> {
    try {
      const tokenAddress = this.tokenContracts[network]?.[currency];
      if (!tokenAddress) {
        return false;
      }

      // Verify transaction is to token contract
      if (transaction.to?.toLowerCase() !== tokenAddress.toLowerCase()) {
        return false;
      }

      // Parse token transfer events from logs
      const transferEventSignature = ethers.utils.id('Transfer(address,address,uint256)');
      const transferLog = receipt.logs.find(log => log.topics[0] === transferEventSignature);
      
      if (!transferLog) {
        return false;
      }

      // Decode transfer amount
      const transferAmount = ethers.utils.defaultAbiCoder.decode(['uint256'], transferLog.data)[0];
      const decimals = await this.getTokenDecimals(tokenAddress, network);
      const actualAmount = parseFloat(ethers.utils.formatUnits(transferAmount, decimals));

      // Allow small tolerance for rounding differences
      const tolerance = 0.000001;
      return Math.abs(actualAmount - amount) <= tolerance;
    } catch (error) {
      logError('Token transaction verification failed:', error);
      return false;
    }
  }

  private async getTransactionDetails(transactionHash: string, network: string): Promise<{
    blockNumber: number;
    gasUsed: number;
    confirmations: number;
  }> {
    try {
      const provider = this.providers.get(network);
      if (!provider) {
        throw new Error(`Provider not found for network: ${network}`);
      }

      const receipt = await provider.getTransactionReceipt(transactionHash);
      const currentBlock = await provider.getBlockNumber();

      return {
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toNumber(),
        confirmations: currentBlock - receipt.blockNumber + 1
      };
    } catch (error) {
      logError('Failed to get transaction details:', error);
      throw error;
    }
  }

  private async getConfirmationCount(transactionHash: string, network: string): Promise<number> {
    try {
      const provider = this.providers.get(network);
      if (!provider) {
        return 0;
      }

      const receipt = await provider.getTransactionReceipt(transactionHash);
      const currentBlock = await provider.getBlockNumber();

      return currentBlock - receipt.blockNumber + 1;
    } catch (error) {
      logError('Failed to get confirmation count:', error);
      return 0;
    }
  }

  private async executeWithdrawal(
    amount: number,
    currency: string,
    toAddress: string,
    network: string
  ): Promise<string> {
    try {
      // In production, this would use a secure wallet service
      // For now, return a mock transaction hash
      const mockHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(`${amount}-${currency}-${toAddress}-${Date.now()}`)
      );

      logInfo('Mock withdrawal executed', { 
        amount, 
        currency, 
        toAddress, 
        network,
        hash: mockHash 
      });

      return mockHash;
    } catch (error) {
      logError('Withdrawal execution failed:', error);
      throw error;
    }
  }

  private async validateWithdrawal(request: IWithdrawalRequest): Promise<void> {
    const { amount, currency, blockchainNetwork } = request;

    // Validate network and currency
    this.validateNetworkCurrency(blockchainNetwork, currency);

    // Check minimum withdrawal amount
    const minimumAmounts: Record<string, number> = {
      ETH: 0.01,
      USDC: 10,
      MATIC: 1,
      USDT: 10
    };

    if (amount < minimumAmounts[currency]) {
      throw new Error(`Minimum withdrawal amount for ${currency} is ${minimumAmounts[currency]}`);
    }

    // Check doctor earnings balance
    if ((request as any).doctorId) {
      const earnings = await Earnings.findOne({ doctorId: (request as any).doctorId });
      if (!earnings || earnings.availableBalance < amount) {
        throw new Error('Insufficient available balance for withdrawal');
      }

      if (!earnings.canWithdraw()) {
        throw new Error('Withdrawal not eligible at this time');
      }
    }
  }

  private validateNetworkCurrency(network: string, currency: string): void {
    if (!SUPPORTED_NETWORKS.includes(network as any)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    if (!SUPPORTED_CURRENCIES.includes(currency as any)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    // Check network-currency compatibility
    const networkCurrencies: Record<string, string[]> = {
      ethereum: ['ETH', 'USDC', 'USDT'],
      polygon: ['MATIC', 'USDC', 'USDT']
    };

    if (!networkCurrencies[network]?.includes(currency)) {
      throw new Error(`Currency ${currency} not supported on ${network} network`);
    }
  }

  private async updateDoctorEarnings(transaction: ITransaction): Promise<void> {
    try {
      if (!transaction.doctorId) return;

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

      logInfo('Doctor earnings updated', { 
        doctorId: transaction.doctorId,
        amount: transaction.amount 
      });
    } catch (error) {
      logError('Failed to update doctor earnings:', error);
    }
  }

  private async getCurrentExchangeRate(currency: string): Promise<{
    usdRate: number;
    timestamp: Date;
    source: string;
  }> {
    try {
      // In production, integrate with a real price API
      const mockRates: Record<string, number> = {
        ETH: 2000,
        USDC: 1,
        MATIC: 0.8,
        USDT: 1
      };

      return {
        usdRate: mockRates[currency] || 1,
        timestamp: new Date(),
        source: 'mock_api'
      };
    } catch (error) {
      logError('Failed to get exchange rate:', error);
      return {
        usdRate: 1,
        timestamp: new Date(),
        source: 'fallback'
      };
    }
  }

  private async getTokenDecimals(tokenAddress: string, network: string): Promise<number> {
    try {
      const provider = this.providers.get(network);
      if (!provider) {
        return 18; // Default to 18 decimals
      }

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function decimals() view returns (uint8)'],
        provider
      );

      return await tokenContract.decimals();
    } catch (error) {
      logError('Failed to get token decimals:', error);
      return 18; // Default fallback
    }
  }

  private getPlatformWalletAddress(network: string): string {
    // In production, these would be secure wallet addresses
    const platformWallets: Record<string, string> = {
      ethereum: '0x742d35Cc6634C0532925a3b8D80b10B4BBE00C41',
      polygon: '0x742d35Cc6634C0532925a3b8D80b10B4BBE00C42'
    };

    return platformWallets[network] || platformWallets.ethereum;
  }

  /**
   * Health check for payment service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const networkHealth: Record<string, boolean> = {};

      for (const [network, provider] of this.providers) {
        try {
          await provider.getBlockNumber();
          networkHealth[network] = true;
        } catch (error) {
          networkHealth[network] = false;
        }
      }

      const allHealthy = Object.values(networkHealth).every(health => health);

      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        details: {
          networks: networkHealth,
          supportedCurrencies: SUPPORTED_CURRENCIES,
          supportedNetworks: SUPPORTED_NETWORKS
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

// Export singleton instance
export default new PaymentService();