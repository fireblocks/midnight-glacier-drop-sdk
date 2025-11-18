import {
  Fireblocks,
  FireblocksResponse,
  TransactionOperation,
  TransactionRequest,
  TransactionResponse,
  TransactionStateEnum,
  TransferPeerPathType,
} from "@fireblocks/ts-sdk";
import { SupportedAssetIds, SupportedBlockchains } from "../types/index.js";
import { convertStringToHex } from "xrpl";
import { encode } from "ripple-binary-codec";
import { hashTx } from "xrpl/dist/npm/utils/hashes/index.js";
import { getAssetIdsByBlockchain } from "../index.js";
import { Logger, LogLevel } from "./logger.js";

const logLevel = "INFO";
Logger.setLogLevel(
  LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO
);
const logger = new Logger("utils:fireblocks");

/**
 * Generates a blockchain-specific transaction payload for message signing via Fireblocks.
 *
 * This function constructs the appropriate transaction request format based on the target blockchain.
 * Each blockchain has specific requirements for message signing (COSE_Sign1 for Cardano, EIP-191 for EVM chains, etc.).
 *
 * @param payload - The message or data to be signed as a UTF-8 string
 * @param chain - The target blockchain network (Cardano, Ethereum, Bitcoin, etc.)
 * @param originVaultAccountId - The Fireblocks vault account ID that will sign the message
 * @param fireblocks - Initialized Fireblocks SDK instance
 * @param note - Optional transaction note/description for Fireblocks UI
 * @param noteType - Optional categorization of the signing operation ("claim", "donate", "register")
 *
 * @returns Promise resolving to a Fireblocks TransactionRequest object ready for signing
 *
 * @throws {Error} If the blockchain is not supported
 * @throws {Error} If required data cannot be fetched (public key, address for XRP)
 * @throws {Error} If COSE_Sign1 construction fails (Cardano)
 *
 * @remarks
 * - **Cardano**: Uses COSE_Sign1 structure with EdDSA algorithm, BIP44 change path varies by note type
 * - **Bitcoin**: Uses BTC_MESSAGE typed message format
 * - **EVM Chains** (Ethereum, BNB, Avalanche, BAT): Uses EIP-191 personal_sign format
 * - **XRP**: Requires fetching public key and address, uses transaction hash for signing
 * - **Solana**: Raw message signing with hex-encoded payload
 *
 * @example
 * ```typescript
 * const payload = "STAR 1000000 to addr1... <hash>";
 * const request = await generateTransactionPayload(
 *   payload,
 *   SupportedBlockchains.CARDANO,
 *   "123",
 *   fireblocksInstance,
 *   "Claiming NIGHT tokens",
 *   "claim"
 * );
 * ```
 */
