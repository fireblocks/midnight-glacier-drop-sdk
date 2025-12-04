import {
  BasePath,
  TransactionResponse,
  VaultWalletAddress,
} from "@fireblocks/ts-sdk";
import { SdkManager } from "../pool/sdkManager.js";
import {
  ApiServiceConfig,
  checkAddressAllocationOpts,
  ClaimHistoryResponse,
  donateToScavengerHuntOpts,
  DonateToScavengerHuntResponse,
  ExecuteTransactionOpts,
  getClaimsHistoryOpts,
  getVaultAccountAddressesOpts,
  makeClaimsOpts,
  MidnightApiError,
  PhaseConfigResponse,
  redeemNightOpts,
  registerScavengerHuntAddressOpts,
  RegistrationReceipt,
  ScavangerHuntChallangeResponse,
  SdkManagerMetrics,
  solveScavengerHuntChallengeOpts,
  SubmitClaimResponse,
  thawScheduleOpts,
  ThawScheduleResponse,
  thawStatusOpts,
  ThawTransactionResponse,
  TransactionType,
  TransferClaimsResponse,
  trasnsferClaimsOpts,
} from "../types/index.js";
import { FireblocksMidnightSDK } from "../FireblocksMidnightSDK.js";
import { Logger } from "../utils/logger.js";

/**
 * Service class that manages Fireblocks Midnight SDK operations and connection pooling.
 *
 * This service provides a high-level interface for executing various Midnight blockchain
 * operations through the Fireblocks SDK. It manages SDK instance pooling for efficient
 * resource usage and handles transaction routing, error handling, and lifecycle management.
 *
 * @class FbNightApiService
 * @example
 * ```typescript
 * const config: ApiServiceConfig = {
 *   apiKey: 'your-api-key',
 *   secretKey: 'your-secret-key',
 *   basePath: BasePath.US,
 *   poolConfig: {
 *     maxPoolSize: 10,
 *     acquireTimeoutMillis: 30000
 *   }
 * };
 *
 * const service = new FbNightApiService(config);
 *
 * // Execute a transaction
 * const result = await service.executeTransaction({
 *   vaultAccountId: '123',
 *   chain: SupportedBlockchains.CARDANO,
 *   transactionType: TransactionType.CHECK_ADDRESS_ALLOCATION,
 *   params: { chain: SupportedBlockchains.CARDANO }
 * });
 *
 * // Get pool metrics
 * const metrics = service.getPoolMetrics();
 *
 * // Shutdown when done
 * await service.shutdown();
 * ```
 */
export class FbNightApiService {
  private sdkManager: SdkManager;

  private readonly logger = new Logger("api:api-service");

  /**
   * Creates an instance of FbNightApiService.
   *
   * Initializes the service with Fireblocks API credentials and configuration.
   * Validates all required configuration parameters and sets up the SDK manager
   * with connection pooling for efficient resource management.
   *
   * @param config - Configuration object for the API service
   * @param config.apiKey - Fireblocks API key (required, non-empty string)
   * @param config.secretKey - Fireblocks secret key (required, non-empty string)
   * @param config.basePath - Fireblocks API base path (optional, defaults to BasePath.US)
   * @param config.poolConfig - SDK connection pool configuration (optional)
   * @param config.poolConfig.maxPoolSize - Maximum number of SDK instances in the pool
   * @param config.poolConfig.acquireTimeoutMillis - Timeout for acquiring SDK from pool
   *
   * @throws {Error} When config is missing or not an object
   * @throws {Error} When apiKey is missing or not a non-empty string
   * @throws {Error} When secretKey is missing or not a non-empty string
   * @throws {Error} When basePath is provided but not a valid BasePath enum value
   * @throws {Error} When poolConfig is provided but not an object
   *
   * @example
   * ```typescript
   * // Minimal configuration
   * const service = new FbNightApiService({
   *   apiKey: process.env.FB_API_KEY,
   *   secretKey: process.env.FB_SECRET_KEY
   * });
   *
   * // Full configuration with pooling
   * const service = new FbNightApiService({
   *   apiKey: process.env.FB_API_KEY,
   *   secretKey: process.env.FB_SECRET_KEY,
   *   basePath: BasePath.EU,
   *   poolConfig: {
   *     maxPoolSize: 15,
   *     acquireTimeoutMillis: 60000
   *   }
   * });
   * ```
   */
  constructor(config: ApiServiceConfig) {
    if (!config || typeof config !== "object") {
      throw new Error("InvalidConfig, Config object is required.");
    }
    if (
      !config.apiKey ||
      typeof config.apiKey !== "string" ||
      !config.apiKey.trim()
    ) {
      throw new Error("InvalidConfig, apiKey must be a non-empty string.");
    }
    if (
      !config.secretKey ||
      typeof config.secretKey !== "string" ||
      !config.secretKey.trim()
    ) {
      throw new Error("InvalidConfig, secretKey must be a non-empty string.");
    }

    if (
      config.basePath &&
      !Object.values(BasePath).includes(config.basePath as BasePath)
    ) {
      throw new Error(
        `InvalidConfig, basePath must be one of: ${Object.values(BasePath).join(
          ", "
        )}`
      );
    }
    if (config.poolConfig && typeof config.poolConfig !== "object") {
      throw new Error(
        `InvalidConfig, poolConfig must be an object if provided.`
      );
    }
    const baseConfig = {
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      basePath: (config.basePath as BasePath) || BasePath.US,
    };

    this.sdkManager = new SdkManager(baseConfig, config.poolConfig);
  }

