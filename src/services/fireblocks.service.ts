import {
  ConfigurationOptions as FireblocksConfig,
  Fireblocks,
  SignedMessageSignature,
  TransactionRequest,
  SignedMessageAlgorithmEnum,
  VaultWalletAddress,
} from "@fireblocks/ts-sdk";

import {
  generateTransactionPayload,
  getTxStatus,
} from "../utils/fireblocks.utils.js";
import { termsAndConditionsHash } from "../constants.js";
import {
  NoteType,
  SignMessageParams,
  SupportedAssetIds,
} from "../types/index.js";

import { getAssetIdsByBlockchain } from "../utils/general.js";
import { Logger } from "../utils/logger.js";

/**
 * Service class for interacting with the Fireblocks SDK.
 */
export class FireblocksService {
  private readonly fireblocksSDK: Fireblocks;
  private readonly logger = new Logger("services:fireblocks");

  constructor(config: FireblocksConfig) {
    this.fireblocksSDK = new Fireblocks({
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      basePath: config.basePath,
    });
  }

  /**
   * Broadcasts a transaction to the Fireblocks network.
   *
   * @param {TransactionRequest} transactionPayload - The transaction request payload to be broadcasted.
   * @returns {Promise<{ signature: SignedMessageSignature; content?: string; publicKey?: string; algorithm?: SignedMessageAlgorithmEnum } | null>} The signed message or null if signing fails.
   * @throws {Error} If there is an issue with the transaction or signing process.
   */
  public broadcastTransaction = async (
    transactionPayload: TransactionRequest
  ): Promise<{
    signature: SignedMessageSignature;
    content?: string;
    publicKey?: string;
    algorithm?: SignedMessageAlgorithmEnum;
  } | null> => {
    try {
      const transactionResponse =
        await this.fireblocksSDK.transactions.createTransaction({
          transactionRequest: transactionPayload,
        });

      const txId = transactionResponse.data.id;
      if (!txId) throw new Error("Transaction ID is undefined.");

      const completedTx = await getTxStatus(txId, this.fireblocksSDK);
      const signatureData = completedTx.signedMessages?.[0];
      if (signatureData?.signature) {
        return {
          signature: signatureData.signature,
          content: signatureData.content,
          publicKey: signatureData.publicKey,
          algorithm: signatureData.algorithm,
        };
      } else {
        this.logger.warn("No signed message found in response.");
        return null;
      }
    } catch (error: any) {
      this.logger.error(
        `${transactionPayload.assetId} signing error:`,
        error.message
      );
      throw error;
    }
  };

