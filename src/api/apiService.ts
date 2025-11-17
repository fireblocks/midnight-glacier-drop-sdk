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
  ExecuteTransactionOpts,
  getClaimsHistoryOpts,
  getVaultAccountAddressesOpts,
  makeClaimsOpts,
  registerScavengerHuntAddressOpts,
  RegistrationReceipt,
  ScavangerHuntChallangeResponse,
  SdkManagerMetrics,
  solveScavengerHuntChallengeOpts,
  SubmitClaimResponse,
  TransactionType,
  TransferClaimsResponse,
  trasnsferClaimsOpts,
} from "../types.js";
import { FireblocksMidnightSDK } from "../FireblocksMidnightSDK.js";
import { Logger } from "../utils/logger.js";

export class FbNightApiService {
  private sdkManager: SdkManager;

  private readonly logger = new Logger("api:api-service");

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
   * Execute a transaction using the appropriate SDK method
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
    | RegistrationReceipt
    | ScavangerHuntChallangeResponse
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
        | ScavangerHuntChallangeResponse;
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

        case TransactionType.GET_SCAVENGER_HUNT_CHALLENGE:
          result = await sdk.getScavengerHuntChallenge();
          break;

        case TransactionType.SOLVE_SCAVENGER_HUNT_CHALLENGE:
          result = await sdk.solveScavengerHuntChallenge(
            params as solveScavengerHuntChallengeOpts
          );
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
        error
      );
      throw error;
    } finally {
      // Always release the SDK back to the pool
      if (sdk) {
        this.sdkManager.releaseSdk(vaultAccountId);
      }
    }
  };

  /**
   * Get metrics about the SDK pool
   */
  public getPoolMetrics = (): SdkManagerMetrics => {
    return this.sdkManager.getMetrics();
  };

  /**
   * Shut down the API service and all SDK instances
   */
  public shutdown = async (): Promise<void> => {
    return this.sdkManager.shutdown();
  };
}
