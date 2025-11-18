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
 *
 * This service provides a high-level interface for common Fireblocks operations including:
 * - Message signing for blockchain transactions
 * - Transaction broadcasting and status tracking
 * - Vault account address management
 * - Public key retrieval for cryptographic operations
 *
 * The service wraps the Fireblocks SDK with additional error handling, logging, and
 * convenience methods tailored for Midnight blockchain claim operations.
 *
 * @class FireblocksService
 * @example
 * ```typescript
 * const config: FireblocksConfig = {
 *   apiKey: process.env.FIREBLOCKS_API_KEY,
 *   secretKey: process.env.FIREBLOCKS_SECRET_KEY,
 *   basePath: BasePath.US
 * };
 *
 * const service = new FireblocksService(config);
 *
 * // Sign a claim message
 * const signature = await service.signMessage({
 *   chain: SupportedBlockchains.CARDANO,
 *   originVaultAccountId: '123',
 *   destinationAddress: 'addr1...',
 *   amount: 1000000,
 *   vaultName: 'My Vault',
 *   originAddress: 'addr1qx...',
 *   noteType: NoteType.CLAIM
 * });
 *
 * // Get vault address
 * const address = await service.getVaultAccountAddress(
 *   '123',
 *   SupportedAssetIds.CARDANO,
 *   0
 * );
 *
 * // Get public key
 * const publicKey = await service.getAssetPublicKey(
 *   '123',
 *   SupportedAssetIds.CARDANO,
 *   0,
 *   0
 * );
 * ```
 */
export class FireblocksService {
  private readonly fireblocksSDK: Fireblocks;
  private readonly logger = new Logger("services:fireblocks");

  /**
   * Creates an instance of FireblocksService.
   *
   * Initializes the Fireblocks SDK with the provided configuration, setting up
   * authentication and API endpoint configuration for all subsequent operations.
   *
   * @param config - Fireblocks SDK configuration
   * @param config.apiKey - Fireblocks API key for authentication
   * @param config.secretKey - Fireblocks secret key for signing API requests
   * @param config.basePath - Fireblocks API endpoint (US, EU, etc.)
   *
   * @example
   * ```typescript
   * // Initialize with environment variables
   * const service = new FireblocksService({
   *   apiKey: process.env.FIREBLOCKS_API_KEY!,
   *   secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
   *   basePath: BasePath.US
   * });
   *
   * // Initialize with EU endpoint
   * const euService = new FireblocksService({
   *   apiKey: apiKey,
   *   secretKey: secretKey,
   *   basePath: BasePath.EU
   * });
   * ```
   */
  constructor(config: FireblocksConfig) {
    this.fireblocksSDK = new Fireblocks({
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      basePath: config.basePath,
    });
  }