  /**
   * Executes a blockchain transaction using the appropriate SDK method.
   *
   * This method serves as the main entry point for all blockchain operations. It acquires
   * an SDK instance from the connection pool, routes the request to the appropriate SDK
   * method based on transaction type, and ensures proper resource cleanup.
   *
   * The method supports a wide variety of operations including:
   * - Address allocation checking
   * - Claims management (creation, history, transfers)
   * - Scavenger hunt operations (registration, challenges, donations)
   * - Token redemption and thawing
   * - Vault account address management
   *
   * @param options - Transaction execution options
   * @param options.vaultAccountId - The Fireblocks vault account ID to use
   * @param options.chain - The blockchain network (e.g., CARDANO)
   * @param options.transactionType - The type of transaction to execute
   * @param options.params - Transaction-specific parameters (varies by transaction type)
   *
   * @returns A Promise resolving to the transaction result. Return type varies by transaction:
   * - CHECK_ADDRESS_ALLOCATION: number (allocation count)
   * - GET_CLAIMS_HISTORY: ClaimHistoryResponse[]
   * - MAKE_CLAIMS: SubmitClaimResponse[]
   * - TRANSFER_CLAIMS: TransferClaimsResponse
   * - GET_VAULT_ACCOUNT_ADDRESSES: VaultWalletAddress[]
   * - REGISTER_SCAVENGER_HUNT_ADDRESS: RegistrationReceipt
   * - GET_SCAVENGER_HUNT_CHALLENGE: ScavangerHuntChallangeResponse
   * - SOLVE_SCAVENGER_HUNT_CHALLENGE: TransactionResponse
   * - DONATE_TO_SCAVENGER_HUNT: DonateToScavengerHuntResponse
   * - GET_PHASE_CONFIG: PhaseConfigResponse
   * - GET_THAW_SCHEDULE: ThawScheduleResponse
   * - GET_THAW_STATUS: ThawTransactionResponse
   * - REDEEM_NIGHT: TransactionResponse
   *
   * @throws {Error} When an unknown transaction type is provided
   * @throws {MidnightApiError} When the underlying SDK operation fails
   * @throws {Error} When SDK acquisition from pool times out or fails
   *
   * @example
   * ```typescript
   * // Check address allocation
   * const allocation = await service.executeTransaction({
   *   vaultAccountId: '123',
   *   chain: SupportedBlockchains.CARDANO,
   *   transactionType: TransactionType.CHECK_ADDRESS_ALLOCATION,
   *   params: { chain: SupportedBlockchains.CARDANO }
   * });
   *
   * // Transfer claims
   * const transfer = await service.executeTransaction({
   *   vaultAccountId: '123',
   *   chain: SupportedBlockchains.CARDANO,
   *   transactionType: TransactionType.TRANSFER_CLAIMS,
   *   params: {
   *     recipientAddress: 'addr1...',
   *     tokenPolicyId: 'abc123...',
   *     requiredTokenAmount: 1000000
   *   }
   * });
   *
   * // Solve scavenger hunt challenge
   * const solution = await service.executeTransaction({
   *   vaultAccountId: '123',
   *   chain: SupportedBlockchains.CARDANO,
   *   transactionType: TransactionType.SOLVE_SCAVENGER_HUNT_CHALLENGE,
   *   params: { vaultAccountId: '123', index: 0 }
   * });
   * ```
   *
   * @remarks
   * The SDK instance is automatically acquired from the pool at the start of execution
   * and released back to the pool in the finally block, ensuring proper resource management
   * even when errors occur.
   */
  public executeTransaction = async ({
    vaultAccountId,
    chain,
    transactionType,
    params,
  }: ExecuteTransactionOpts): Promise<
    | number
    | TransactionResponse
    | TransferClaimsResponse
    | ClaimHistoryResponse[]
    | SubmitClaimResponse[]
    | VaultWalletAddress[]
    | PhaseConfigResponse
    | RegistrationReceipt
    | ThawScheduleResponse
    | ScavangerHuntChallangeResponse
    | DonateToScavengerHuntResponse
    | ThawTransactionResponse
  > => {
    let sdk: FireblocksMidnightSDK | undefined;
    try {
      // Get SDK instance from the pool
      sdk = await this.sdkManager.getSdk(vaultAccountId, chain);

      // Execute the appropriate transaction based on type
      let result:
        | number
        | TransactionResponse
        | TransferClaimsResponse
        | ClaimHistoryResponse[]
        | SubmitClaimResponse[]
        | VaultWalletAddress[]
        | RegistrationReceipt
        | ScavangerHuntChallangeResponse
        | PhaseConfigResponse
        | ThawScheduleResponse
        | ThawTransactionResponse;

      switch (transactionType) {
        case TransactionType.CHECK_ADDRESS_ALLOCATION:
          result = await sdk.checkAddressAllocation(
            params as checkAddressAllocationOpts
          );
          break;

        case TransactionType.GET_CLAIMS_HISTORY:
          result = await sdk.getClaimsHistory(params as getClaimsHistoryOpts);
          break;

        case TransactionType.MAKE_CLAIMS:
          result = await sdk.makeClaims(params as makeClaimsOpts);
          break;

        case TransactionType.TRANSFER_CLAIMS:
          result = await sdk.transferClaims(params as trasnsferClaimsOpts);
          break;

        case TransactionType.GET_VAULT_ACCOUNT_ADDRESSES:
          result = await sdk.getVaultAccountAddresses(
            params as getVaultAccountAddressesOpts
          );
          break;

        case TransactionType.REGISTER_SCAVENGER_HUNT_ADDRESS:
          result = await sdk.registerScavengerHuntAddress(
            params as registerScavengerHuntAddressOpts
          );
          break;

        case TransactionType.GET_SCAVENGER_HUNT_CHALLENGE:
          result = await sdk.getScavengerHuntChallenge();
          break;

        case TransactionType.SOLVE_SCAVENGER_HUNT_CHALLENGE:
          result = await sdk.solveScavengerHuntChallenge(
            params as solveScavengerHuntChallengeOpts
          );
          break;

        case TransactionType.DONATE_TO_SCAVENGER_HUNT:
          result = await sdk.donateToScavengerHunt(
            params as donateToScavengerHuntOpts
          );
          break;

        case TransactionType.GET_PHASE_CONFIG:
          result = await sdk.getPhaseConfig();
          break;

        case TransactionType.GET_THAW_SCHEDULE:
          result = await sdk.getThawSchedule(params as thawScheduleOpts);
          break;

        case TransactionType.GET_THAW_STATUS:
          result = await sdk.getThawTransactionStatus(params as thawStatusOpts);
          break;

        case TransactionType.REDEEM_NIGHT:
          result = await sdk.redeemNight(params as redeemNightOpts);
          break;

        default:
          this.logger.error(
            `Unknown transaction type: ${transactionType} for vault ${vaultAccountId}`
          );
          throw new Error(`Unknown transaction type: ${transactionType}`);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error executing ${transactionType} for vault ${vaultAccountId}:`,
        error instanceof MidnightApiError
          ? `[${error.statusCode}] ${error.message} (${error.errorType})`
          : error
      );
      throw error;
    } finally {
      if (sdk) {
        this.sdkManager.releaseSdk(vaultAccountId);
      }
    }
  };

  /**
   * Retrieves metrics about the SDK connection pool.
   *
   * This method returns real-time statistics about the SDK manager's connection pool,
   * including information about active connections, pool size, and resource usage.
   * Useful for monitoring and debugging pool behavior.
   *
   * @returns SdkManagerMetrics object containing pool statistics such as:
   * - Active SDK instances count
   * - Pool capacity and utilization
   * - Connection acquisition statistics
   * - Any other pool-specific metrics
   *
   * @example
   * ```typescript
   * const metrics = service.getPoolMetrics();
   * console.log(`Active SDKs: ${metrics.activeCount}`);
   * console.log(`Pool size: ${metrics.poolSize}`);
   * console.log(`Peak usage: ${metrics.peakUsage}`);
   * ```
   *
   * @remarks
   * This method is non-blocking and can be called at any time to inspect pool state.
   * It's particularly useful for monitoring pool saturation and identifying potential
   * bottlenecks in high-throughput scenarios.
   */
  public getPoolMetrics = (): SdkManagerMetrics => {
    return this.sdkManager.getMetrics();
  };

  /**
   * Gracefully shuts down the API service and all SDK instances.
   *
   * This method performs a complete cleanup of all resources managed by the service,
   * including shutting down all SDK instances in the pool, closing connections, and
   * releasing any held resources. Should be called when the application is terminating
   * or when the service is no longer needed.
   *
   * @returns A Promise that resolves when all shutdown operations are complete
   *
   * @example
   * ```typescript
   * // Shutdown on application exit
   * process.on('SIGTERM', async () => {
   *   console.log('Shutting down API service...');
   *   await service.shutdown();
   *   process.exit(0);
   * });
   *
   * // Shutdown after use
   * try {
   *   await service.executeTransaction(...);
   * } finally {
   *   await service.shutdown();
   * }
   * ```
   *
   * @remarks
   * After calling shutdown(), the service instance should not be used for further operations.
   * Any pending operations will be allowed to complete before shutdown proceeds.
   * This method is idempotent - calling it multiple times is safe.
   */
  public shutdown = async (): Promise<void> => {
    return this.sdkManager.shutdown();
  };
}
