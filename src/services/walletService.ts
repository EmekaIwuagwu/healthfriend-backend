import { ethers } from 'ethers';
import crypto from 'crypto';
import { IUser, IWalletAuthMessage } from '../types';
import User from '../models/User';
import { Wallet } from '../models/Transaction';
import { 
  generateNonce, 
  createAuthMessage, 
  verifyWalletSignature,
  logError, 
  logInfo 
} from '../utils/helpers';
import { WALLET_NONCE_EXPIRE_TIME } from '../utils/constants';

// Wallet connection interface
interface WalletConnection {
  address: string;
  chainId: number;
  network: string;
  balance?: string;
  ensName?: string;
}

// Signature verification result
interface SignatureVerification {
  isValid: boolean;
  address: string;
  message: string;
  error?: string;
}

// Wallet balance interface
interface WalletBalance {
  address: string;
  balances: Array<{
    token: string;
    balance: string;
    decimals: number;
    symbol: string;
    usdValue?: number;
  }>;
  totalUsdValue: number;
}

export class WalletService {
  private nonceStore: Map<string, { nonce: string; expiry: number }> = new Map();
  private providers: Map<number, ethers.providers.JsonRpcProvider> = new Map();

  constructor() {
    this.initializeProviders();
    this.startNonceCleanup();
  }

  /**
   * Initialize blockchain providers for different networks
   */
  private initializeProviders(): void {
    try {
      // Ethereum Mainnet
      this.providers.set(1, new ethers.providers.JsonRpcProvider(
        process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your_project_id'
      ));

      // Polygon Mainnet  
      this.providers.set(137, new ethers.providers.JsonRpcProvider(
        process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.infura.io/v3/your_project_id'
      ));

      // Ethereum Sepolia Testnet (for development)
      if (process.env.NODE_ENV === 'development') {
        this.providers.set(11155111, new ethers.providers.JsonRpcProvider(
          'https://sepolia.infura.io/v3/your_project_id'
        ));
      }

      logInfo('Wallet service providers initialized');
    } catch (error) {
      logError('Failed to initialize wallet providers:', error);
    }
  }

  /**
   * Generate authentication nonce for wallet
   */
  generateAuthNonce(walletAddress: string): { nonce: string; message: string } {
    try {
      const nonce = generateNonce();
      const expiry = Date.now() + WALLET_NONCE_EXPIRE_TIME;
      
      // Store nonce with expiry
      this.nonceStore.set(walletAddress.toLowerCase(), { nonce, expiry });
      
      // Create authentication message
      const message = createAuthMessage(walletAddress, nonce);
      
      logInfo('Authentication nonce generated', { 
        address: walletAddress,
        nonce: nonce.substring(0, 8) + '...' // Log partial nonce for security
      });
      
      return { nonce, message };
    } catch (error) {
      logError('Failed to generate auth nonce:', error);
      throw new Error('Nonce generation failed');
    }
  }

