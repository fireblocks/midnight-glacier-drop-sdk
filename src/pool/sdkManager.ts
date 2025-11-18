import {
  PoolConfig,
  SdkManagerMetrics,
  SdkPoolItem,
  SupportedBlockchains,
} from "../types/index.js";
import { FireblocksMidnightSDK } from "../FireblocksMidnightSDK.js";
import { ConfigurationOptions } from "@fireblocks/ts-sdk";
import { Logger } from "../utils/logger.js";

/**
 * Manages a pool of FireblocksMidnightSDK instances for efficient resource utilization.
 *
 * The SdkManager implements connection pooling for SDK instances, allowing reuse of
 * initialized SDK connections across multiple requests. This reduces initialization
 * overhead and manages resource limits effectively. The manager handles:
 * - SDK instance creation and lifecycle management
 * - Automatic cleanup of idle connections
 * - Pool size limits and eviction policies
 * - Per-vault-account SDK instance tracking
 *
 * @class SdkManager
 * @example
 * ```typescript
 * const config: ConfigurationOptions = {
 *   apiKey: 'your-api-key',
 *   secretKey: 'your-secret-key',
 *   basePath: BasePath.US
 * };
 *
 * const poolConfig: Partial<PoolConfig> = {
 *   maxPoolSize: 50,
 *   idleTimeoutMs: 20 * 60 * 1000, // 20 minutes
 *   cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
 * };
 *
 * const manager = new SdkManager(config, poolConfig);
 *
 * // Get SDK instance
 * const sdk = await manager.getSdk('123', SupportedBlockchains.CARDANO);
 *
 * try {
 *   // Use SDK
 *   await sdk.makeClaims(...);
 * } finally {
 *   // Always release back to pool
 *   manager.releaseSdk('123');
 * }
 *
 * // Check pool health
 * const metrics = manager.getMetrics();
 * console.log(`Active: ${metrics.activeInstances}, Idle: ${metrics.idleInstances}`);
 *
 * // Cleanup on shutdown
 * await manager.shutdown();
 * ```
 */
export class SdkManager {
  private sdkPool: Map<string, SdkPoolItem> = new Map();
  private baseConfig: ConfigurationOptions;
  private poolConfig: PoolConfig;
  private cleanupInterval: NodeJS.Timeout;

  private readonly logger = new Logger("pool:sdk-manager");

  /**
   * Creates an instance of SdkManager with connection pooling.
   *
   * Initializes the SDK pool manager with Fireblocks configuration and pooling settings.
   * Sets up automatic cleanup of idle connections at regular intervals to prevent
   * resource exhaustion and maintain optimal pool health.
   *
   * @param baseConfig - Fireblocks SDK configuration used for all SDK instances
   * @param baseConfig.apiKey - Fireblocks API key
   * @param baseConfig.secretKey - Fireblocks secret key
   * @param baseConfig.basePath - Fireblocks API endpoint (US, EU, etc.)
   * @param poolConfig - Optional pool configuration settings
   * @param poolConfig.maxPoolSize - Maximum number of SDK instances (default: 100)
   * @param poolConfig.idleTimeoutMs - Time before idle SDKs are removed (default: 30 minutes)
   * @param poolConfig.cleanupIntervalMs - Interval for cleanup checks (default: 5 minutes)
   * @param poolConfig.connectionTimeoutMs - Timeout for SDK creation (default: 30 seconds)
   * @param poolConfig.retryAttempts - Number of retry attempts for SDK creation (default: 3)
   *
   * @example
   * ```typescript
   * // Using default pool settings
   * const manager = new SdkManager({
   *   apiKey: process.env.FB_API_KEY,
   *   secretKey: process.env.FB_SECRET_KEY,
   *   basePath: BasePath.US
   * });
   *
   * // Custom pool configuration
   * const manager = new SdkManager(
   *   {
   *     apiKey: process.env.FB_API_KEY,
   *     secretKey: process.env.FB_SECRET_KEY,
   *     basePath: BasePath.EU
   *   },
   *   {
   *     maxPoolSize: 50,
   *     idleTimeoutMs: 15 * 60 * 1000,
   *     cleanupIntervalMs: 2 * 60 * 1000
   *   }
   * );
   * ```
   *
   * @remarks
   * The cleanup interval starts immediately upon construction and runs periodically
   * to remove idle SDK instances. This background process helps maintain pool health
   * and free up resources from unused connections.
   */
  constructor(
    baseConfig: ConfigurationOptions,
    poolConfig?: Partial<PoolConfig>
  ) {
    this.baseConfig = baseConfig;

    this.poolConfig = {
      maxPoolSize: poolConfig?.maxPoolSize || 100,
      idleTimeoutMs: poolConfig?.idleTimeoutMs || 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: poolConfig?.cleanupIntervalMs || 5 * 60 * 1000, // 5 minutes
      connectionTimeoutMs: poolConfig?.connectionTimeoutMs || 30 * 1000, // 30 seconds
      retryAttempts: poolConfig?.retryAttempts || 3,
    };

    this.cleanupInterval = setInterval(
      () => this.cleanupIdleSdks(),
      this.poolConfig.cleanupIntervalMs
    );
  }