  /**
   * Broadcasts a transaction to the Fireblocks network and waits for signing completion.
   *
   * This method submits a transaction request to Fireblocks, monitors its status until
   * completion, and extracts the signed message data. It's primarily used for message
   * signing operations where the transaction is used to generate cryptographic signatures
   * rather than transferring assets.
   *
   * The method polls the transaction status until it reaches a terminal state and
   * returns the signature data from the completed transaction.
   *
   * @param transactionPayload - The transaction request to broadcast, containing:
   *   - Operation type (TYPED_MESSAGE for signing)
   *   - Source vault account
   *   - Message content to sign
   *   - Note/description for the transaction
   *
   * @returns A Promise resolving to an object containing:
   * - signature: The SignedMessageSignature with fullSig, r, s, v components
   * - content: Optional message content that was signed
   * - publicKey: Optional public key used for signing
   * - algorithm: Optional signature algorithm used (e.g., MPC_ECDSA_SECP256K1)
   * Returns null if the transaction completes but no signature is found
   *
   * @throws {Error} When transaction ID is undefined after creation
   * @throws {Error} When transaction creation or status polling fails
   * @throws {Error} When Fireblocks API returns an error response
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * const payload: TransactionRequest = {
   *   operation: TransactionOperation.TYPED_MESSAGE,
   *   source: { type: 'VAULT_ACCOUNT', id: '123' },
   *   assetId: 'ADA',
   *   extraParameters: {
   *     rawMessageData: {
   *       messages: [{
   *         content: 'Message to sign',
   *         type: 'EIP191'
   *       }]
   *     }
   *   },
   *   note: 'Claim signature'
   * };
   *
   * const result = await service.broadcastTransaction(payload);
   *
   * if (result) {
   *   console.log('Signature:', result.signature.fullSig);
   *   console.log('Public key:', result.publicKey);
   *   console.log('Algorithm:', result.algorithm);
   * }
   * ```
   *
   * @remarks
   * This method is used internally by signMessage() but can also be called directly
   * for custom transaction payloads. The transaction status polling is handled by
   * the getTxStatus utility function, which waits for the transaction to complete.
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
   * Signs a message using Fireblocks for blockchain claim operations.
   *
   * This method generates a cryptographic signature for a claim message by creating
   * a Fireblocks transaction with the appropriate message content and transaction note.
   * It handles different message types (claims, scavenger hunt registration, donations)
   * and formats the transaction note accordingly for audit and tracking purposes.
   *
   * The default message format for claims is:
   * `STAR {amount} to {destinationAddress} {termsAndConditionsHash}`
   *
   * Custom messages can be provided via the params.message field.
   *
   * @param params - Message signing parameters
   * @param params.chain - The blockchain network (e.g., CARDANO, ETHEREUM)
   * @param params.originVaultAccountId - The vault account ID to sign with
   * @param params.destinationAddress - The destination address for the claim
   * @param params.amount - The amount being claimed (in smallest unit, e.g., lovelace)
   * @param params.vaultName - Optional vault name for descriptive notes
   * @param params.originAddress - Optional origin address for descriptive notes
   * @param params.message - Optional custom message to sign (overrides default format)
   * @param params.noteType - Type of operation: CLAIM, DONATE, or REGISTER
   *
   * @returns A Promise resolving to an object containing:
   * - signature: The SignedMessageSignature object with fullSig, r, s, v
   * - publicKey: The public key used for signing
   * - algorithm: The signature algorithm (e.g., MPC_ECDSA_SECP256K1)
   * - content: The signed message content
   * - message: The original message that was signed
   * Returns null if signing fails
   *
   * @throws {Error} When transaction payload generation fails
   * @throws {Error} When message signing or broadcasting fails
   * @throws {Error} When Fireblocks API returns an error
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * // Sign a claim message
   * const claimSignature = await service.signMessage({
   *   chain: SupportedBlockchains.CARDANO,
   *   originVaultAccountId: '123',
   *   destinationAddress: 'addr1qy9prvx8ufwutkwxx9cmmuuajaqmjqwujqlp9d8pvg6gupczjjrx',
   *   amount: 1000000, // 1 ADA in lovelace
   *   vaultName: 'Corporate Vault',
   *   originAddress: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   noteType: NoteType.CLAIM
   * });
   *
   * console.log('Signature:', claimSignature?.signature.fullSig);
   * console.log('Message:', claimSignature?.message);
   *
   * // Sign a custom message
   * const customSignature = await service.signMessage({
   *   chain: SupportedBlockchains.ETHEREUM,
   *   originVaultAccountId: '456',
   *   destinationAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   amount: 500000,
   *   message: 'Custom claim message',
   *   noteType: NoteType.CLAIM
   * });
   *
   * // Sign scavenger hunt registration
   * const registrationSignature = await service.signMessage({
   *   chain: SupportedBlockchains.CARDANO,
   *   originVaultAccountId: '123',
   *   destinationAddress: 'addr1qx...',
   *   amount: 0,
   *   noteType: NoteType.REGISTER
   * });
   *
   * // Sign scavenger hunt donation
   * const donationSignature = await service.signMessage({
   *   chain: SupportedBlockchains.CARDANO,
   *   originVaultAccountId: '123',
   *   destinationAddress: 'addr1qx...',
   *   amount: 2000000, // 2 ADA
   *   noteType: NoteType.DONATE
   * });
   * ```
   *
   * @remarks
   * The transaction note is automatically formatted based on noteType:
   * - CLAIM: "Claiming X NIGHT for ASSET from ADDRESS in Vault NAME to address DEST"
   * - REGISTER: "Scavenger Hunt Registration for address DEST"
   * - DONATE: "Scavenger Hunt Donation for address DEST"
   *
   * The amount is converted from the smallest unit to a decimal representation
   * (e.g., lovelace to ADA) for display in the transaction note.
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
   * Retrieves a specific vault account address by derivation index.
   *
   * This method fetches all addresses for a vault account/asset combination and
   * returns the address at the specified BIP-44 derivation index. This is useful
   * for managing multiple addresses within a single vault account, where each
   * address is identified by its derivation path index.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param assetId - The asset/blockchain identifier (e.g., ADA, ETH, BTC)
   * @param index - The BIP-44 address derivation index (defaults to 0 for the first address)
   *
   * @returns A Promise resolving to a VaultWalletAddress object containing:
   * - address: The blockchain address string
   * - bip44AddressIndex: The derivation index
   * - type: Address type (permanent/one-time)
   * - customerRefId: Optional customer reference ID
   * - tag: Optional address tag
   * - description: Optional address description
   *
   * @throws {Error} When no addresses exist for the vault account and asset
   * @throws {Error} When no address exists at the specified index
   * @throws {Error} When the Fireblocks API request fails
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * // Get the first (default) address
   * const defaultAddress = await service.getVaultAccountAddress(
   *   '123',
   *   SupportedAssetIds.CARDANO
   * );
   * console.log('Address:', defaultAddress.address);
   * console.log('Index:', defaultAddress.bip44AddressIndex);
   *
   * // Get address at index 5
   * const addressAt5 = await service.getVaultAccountAddress(
   *   '123',
   *   SupportedAssetIds.CARDANO,
   *   5
   * );
   *
   * // Get Ethereum address
   * const ethAddress = await service.getVaultAccountAddress(
   *   '456',
   *   SupportedAssetIds.ETHEREUM,
   *   0
   * );
   *
   * // Handle missing address
   * try {
   *   const address = await service.getVaultAccountAddress(
   *     '789',
   *     SupportedAssetIds.BITCOIN,
   *     10
   *   );
   * } catch (error) {
   *   console.error('Address not found at index 10');
   * }
   * ```
   *
   * @remarks
   * This method internally calls getVaultAccountAddresses() to fetch all addresses
   * and then filters for the specific index. For performance, if you need multiple
   * addresses, consider calling getVaultAccountAddresses() directly to avoid
   * multiple API calls.
   *
   * The BIP-44 derivation path is: m/44'/coin_type'/account'/change/address_index
   * where address_index is the value provided in the index parameter.
   */
  public getVaultAccountAddress = async (
    vaultAccountId: string,
    assetId: SupportedAssetIds,
    index: number = 0
  ): Promise<VaultWalletAddress> => {
    try {
      const addressesResponse = await this.getVaultAccountAddresses(
        vaultAccountId,
        assetId
      );
      if (!addressesResponse || addressesResponse.length === 0) {
        throw new Error(
          `No addresses found for vault account ${vaultAccountId} and asset ${assetId}`
        );
      }

      const filteredAddresses = addressesResponse.filter(
        (addr) => addr.bip44AddressIndex === index
      );
      if (filteredAddresses.length === 0) {
        throw new Error(
          `No address found for vault account ${vaultAccountId}, asset ${assetId}, and index ${index}`
        );
      }

      return filteredAddresses[0];
    } catch (error: any) {
      throw new Error(
        `Failed to get address for vault account ${vaultAccountId}: ${error.message}`
      );
    }
  };