export const generateTransactionPayload = async (
  payload: string,
  chain: SupportedBlockchains,
  originVaultAccountId: string,
  fireblocks: Fireblocks,
  note?: string,
  noteType?: "claim" | "donate" | "register"
): Promise<TransactionRequest> => {
  try {
    const assetId = getAssetIdsByBlockchain(chain);
    if (!assetId) {
      throw new Error("Unsupported blockchain for asset ID retrieval.");
    }

    switch (chain) {
      case SupportedBlockchains.CARDANO:
        const { MSL } = await import("cardano-web3-js");
        const payloadBytes = new TextEncoder().encode(payload);

        // Build COSE_Sign1 structure per CIP-8/30
        const protectedHeaders = MSL.HeaderMap.new();
        protectedHeaders.set_algorithm_id(
          MSL.Label.from_algorithm_id(MSL.AlgorithmId.EdDSA)
        );
        const protectedSerialized =
          MSL.ProtectedHeaderMap.new(protectedHeaders);
        const headers = MSL.Headers.new(
          protectedSerialized,
          MSL.HeaderMap.new()
        );

        const builder = MSL.COSESign1Builder.new(headers, payloadBytes, false);
        const sigStructureBytes = builder.make_data_to_sign().to_bytes();
        const content = Buffer.from(sigStructureBytes).toString("hex");

        // BIP44 change path: 0 for external addresses (donate/register), 2 for internal (claim)
        const bip44change =
          noteType === "donate" || noteType === "register" ? 0 : 2;

        return {
          source: {
            type: TransferPeerPathType.VaultAccount,
            id: String(originVaultAccountId),
          },
          assetId: SupportedAssetIds.ADA,
          operation: TransactionOperation.Raw,
          note: note,
          extraParameters: {
            rawMessageData: {
              messages: [
                {
                  content,
                  bip44change,
                },
              ],
            },
          },
        };

      case SupportedBlockchains.BITCOIN:
        return {
          operation: TransactionOperation.TypedMessage,
          assetId: assetId,
          note: note,
          source: {
            type: TransferPeerPathType.VaultAccount,
            id: originVaultAccountId,
          },
          extraParameters: {
            rawMessageData: {
              messages: [
                {
                  content: payload,
                  type: "BTC_MESSAGE",
                },
              ],
            },
          },
        };

      case SupportedBlockchains.ETHEREUM:
      case SupportedBlockchains.BAT:
      case SupportedBlockchains.BNB:
      case SupportedBlockchains.AVALANCHE:
        // EIP-191 personal_sign format
        const message = Buffer.from(payload).toString("hex");
        return {
          operation: TransactionOperation.TypedMessage,
          assetId: assetId,
          note: note,
          source: {
            type: TransferPeerPathType.VaultAccount,
            id: originVaultAccountId,
          },
          extraParameters: {
            rawMessageData: {
              messages: [
                {
                  content: message,
                  type: "EIP191",
                },
              ],
            },
          },
        };

      case SupportedBlockchains.XRP:
        // Fetch public key and address for XRP transaction construction
        const publicKeyResponse =
          await fireblocks?.vaults.getPublicKeyInfoForAddress({
            vaultAccountId: originVaultAccountId,
            assetId: assetId,
            change: 0,
            addressIndex: 0,
            compressed: true,
          });

        const addressResponse =
          await fireblocks?.vaults.getVaultAccountAssetAddressesPaginated({
            vaultAccountId: originVaultAccountId,
            assetId: assetId,
          });

        const senderAddress = addressResponse?.data?.addresses?.[0].address;

        if (!publicKeyResponse?.data.publicKey) {
          throw new Error(
            `Error fetching public key for vault account ${originVaultAccountId}`
          );
        }

        if (!senderAddress) {
          throw new Error(
            `Error fetching address for vault account ${originVaultAccountId}`
          );
        }

        const txForSigning = {
          SigningPubKey: publicKeyResponse?.data.publicKey,
          Account: senderAddress,
          Memos: [
            {
              Memo: {
                MemoData: convertStringToHex(payload),
              },
            },
          ],
        };

        const binary = encode(txForSigning);
        const xrpContent = hashTx(binary);

        return {
          assetId: "XRP",
          note,
          source: {
            type: TransferPeerPathType.VaultAccount,
            id: originVaultAccountId,
          },
          operation: TransactionOperation.Raw,
          extraParameters: {
            rawMessageData: {
              messages: [{ content: xrpContent }],
            },
            unhashedTransaction: txForSigning,
          },
        };

      case SupportedBlockchains.SOLANA:
        const solHexMessage = Buffer.from(payload, "utf8").toString("hex");
        return {
          operation: TransactionOperation.Raw,
          assetId: assetId,
          note: note,
          source: {
            type: TransferPeerPathType.VaultAccount,
            id: originVaultAccountId,
          },
          extraParameters: {
            rawMessageData: {
              messages: [
                {
                  content: solHexMessage,
                },
              ],
            },
          },
        };

      default:
        throw new Error(`Blockchain ${chain} is not supported.`);
    }
  } catch (error: any) {
    throw new Error(
      `Error in generateTransactionPayload: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
};

/**
 * Polls a Fireblocks transaction until it reaches a terminal state.
 *
 * Continuously monitors transaction status and waits for completion or broadcasting state.
 * Logs status changes and throws errors for failure states (blocked, cancelled, failed, rejected).
 *
 * @param txId - The Fireblocks transaction ID to monitor
 * @param fireblocks - Initialized Fireblocks SDK instance for API calls
 * @param pollingInterval - Optional interval between status checks in milliseconds (default: 1000ms)
 *
 * @returns Promise resolving to the final TransactionResponse when completed or broadcasting
 *
 * @throws {Error} If transaction is blocked - policy or compliance issue
 * @throws {Error} If transaction is cancelled - user or system cancellation
 * @throws {Error} If transaction fails - signature failure or network error
 * @throws {Error} If transaction is rejected - approval policy rejection
 *
 * @remarks
 * **Terminal Success States:**
 * - `COMPLETED` - Transaction fully processed and confirmed
 * - `BROADCASTING` - Transaction submitted to blockchain network
 *
 * **Terminal Failure States:**
 * - `BLOCKED` - Blocked by policy or compliance
 * - `CANCELLED` - Manually cancelled
 * - `FAILED` - Technical failure during processing
 * - `REJECTED` - Rejected by approval policy
 *
 * **Transient States** (will continue polling):
 * - `SUBMITTED` - Submitted for processing
 * - `QUEUED` - Waiting in queue
 * - `PENDING_SIGNATURE` - Awaiting signature
 * - `PENDING_AUTHORIZATION` - Awaiting approval
 * - `PENDING_3RD_PARTY_MANUAL_APPROVAL` - Waiting for external approval
 * - `PENDING_3RD_PARTY` - Processing with third party
 *
 * @example
 * ```typescript
 * const txResponse = await fireblocks.transactions.createTransaction({...});
 * const completedTx = await getTxStatus(txResponse.data.id, fireblocks, 2000);
 * const signature = completedTx.signedMessages?.[0]?.signature;
 * ```
 */
export const getTxStatus = async (
  txId: string,
  fireblocks: Fireblocks,
  pollingInterval: number = 1000
): Promise<TransactionResponse> => {
  try {
    let txResponse: FireblocksResponse<TransactionResponse> =
      await fireblocks.transactions.getTransaction({ txId });
    let lastStatus = txResponse.data.status;

    logger.info(
      `Transaction ${txResponse.data.id} is currently at status - ${txResponse.data.status}`
    );

    // Poll until terminal state
    while (
      txResponse.data.status !== TransactionStateEnum.Completed &&
      txResponse.data.status !== TransactionStateEnum.Broadcasting
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));

      txResponse = await fireblocks.transactions.getTransaction({
        txId: txId,
      });

      if (txResponse.data.status !== lastStatus) {
        logger.info(
          `Transaction ${txResponse.data.id} status changed: ${lastStatus} → ${txResponse.data.status}`
        );
        lastStatus = txResponse.data.status;
      }

      switch (txResponse.data.status) {
        case TransactionStateEnum.Blocked:
        case TransactionStateEnum.Cancelled:
        case TransactionStateEnum.Failed:
        case TransactionStateEnum.Rejected:
          throw new Error(
            `Transaction ${txResponse.data.id} failed with status: ${txResponse.data.status}\nSub-Status: ${txResponse.data.subStatus}`
          );
        default:
          break;
      }
    }

    logger.info(
      `Transaction ${txResponse.data.id} reached terminal state: ${txResponse.data.status}`
    );

    return txResponse.data;
  } catch (error) {
    logger.error(
      `Error polling transaction ${txId}:`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
};