  /**
   * Retrieves or creates an SDK instance for a specific vault account and blockchain.
   *
   * This method implements the core pooling logic:
   * 1. Checks if an existing SDK instance exists for the vault/chain combination
   * 2. If found and idle, marks it as in-use and returns it (connection reuse)
   * 3. If pool is at capacity, attempts to evict the oldest idle connection
   * 4. Creates a new SDK instance if needed
   * 5. Tracks the instance in the pool for future reuse
   *
   * Each SDK instance is uniquely identified by the combination of vault account ID
   * and blockchain, ensuring proper isolation between different vault accounts.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param chain - The blockchain network (e.g., CARDANO)
   * @returns A Promise resolving to a FireblocksMidnightSDK instance ready for use
   *
   * @throws {Error} When pool is at maximum capacity with no idle connections available
   * @throws {Error} When SDK instance creation fails
   *
   * @example
   * ```typescript
   * // Get SDK for vault account 123 on Cardano
   * const sdk = await manager.getSdk('123', SupportedBlockchains.CARDANO);
   *
   * try {
   *   const result = await sdk.checkAddressAllocation(...);
   *   // Process result
   * } finally {
   *   // Always release the SDK back to the pool
   *   manager.releaseSdk('123');
   * }
   *
   * // Getting SDK for different vault account
   * const sdk2 = await manager.getSdk('456', SupportedBlockchains.CARDANO);
   * ```
   *
   * @remarks
   * Always pair `getSdk` calls with `releaseSdk` in a try-finally block to ensure
   * the SDK is returned to the pool even if an error occurs. Failing to release
   * SDKs will eventually exhaust the pool and cause subsequent requests to fail.
   *
   * The pool key is generated as `${vaultAccountId}:${chain}`, meaning the same
   * vault account on different chains will have separate SDK instances.
   */
  public getSdk = async (
    vaultAccountId: string,
    chain: SupportedBlockchains
  ): Promise<FireblocksMidnightSDK> => {
    const key = `${vaultAccountId}:${chain}`;
    const poolItem = this.sdkPool.get(key);

    // If instance exists and is not in use, return it
    if (poolItem && !poolItem.isInUse) {
      this.logger.info(
        `Reusing existing SDK instance for vault ${vaultAccountId} on chain ${chain}`
      );
      poolItem.lastUsed = new Date();
      poolItem.isInUse = true;
      return poolItem.sdk;
    }

    if (this.sdkPool.size >= this.poolConfig.maxPoolSize && !poolItem) {
      const removed = await this.removeOldestIdleSdk();
      if (!removed) {
        this.logger.error(
          `SDK pool is at maximum capacity (${this.poolConfig.maxPoolSize}) with no idle connections`
        );
        throw new Error(
          `SDK pool is at maximum capacity (${this.poolConfig.maxPoolSize}) with no idle connections`
        );
      }
    }

    // Create a new SDK instance if needed
    if (!poolItem) {
      const sdk = await this.createSdkInstance(vaultAccountId, chain);
      this.sdkPool.set(key, {
        sdk,
        lastUsed: new Date(),
        isInUse: true,
      });
      return sdk;
    } else {
      poolItem.lastUsed = new Date();
      poolItem.isInUse = true;
      return poolItem.sdk;
    }
  };

