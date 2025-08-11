import {
  Fireblocks,
  FireblocksResponse,
  SignedMessageAlgorithmEnum,
  TransactionOperation,
  TransactionRequest,
  TransactionResponse,
  TransactionStateEnum,
  TransferPeerPathType,
} from "@fireblocks/ts-sdk";
import { SupportedAssetIds, SupportedBlockchains } from "../types.js";

/**
 * Generates a transaction payload for signing messages on various blockchains.
 *
 * Depending on the specified blockchain, this function prepares the payload in the required format
 * and returns a `TransactionRequest` object suitable for Fireblocks SDK operations.
 *
 * @param {string} payload - The message or data to be signed, as a string.
 * @param {SupportedBlockchains} chain - The blockchain for which the transaction payload is being generated.
 * @param {SupportedAssetIds} assetId - The asset identifier relevant to the transaction.
 * @param {string} originVaultAccountId - The originating vault account ID as a string.
 * @returns {Promise<TransactionRequest>} A promise that resolves to a `TransactionRequest` object containing the formatted payload.
 * @throws Will throw an error if the blockchain is not supported or if any internal error occurs.
 */
export const generateTransactionPayload = async (
  payload: string,
  chain: SupportedBlockchains,
  assetId: SupportedAssetIds,
  originVaultAccountId: string
): Promise<TransactionRequest> => {
  try {
    switch (chain) {
      case SupportedBlockchains.CARDANO:
        const { MSL } = await import("cardano-web3-js");
        const payloadBytes = new TextEncoder().encode(payload);

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
        return {
          source: {
            type: TransferPeerPathType.VaultAccount,
            id: String(originVaultAccountId),
          },
          assetId: "ADA",
          operation: TransactionOperation.Raw,
          extraParameters: {
            rawMessageData: {
              messages: [
                {
                  content,
                  bip44change: 2,
                },
              ],
            },
          },
        };

      case SupportedBlockchains.BITCOIN:
        return {
          operation: TransactionOperation.TypedMessage,
          assetId: assetId,
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
        const message = Buffer.from(payload).toString("hex");
        return {
          operation: TransactionOperation.TypedMessage,
          assetId: assetId,
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

      case SupportedBlockchains.SOLANA:
        const solHexMessage = Buffer.from(payload, "utf8").toString("hex");
        return {
          operation: TransactionOperation.Raw,
          assetId: assetId,
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

      case SupportedBlockchains.XRP:
        return {};

      default:
        throw new Error("block chain is not supported.");
    }
  } catch (error: any) {
    throw new Error(`${error.message}`);
  }
};

/**
 * Polls the status of a Fireblocks transaction until it is completed or reaches a terminal state.
 * Logs status changes to the console during polling.
 * Throws an error if the transaction is blocked, cancelled, failed, or rejected.
 *
 * @param {string} txId - The transaction ID to monitor.
 * @param {Fireblocks} fireblocks - The Fireblocks SDK instance for fetching transaction details.
 * @param {number} [pollingInterval] - Optional polling interval in milliseconds.
 * @returns {Promise<TransactionResponse>} Resolves with the transaction response when completed or broadcasting.
 * @throws {Error} If the transaction reaches a terminal failure state.
 */
export const getTxStatus = async (
  txId: string,
  fireblocks: Fireblocks,
  pollingInterval?: number
): Promise<TransactionResponse> => {
  try {
    let txResponse: FireblocksResponse<TransactionResponse> =
      await fireblocks.transactions.getTransaction({ txId });
    let lastStatus = txResponse.data.status;
    console.log(
      `Transaction ${txResponse.data.id} is currently at status - ${txResponse.data.status}`
    );

    while (
      txResponse.data.status !== TransactionStateEnum.Completed &&
      txResponse.data.status !== TransactionStateEnum.Broadcasting
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
      txResponse = await fireblocks.transactions.getTransaction({
        txId: txId,
      });

      if (txResponse.data.status !== lastStatus) {
        console.log(
          `Transaction ${txResponse.data.id} is currently at status - ${txResponse.data.status}`
        );
        lastStatus = txResponse.data.status;
      }

      switch (txResponse.data.status) {
        case TransactionStateEnum.Blocked:
        case TransactionStateEnum.Cancelled:
        case TransactionStateEnum.Failed:
        case TransactionStateEnum.Rejected:
          throw new Error(
            `Signing request failed/blocked/cancelled: Transaction: ${txResponse.data.id} status is ${txResponse.data.status}\nSub-Status: ${txResponse.data.subStatus}`
          );
        default:
          break;
      }
    }
    return txResponse.data;
  } catch (error) {
    throw error;
  }
};
