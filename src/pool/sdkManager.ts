import {
  PoolConfig,
  SdkManagerMetrics,
  SdkPoolItem,
  SupportedBlockchains,
} from "../types.js";
import { FireblocksMidnightSDK } from "../FireblocksMidnightSDK.js";
import { ConfigurationOptions } from "@fireblocks/ts-sdk";
import { Logger } from "../utils/logger.js";

export class SdkManager {
  private sdkPool: Map<string, SdkPoolItem> = new Map();
  private baseConfig: ConfigurationOptions;
  private poolConfig: PoolConfig;
  private cleanupInterval: NodeJS.Timeout;

  private logger = new Logger("pool:sdk-manager");

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
   * Get an SDK instance for a specific vault account ID and blockchain
   * @param vaultAccountId Fireblocks vault account ID
   * @param chain Supported blockchain
   * @returns FireblocksMidnightSDK instance
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
   * Release an SDK instance back to the pool
   * @param vaultAccountId Vault account ID
   */
  public releaseSdk = (vaultAccountId: string): void => {
    const poolItem = this.sdkPool.get(vaultAccountId);
    if (poolItem) {
      poolItem.isInUse = false;
      poolItem.lastUsed = new Date();
    }
  };

  /**
   * Create a new SDK instance
   * @param vaultAccountId Vault account ID
   * @param chain Supported blockchain
   * @returns New FireblocksMidnightSDK instance
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
   * Find and remove the oldest idle SDK instance
   * @returns True if an instance was removed, false otherwise
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
   * Clean up idle SDK instances
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
   * Get metrics about the SDK pool
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
   * Shut down all SDK instances and clean up resources
   */
  public shutdown = async (): Promise<void> => {
    clearInterval(this.cleanupInterval);

    this.sdkPool.clear();
    this.logger.info("All SDK instances have been shut down");
  };
}