  /**
   * Releases an SDK instance back to the pool for reuse.
   *
   * Marks the SDK instance as available for reuse by other requests. Updates the
   * last-used timestamp to ensure accurate idle timeout tracking. This method should
   * always be called after completing operations with an SDK instance to prevent
   * pool exhaustion.
   *
   * @param vaultAccountId - The vault account ID whose SDK should be released
   *
   * @example
   * ```typescript
   * const sdk = await manager.getSdk('123', SupportedBlockchains.CARDANO);
   *
   * try {
   *   await sdk.makeClaims(...);
   * } catch (error) {
   *   console.error('Transaction failed:', error);
   * } finally {
   *   // Always release, even on error
   *   manager.releaseSdk('123');
   * }
   * ```
   *
   * @remarks
   * If the vault account ID doesn't exist in the pool, this method safely does nothing.
   * The method only updates the pool item's state and doesn't perform any cleanup or
   * shutdown of the SDK instance - that's handled by the periodic cleanup process.
   *
   * Note that the release key should match the vault account ID, not the full pool key
   * (which includes the chain). This is a potential bug in the implementation.
   */
  public releaseSdk = (vaultAccountId: string): void => {
    const poolItem = this.sdkPool.get(vaultAccountId);
    if (poolItem) {
      poolItem.isInUse = false;
      poolItem.lastUsed = new Date();
    }
  };