  /**
   * Retrieves all addresses associated with a vault account for a specific asset.
   *
   * This method fetches the complete list of addresses that have been generated for
   * a vault account/asset combination. Each address includes metadata such as its
   * derivation index, type, and optional tags or descriptions.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param assetId - The asset/blockchain identifier (e.g., ADA, ETH, BTC)
   *
   * @returns A Promise resolving to an array of VaultWalletAddress objects, each containing:
   * - address: The blockchain address string
   * - bip44AddressIndex: The BIP-44 derivation index
   * - type: Address type (PERMANENT or ONE_TIME)
   * - customerRefId: Optional customer reference ID
   * - tag: Optional address tag (e.g., for XRP destination tags)
   * - description: Optional human-readable description
   *
   * @throws {Error} When no addresses are found for the vault account and asset
   * @throws {Error} When the Fireblocks API request fails
   * @throws {Error} When the API response is missing the addresses field
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * // Get all Cardano addresses
   * const addresses = await service.getVaultAccountAddresses(
   *   '123',
   *   SupportedAssetIds.CARDANO
   * );
   *
   * console.log(`Found ${addresses.length} addresses`);
   * addresses.forEach(addr => {
   *   console.log(`Index ${addr.bip44AddressIndex}: ${addr.address}`);
   * });
   *
   * // Get Ethereum addresses
   * const ethAddresses = await service.getVaultAccountAddresses(
   *   '456',
   *   SupportedAssetIds.ETHEREUM
   * );
   *
   * // Find specific address by index
   * const addressAt5 = ethAddresses.find(addr => addr.bip44AddressIndex === 5);
   *
   * // Filter permanent addresses
   * const permanentAddresses = addresses.filter(
   *   addr => addr.type === 'PERMANENT'
   * );
   *
   * // Get addresses with custom tags
   * const taggedAddresses = addresses.filter(addr => addr.tag);
   * ```
   *
   * @remarks
   * This method uses the paginated endpoint but currently doesn't implement pagination
   * logic. If you have a large number of addresses, you may need to extend this method
   * to handle pagination through multiple API calls.
   *
   * The addresses are returned in the order provided by Fireblocks, which is typically
   * sorted by creation time or derivation index.
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
   * Retrieves the public key for a specific vault account asset address.
   *
   * This method fetches the public key corresponding to a specific address within
   * a vault account. The address is identified by its BIP-44 derivation path
   * components (change and addressIndex). Public keys are essential for various
   * cryptographic operations including signature verification and address generation.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param assetId - The asset/blockchain identifier (e.g., ADA, ETH, BTC)
   * @param change - The BIP-44 change index (0 for external addresses, 1 for internal/change addresses)
   * @param addressIndex - The BIP-44 address index within the change path
   *
   * @returns A Promise resolving to the hex-encoded public key string
   *
   * @throws {Error} When no public key is found for the specified parameters
   * @throws {Error} When the Fireblocks API request fails
   * @throws {Error} When the vault account or asset doesn't exist
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * // Get public key for the first external address (m/44'/1815'/0'/0/0 for Cardano)
   * const publicKey = await service.getAssetPublicKey(
   *   '123',
   *   SupportedAssetIds.CARDANO,
   *   0,  // external chain
   *   0   // first address
   * );
   * console.log('Public key:', publicKey);
   *
   * // Get public key for a change address (m/44'/1815'/0'/1/5)
   * const changePublicKey = await service.getAssetPublicKey(
   *   '123',
   *   SupportedAssetIds.CARDANO,
   *   1,  // internal/change chain
   *   5   // sixth change address
   * );
   *
   * // Get Ethereum public key
   * const ethPublicKey = await service.getAssetPublicKey(
   *   '456',
   *   SupportedAssetIds.ETHEREUM,
   *   0,
   *   0
   * );
   *
   * // Use public key for signature verification
   * const signature = await service.signMessage({...});
   * const publicKey = await service.getAssetPublicKey(
   *   '123',
   *   SupportedAssetIds.CARDANO
   * );
   * // Verify signature with public key...
   * ```
   *
   * @remarks
   * The derivation path follows BIP-44 standard:
   * m/44'/coin_type'/account'/change/address_index
   *
   * For most use cases:
   * - change = 0: External addresses (for receiving)
   * - change = 1: Internal addresses (for change)
   * - addressIndex = 0: First address at that change level
   *
   * The returned public key is in hex format and can be used for:
   * - Signature verification
   * - Address derivation
   * - COSE_Sign1 public key field (Cardano)
   * - Other cryptographic operations
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
