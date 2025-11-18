import { BasePath } from "@fireblocks/ts-sdk";
import { FireblocksMidnightSDK } from "../FireblocksMidnightSDK.js";

export interface SdkPoolItem {
  sdk: FireblocksMidnightSDK;
  lastUsed: Date;
  isInUse: boolean;
}

export interface PoolConfig {
  maxPoolSize: number;
  idleTimeoutMs: number;
  cleanupIntervalMs: number;
  connectionTimeoutMs: number;
  retryAttempts: number;
}

export interface ApiServiceConfig {
  apiKey: string;
  secretKey: string;
  basePath: BasePath | string;
  poolConfig?: Partial<PoolConfig>;
}

export interface SdkManagerMetrics {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  instancesByVaultAccount: Record<string, boolean>;
}