  /**
   * Creates a new FireblocksMidnightSDK instance.
   *
   * Initializes a new SDK instance with the base Fireblocks configuration and
   * vault-specific settings. This is an asynchronous operation that may involve
   * network calls to set up the SDK connection.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param chain - The blockchain network to initialize for
   * @returns A Promise resolving to a new FireblocksMidnightSDK instance
   *
   * @throws {Error} When SDK initialization fails (network errors, invalid config, etc.)
   *
   * @private
   *
   * @remarks
   * This method is called internally by `getSdk` when a new SDK instance is needed.
   * Errors during SDK creation are logged and re-thrown to the caller.
   */
  private async createSdkInstance(
    vaultAccountId: string,
    chain: SupportedBlockchains
  ): Promise<FireblocksMidnightSDK> {
    try {
      return await FireblocksMidnightSDK.create({
        fireblocksConfig: this.baseConfig,
        vaultAccountId,
        chain,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create SDK instance for vault ${vaultAccountId} on chain ${chain}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Finds and removes the oldest idle SDK instance from the pool.
   *
   * Implements an LRU (Least Recently Used) eviction policy by finding the SDK instance
   * with the oldest last-used timestamp that is not currently in use. This method is
   * called when the pool reaches maximum capacity and needs to make room for a new
   * SDK instance.
   *
   * @returns A Promise resolving to true if an idle instance was removed, false if no
   * idle instances were found (all SDKs are currently in use)
   *
   * @private
   *
   * @remarks
   * This method only considers SDK instances that are marked as idle (isInUse = false).
   * If all SDK instances in the pool are currently in use, this method returns false,
   * which will cause `getSdk` to throw an error about pool capacity.
   *
   * The eviction does not perform any graceful shutdown of the SDK - it simply removes
   * the entry from the pool map, allowing garbage collection to clean up the instance.
   */
  private removeOldestIdleSdk = async (): Promise<boolean> => {
    let oldestKey: string | null = null;
    let oldestDate: Date = new Date();

    // Find the oldest idle instance
    for (const [key, value] of this.sdkPool.entries()) {
      if (!value.isInUse && value.lastUsed < oldestDate) {
        oldestDate = value.lastUsed;
        oldestKey = key;
      }
    }

    // If an idle instance was found, shut it down and remove it
    if (oldestKey) {
      this.sdkPool.delete(oldestKey);
      return true;
    }

    return false;
  };

  /**
   * Performs periodic cleanup of idle SDK instances that have exceeded the idle timeout.
   *
   * This method runs on a timer (controlled by cleanupIntervalMs) and removes SDK
   * instances that have been idle for longer than the configured idleTimeoutMs.
   * Helps prevent resource leaks and maintains optimal pool size by removing unused
   * connections.
   *
   * @returns A Promise that resolves when cleanup is complete
   *
   * @private
   *
   * @remarks
   * The cleanup process:
   * 1. Iterates through all pool entries
   * 2. Calculates idle time for non-in-use instances
   * 3. Marks instances exceeding idleTimeoutMs for removal
   * 4. Removes marked instances from the pool
   *
   * Errors during individual SDK cleanup are caught and logged but don't prevent
   * cleanup of other instances. This ensures one problematic SDK doesn't block
   * the entire cleanup process.
   *
   * This method is called automatically by the interval timer set up in the constructor.
   */
  private cleanupIdleSdks = async (): Promise<void> => {
    const now = new Date();
    const keysToRemove: string[] = [];

    for (const [key, value] of this.sdkPool.entries()) {
      if (!value.isInUse) {
        const idleTime = now.getTime() - value.lastUsed.getTime();
        if (idleTime > this.poolConfig.idleTimeoutMs) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      try {
        this.sdkPool.delete(key);
        this.logger.info(`Removed idle SDK instance for vault ${key}`);
      } catch (error) {
        this.logger.error(`Error shutting down SDK for vault ${key}:`, error);
      }
    }
  };

  /**
   * Retrieves current metrics and statistics about the SDK pool.
   *
   * Returns a snapshot of the pool's current state including total instance count,
   * number of active vs. idle instances, and per-vault-account usage status.
   * Useful for monitoring pool health, debugging connection issues, and capacity planning.
   *
   * @returns SdkManagerMetrics object containing:
   * - totalInstances: Total number of SDK instances in the pool
   * - activeInstances: Number of SDK instances currently in use
   * - idleInstances: Number of SDK instances available for reuse
   * - instancesByVaultAccount: Map of vault:chain keys to their usage status (boolean)
   *
   * @example
   * ```typescript
   * const metrics = manager.getMetrics();
   *
   * console.log(`Total SDKs: ${metrics.totalInstances}`);
   * console.log(`Active: ${metrics.activeInstances}`);
   * console.log(`Idle: ${metrics.idleInstances}`);
   * console.log(`Utilization: ${(metrics.activeInstances / metrics.totalInstances * 100).toFixed(1)}%`);
   *
   * // Check specific vault account
   * const vaultKey = '123:CARDANO';
   * if (metrics.instancesByVaultAccount[vaultKey]) {
   *   console.log(`Vault ${vaultKey} is currently in use`);
   * }
   *
   * // Monitoring example
   * setInterval(() => {
   *   const metrics = manager.getMetrics();
   *   if (metrics.activeInstances / metrics.totalInstances > 0.9) {
   *     console.warn('Pool utilization above 90%!');
   *   }
   * }, 30000); // Check every 30 seconds
   * ```
   *
   * @remarks
   * This method is non-blocking and performs a simple iteration over the pool map.
   * It can be called frequently for monitoring without performance concerns.
   * The metrics represent a point-in-time snapshot and may change immediately after
   * the method returns due to concurrent operations.
   */
  public getMetrics = (): SdkManagerMetrics => {
    const metrics: SdkManagerMetrics = {
      totalInstances: this.sdkPool.size,
      activeInstances: 0,
      idleInstances: 0,
      instancesByVaultAccount: {},
    };

    for (const [key, value] of this.sdkPool.entries()) {
      if (value.isInUse) {
        metrics.activeInstances++;
      } else {
        metrics.idleInstances++;
      }
      metrics.instancesByVaultAccount[key] = value.isInUse;
    }

    return metrics;
  };

  /**
   * Performs graceful shutdown of the SDK manager and all pooled instances.
   *
   * Stops the automatic cleanup interval and clears all SDK instances from the pool.
   * This method should be called when the application is shutting down or when the
   * SDK manager is no longer needed to ensure proper resource cleanup.
   *
   * @returns A Promise that resolves when shutdown is complete
   *
   * @example
   * ```typescript
   * // Shutdown on application exit
   * process.on('SIGTERM', async () => {
   *   console.log('Shutting down SDK manager...');
   *   await manager.shutdown();
   *   console.log('SDK manager shutdown complete');
   *   process.exit(0);
   * });
   *
   * // Manual cleanup
   * try {
   *   // Use SDK manager
   *   const sdk = await manager.getSdk('123', SupportedBlockchains.CARDANO);
   *   // ... operations
   * } finally {
   *   await manager.shutdown();
   * }
   * ```
   *
   * @remarks
   * After calling shutdown:
   * - The cleanup interval timer is stopped (no more automatic cleanup)
   * - All SDK instances are removed from the pool
   * - The pool map is cleared but the manager object itself is not destroyed
   *
   * Any SDK instances that are currently in use will be removed from tracking
   * but their underlying connections may remain until garbage collected.
   *
   * This method is idempotent - calling it multiple times is safe.
   */
  public shutdown = async (): Promise<void> => {
    clearInterval(this.cleanupInterval);

    this.sdkPool.clear();
    this.logger.info("All SDK instances have been shut down");
  };
}