  /**
   * Verify wallet signature for authentication
   */
  async verifyAuthentication(
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<SignatureVerification> {
    try {
      const address = walletAddress.toLowerCase();
      
      // Check if nonce exists and is valid
      const storedNonce = this.nonceStore.get(address);
      if (!storedNonce) {
        return {
          isValid: false,
          address,
          message,
          error: 'Nonce not found or expired'
        };
      }

      // Check nonce expiry
      if (Date.now() > storedNonce.expiry) {
        this.nonceStore.delete(address);
        return {
          isValid: false,
          address,
          message,
          error: 'Nonce expired'
        };
      }

      // Verify signature
      const isValid = verifyWalletSignature(message, signature, walletAddress);
      
      if (isValid) {
        // Remove used nonce
        this.nonceStore.delete(address);
        
        logInfo('Wallet authentication successful', { address });
        
        return {
          isValid: true,
          address,
          message
        };
      } else {
        return {
          isValid: false,
          address,
          message,
          error: 'Invalid signature'
        };
      }
    } catch (error) {
      logError('Wallet authentication verification failed:', error);
      return {
        isValid: false,
        address: walletAddress,
        message,
        error: 'Verification failed'
      };
    }
  }

  /**
   * Connect wallet and create/update user profile
   */
  async connectWallet(
    walletAddress: string,
    signature: string,
    message: string,
    userInfo?: Partial<IUser>
  ): Promise<{ user: IUser; isNewUser: boolean }> {
    try {
      // Verify signature first
      const verification = await this.verifyAuthentication(walletAddress, signature, message);
      
      if (!verification.isValid) {
        throw new Error(verification.error || 'Signature verification failed');
      }

      const address = walletAddress.toLowerCase();
      
      // Check if user already exists
      let user = await User.findByWalletAddress(address);
      let isNewUser = false;

      if (!user) {
        // Create new user
        if (!userInfo?.firstName || !userInfo?.lastName || !userInfo?.email) {
          throw new Error('User information required for new account');
        }

        user = new User({
          walletAddress: address,
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          email: userInfo.email,
          role: userInfo.role || 'patient',
          phone: userInfo.phone,
          dateOfBirth: userInfo.dateOfBirth,
          gender: userInfo.gender,
          isActive: true,
          emailVerified: false
        });

        await user.save();
        isNewUser = true;

        // Create wallet record
        await this.createWalletRecord(address);
        
        logInfo('New user created with wallet', { 
          userId: user._id,
          address,
          role: user.role 
        });
      } else {
        // Update existing user's last login
        await user.updateLastLogin();
        
        logInfo('Existing user wallet connection', { 
          userId: user._id,
          address 
        });
      }

      // Update wallet activity
      await this.updateWalletActivity(address);

      return { user, isNewUser };
    } catch (error) {
      logError('Wallet connection failed:', error);
      throw new Error('Wallet connection failed');
    }
  }

  /**
   * Get wallet balance for multiple tokens
   */
  async getWalletBalance(
    walletAddress: string,
    chainId: number = 1
  ): Promise<WalletBalance> {
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new Error(`Provider not available for chain ${chainId}`);
      }

      const address = ethers.utils.getAddress(walletAddress);
      const balances: WalletBalance['balances'] = [];
      let totalUsdValue = 0;

      // Get native token balance (ETH/MATIC)
      const nativeBalance = await provider.getBalance(address);
      const nativeSymbol = chainId === 137 ? 'MATIC' : 'ETH';
      const nativeBalanceFormatted = ethers.utils.formatEther(nativeBalance);
      
      // Get USD value (mock implementation)
      const nativeUsdValue = await this.getTokenUsdValue(nativeSymbol, parseFloat(nativeBalanceFormatted));
      totalUsdValue += nativeUsdValue;

      balances.push({
        token: 'native',
        balance: nativeBalanceFormatted,
        decimals: 18,
        symbol: nativeSymbol,
        usdValue: nativeUsdValue
      });

      // Get token balances
      const tokenContracts = this.getTokenContracts(chainId);
      
      for (const [symbol, contractAddress] of Object.entries(tokenContracts)) {
        try {
          const tokenBalance = await this.getTokenBalance(address, contractAddress, provider);
          const tokenUsdValue = await this.getTokenUsdValue(symbol, parseFloat(tokenBalance.balance));
          totalUsdValue += tokenUsdValue;

          balances.push({
            ...tokenBalance,
            symbol,
            usdValue: tokenUsdValue
          });
        } catch (error) {
          logError(`Failed to get ${symbol} balance:`, error);
          // Continue with other tokens
        }
      }

      logInfo('Wallet balance retrieved', { 
        address: walletAddress,
        chainId,
        totalUsdValue 
      });

      return {
        address: walletAddress,
        balances,
        totalUsdValue
      };
    } catch (error) {
      logError('Failed to get wallet balance:', error);
      throw new Error('Wallet balance retrieval failed');
    }
  }

  /**
   * Validate wallet address format
   */
  validateWalletAddress(address: string): { isValid: boolean; error?: string } {
    try {
      if (!address) {
        return { isValid: false, error: 'Address is required' };
      }

      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return { isValid: false, error: 'Invalid address format' };
      }

      // Use ethers to validate checksum
      const checksumAddress = ethers.utils.getAddress(address);
      
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid address checksum' };
    }
  }

  /**
   * Get wallet transaction history
   */
  async getWalletTransactionHistory(
    walletAddress: string,
    chainId: number = 1,
    limit: number = 50
  ): Promise<Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    timestamp: number;
    status: 'success' | 'failed';
    gasUsed: string;
    type: 'sent' | 'received';
  }>> {
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new Error(`Provider not available for chain ${chainId}`);
      }

      const address = ethers.utils.getAddress(walletAddress);
      
      // Get latest block number
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 10000); // Last ~10k blocks

      // Get transaction history (simplified implementation)
      const history = await provider.getHistory(address);
      
      const transactions = await Promise.all(
        history.slice(-limit).map(async (tx) => {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          const block = await provider.getBlock(tx.blockNumber || 0);
          
          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to || '',
            value: ethers.utils.formatEther(tx.value),
            timestamp: block.timestamp,
            status: receipt.status === 1 ? 'success' as const : 'failed' as const,
            gasUsed: receipt.gasUsed.toString(),
            type: tx.from.toLowerCase() === address.toLowerCase() ? 'sent' as const : 'received' as const
          };
        })
      );

      logInfo('Wallet transaction history retrieved', { 
        address: walletAddress,
        chainId,
        count: transactions.length 
      });

      return transactions.reverse(); // Most recent first
    } catch (error) {
      logError('Failed to get wallet transaction history:', error);
      throw new Error('Transaction history retrieval failed');
    }
  }

  /**
   * Check if wallet is connected to correct network
   */
  async validateNetwork(chainId: number): Promise<{ isValid: boolean; expectedChainId?: number }> {
    const supportedChainIds = [1, 137]; // Ethereum, Polygon
    
    if (process.env.NODE_ENV === 'development') {
      supportedChainIds.push(11155111); // Sepolia testnet
    }

    const isValid = supportedChainIds.includes(chainId);
    
    return {
      isValid,
      expectedChainId: isValid ? undefined : supportedChainIds[0]
    };
  }

  /**
   * Get ENS name for wallet address
   */
  async getENSName(walletAddress: string): Promise<string | null> {
    try {
      const provider = this.providers.get(1); // ENS is on Ethereum mainnet
      if (!provider) {
        return null;
      }

      const ensName = await provider.lookupAddress(walletAddress);
      return ensName;
    } catch (error) {
      logError('ENS lookup failed:', error);
      return null;
    }
  }

  /**
   * Resolve ENS name to wallet address
   */
  async resolveENS(ensName: string): Promise<string | null> {
    try {
      const provider = this.providers.get(1); // ENS is on Ethereum mainnet
      if (!provider) {
        return null;
      }

      const address = await provider.resolveName(ensName);
      return address;
    } catch (error) {
      logError('ENS resolution failed:', error);
      return null;
    }
  }

  // Private helper methods

  private async createWalletRecord(address: string): Promise<void> {
    try {
      const wallet = new Wallet({
        address: address.toLowerCase(),
        balance: [],
        nonce: 0,
        lastActivity: new Date(),
        isActive: true
      });

      await wallet.save();
      logInfo('Wallet record created', { address });
    } catch (error) {
      logError('Failed to create wallet record:', error);
    }
  }

  private async updateWalletActivity(address: string): Promise<void> {
    try {
      await Wallet.findOneAndUpdate(
        { address: address.toLowerCase() },
        { 
          lastActivity: new Date(),
          isActive: true 
        },
        { upsert: true }
      );
    } catch (error) {
      logError('Failed to update wallet activity:', error);
    }
  }

  private async getTokenBalance(
    walletAddress: string,
    tokenContract: string,
    provider: ethers.providers.JsonRpcProvider
  ): Promise<{ token: string; balance: string; decimals: number }> {
    try {
      const contract = new ethers.Contract(
        tokenContract,
        [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ],
        provider
      );

      const [balance, decimals] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals()
      ]);

      return {
        token: tokenContract,
        balance: ethers.utils.formatUnits(balance, decimals),
        decimals
      };
    } catch (error) {
      throw new Error(`Failed to get token balance: ${error}`);
    }
  }

  private getTokenContracts(chainId: number): Record<string, string> {
    const contracts: Record<number, Record<string, string>> = {
      1: { // Ethereum
        USDC: '0xA0b86a33E6417aAb8cd2B6E079c1e86A2d9c7e5f',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      },
      137: { // Polygon
        USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
      }
    };

    return contracts[chainId] || {};
  }

  private async getTokenUsdValue(symbol: string, amount: number): Promise<number> {
    try {
      // Mock price data - in production, integrate with a real price API
      const mockPrices: Record<string, number> = {
        ETH: 2000,
        MATIC: 0.8,
        USDC: 1.0,
        USDT: 1.0
      };

      const price = mockPrices[symbol] || 0;
      return amount * price;
    } catch (error) {
      logError('Failed to get token USD value:', error);
      return 0;
    }
  }

  private startNonceCleanup(): void {
    // Clean up expired nonces every 5 minutes
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [address, nonceData] of this.nonceStore.entries()) {
        if (now > nonceData.expiry) {
          this.nonceStore.delete(address);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logInfo('Cleaned up expired nonces', { count: cleanedCount });
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Batch verify multiple signatures
   */
  async batchVerifySignatures(
    verifications: Array<{
      address: string;
      signature: string;
      message: string;
    }>
  ): Promise<Array<SignatureVerification>> {
    try {
      const results = await Promise.all(
        verifications.map(({ address, signature, message }) =>
          this.verifyAuthentication(address, signature, message)
        )
      );

      logInfo('Batch signature verification completed', { 
        total: verifications.length,
        valid: results.filter(r => r.isValid).length 
      });

      return results;
    } catch (error) {
      logError('Batch signature verification failed:', error);
      throw new Error('Batch verification failed');
    }
  }

  /**
   * Get wallet connection status
   */
  async getWalletConnectionStatus(walletAddress: string): Promise<{
    isConnected: boolean;
    lastActivity: Date | null;
    chainId?: number;
    balance?: string;
  }> {
    try {
      const wallet = await Wallet.findOne({ 
        address: walletAddress.toLowerCase() 
      });

      if (!wallet) {
        return {
          isConnected: false,
          lastActivity: null
        };
      }

      // Check if wallet was active recently (within last 24 hours)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const isConnected = wallet.isActive && wallet.lastActivity > dayAgo;

      return {
        isConnected,
        lastActivity: wallet.lastActivity
      };
    } catch (error) {
      logError('Failed to get wallet connection status:', error);
      return {
        isConnected: false,
        lastActivity: null
      };
    }
  }

  /**
   * Health check for wallet service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const providerHealth: Record<number, boolean> = {};

      for (const [chainId, provider] of this.providers) {
        try {
          await provider.getBlockNumber();
          providerHealth[chainId] = true;
        } catch (error) {
          providerHealth[chainId] = false;
        }
      }

      const allHealthy = Object.values(providerHealth).every(health => health);

      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        details: {
          providers: providerHealth,
          nonceStoreSize: this.nonceStore.size,
          supportedChains: Array.from(this.providers.keys())
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
export default new WalletService();