  /**
   * Signs a message for a transaction using the Fireblocks SDK.
   *
   * @param {SupportedBlockchains} chain - The blockchain to sign the message for.
   * @param {SupportedAssetIds} assetId - The asset ID for which to sign the message.
   * @param {string} originVaultAccountId - The vault account ID from which the transaction originates.
   * @param {string} destinationAddress - The address to which the transaction is directed.
   * @param {number} amount - The amount of the asset to be transferred.
   * @returns {Promise<{ signature?: SignedMessageSignature; publicKey?: string; algorithm?: SignedMessageAlgorithmEnum; content?: string; message: string } | null>} The signed message or null if signing fails.
   */
  public signMessage = async (
    params: SignMessageParams
  ): Promise<{
    signature?: SignedMessageSignature;
    publicKey?: string;
    algorithm?: SignedMessageAlgorithmEnum;
    content?: string;
    message: string;
  } | null> => {
    try {
      const {
        chain,
        originVaultAccountId,
        destinationAddress,
        amount,
        vaultName,
        originAddress,
        message,
        noteType,
      } = params;
      const payload =
        message ??
        `STAR ${amount} to ${destinationAddress} ${termsAndConditionsHash}`;

      this.logger.info("signMessage payload", payload);

      let note: string;

      switch (noteType) {
        case NoteType.DONATE:
          note = `Scavenger Hunt Donation for address ${destinationAddress}`;
          break;

        case NoteType.REGISTER:
          note = `Scavenger Hunt Registration for address ${destinationAddress}`;
          break;

        default: {
          const assetId = getAssetIdsByBlockchain(chain);
          const displayAmount = (amount / Math.pow(10, 6)).toFixed(6);

          if (vaultName && originAddress) {
            note = `Claiming ${displayAmount} NIGHT for ${
              assetId || chain
            } from ${originAddress} in Vault ${vaultName} to address ${destinationAddress}`;
          } else {
            note = `Claiming ${displayAmount} NIGHT for ${
              assetId || chain
            } to address ${destinationAddress}`;
          }
          break;
        }
      }

      const transactionPayload = await generateTransactionPayload(
        payload,
        chain,
        originVaultAccountId,
        this.fireblocksSDK,
        note,
        noteType
      );

      this.logger.info("signMessage transactionPayload", transactionPayload);

      if (!transactionPayload) {
        throw new Error("Failed to generate transaction payload");
      }

      const response = await this.broadcastTransaction(transactionPayload);
      return {
        ...response,
        message: payload,
      };
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  /**
   * Retrieves the default address for a specific vault account and asset.
   *
   * @param {string} vaultAccountId - The ID of the vault account.
   * @param {SupportedAssetIds} assetId - The ID of the asset for which to retrieve the address.
   * @returns {Promise<string>} The default address associated with the specified vault account and asset.
   * @throws {Error} If there is an issue retrieving the address.
   */
  public getVaultAccountAddress = async (
    vaultAccountId: string,
    assetId: SupportedAssetIds
  ): Promise<VaultWalletAddress[]> => {
    try {
      const addressesResponse =
        await this.fireblocksSDK.vaults.getVaultAccountAssetAddressesPaginated({
          vaultAccountId,
          assetId,
        });

      const addresses = addressesResponse.data.addresses;
      if (!addresses || addresses.length === 0) {
        throw new Error(
          `No addresses found for vault account ${vaultAccountId} and asset ${assetId}`
        );
      }

      return addresses;
    } catch (error: any) {
      throw new Error(
        `Failed to get address for vault account ${vaultAccountId}: ${error.message}`
      );
    }
  };

  /**
   * Retrieves all addresses for a specific vault account and asset.
   *
   * @param {string} vaultAccountId - The ID of the vault account.
   * @param {SupportedAssetIds} assetId - The ID of the asset for which to retrieve addresses.
   * @returns {Promise<VaultWalletAddress[]>} An array of VaultWalletAddress objects containing addresses and their details.
   * @throws {Error} If there is an issue retrieving the addresses.
   */
  public getVaultAccountAddresses = async (
    vaultAccountId: string,
    assetId: SupportedAssetIds
  ): Promise<VaultWalletAddress[]> => {
    try {
      const addressesResponse =
        await this.fireblocksSDK.vaults.getVaultAccountAssetAddressesPaginated({
          vaultAccountId,
          assetId,
        });

      const addresses = addressesResponse.data.addresses;
      if (!addresses) {
        throw new Error(
          `Failed to fetch addresses for vault account ${vaultAccountId} and asset ${assetId}`
        );
      }
      return addresses;
    } catch (error: any) {
      throw new Error(
        `Failed to get address for vault account ${vaultAccountId}: ${error.message}`
      );
    }
  };

  /**
   * Retrieves the public key for a specific asset in a vault account.
   *
   * @param {string} vaultAccountId - The ID of the vault account.
   * @param {SupportedAssetIds} assetId - The ID of the asset for which to retrieve the public key.
   * @param {number} [change=0] - The change index for the address (default is 0).
   * @param {number} [addressIndex=0] - The address index (default is 0).
   * @returns {Promise<string>} The public key associated with the specified asset and vault account.
   * @throws {Error} If there is an issue retrieving the public key.
   */
  public getAssetPublicKey = async (
    vaultAccountId: string,
    assetId: SupportedAssetIds,
    change: number = 0,
    addressIndex: number = 0
  ): Promise<string> => {
    try {
      const response =
        await this.fireblocksSDK.vaults.getPublicKeyInfoForAddress({
          vaultAccountId,
          assetId,
          change,
          addressIndex,
        });

      const publicKey = response.data.publicKey;

      if (!publicKey) {
        throw new Error(
          `Error fetching public key for vault account ${vaultAccountId}`
        );
      }

      return publicKey;
    } catch (error: any) {
      throw new Error(
        `Failed to get public key for vault account ${vaultAccountId}: ${error.message}`
      );
    }
  };
}
