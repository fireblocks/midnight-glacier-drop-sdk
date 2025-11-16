import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import * as lucid from "lucid-cardano";
import { nightTokenName } from "../constants.js";
import { Utxo } from "../types.js";
import { Logger, LogLevel } from "./logger.js";

const logLevel = "INFO";
Logger.setLogLevel(
  LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO
);
const logger = new Logger("utils:cardano");

/**
 * Fetches UTXOs for a given Cardano address using Blockfrost, and selects enough UTXOs to satisfy
 * the required token amount and ADA for transaction fees, recipient, and change.
 *
 * The function first selects UTXOs containing the specified token policy, accumulating until the required
 * token amount and minimum ADA for recipient and fee are met. If additional ADA is needed, it selects more UTXOs
 * containing ADA only.
 *
 * @param {string} address - The Cardano address to fetch UTXOs from.
 * @param {string} blockfrostProjectId - The Blockfrost API project ID.
 * @param {string} tokenPolicyId - The policy ID of the token to accumulate.
 * @param {number} requiredTokenAmount - The minimum amount of the token required.
 * @param {number} transactionFee - The estimated transaction fee in Lovelace.
 * @param {number} [minRecipientLovelace=1_200_000] - The minimum Lovelace required for the recipient output.
 * @param {number} [minChangeLovelace=1_200_000] - The minimum Lovelace required for the change output.
 * @returns {Promise<{ blockfrost: BlockFrostAPI; selectedUtxos: Utxo[]; accumulatedAda: number; accumulatedTokenAmount: number }>}
 * An object containing the BlockFrostAPI instance, selected UTXOs, accumulated ADA, and accumulated token amount.
 * @throws {Error} If there is an issue fetching or selecting UTXOs.
 */
export const fetchAndSelectUtxos = async (
  address: string,
  blockfrostProjectId: string,
  tokenPolicyId: string,
  requiredTokenAmount: number,
  transactionFee: number,
  minRecipientLovelace: number = 1_200_000,
  minChangeLovelace: number = 1_200_000
): Promise<{
  blockfrost: BlockFrostAPI;
  selectedUtxos: Utxo[];
  accumulatedAda: number;
  accumulatedTokenAmount: number;
}> => {
  try {
    const blockfrost = new BlockFrostAPI({
      projectId: blockfrostProjectId,
    });
    const utxos = await fetchUtxos(blockfrost, address);

    const tokenUtxosWithAmounts = filterUtxos(utxos, tokenPolicyId)
      .map((utxo) => ({
        utxo,
        tokenAmount: calculateTokenAmount(utxo, tokenPolicyId, nightTokenName),
        adaAmount: getLovelaceAmount(utxo),
      }))
      .sort((a, b) => b.tokenAmount - a.tokenAmount);
    let selectedUtxos: Utxo[] = [];
    let accumulatedTokenAmount = 0;
    let accumulatedAda = 0;

    // Accumulate token UTXOs
    for (const { utxo, tokenAmount, adaAmount } of tokenUtxosWithAmounts) {
      selectedUtxos.push(utxo);
      accumulatedTokenAmount += tokenAmount;
      accumulatedAda += adaAmount;

      if (
        accumulatedTokenAmount >= requiredTokenAmount &&
        accumulatedAda >= minRecipientLovelace + transactionFee
      ) {
        break;
      }
    }
    const adaTarget = minRecipientLovelace + transactionFee + minChangeLovelace;
    if (accumulatedAda < adaTarget) {
      const remainingUtxos = utxos.filter((u) => !selectedUtxos.includes(u));
      const adaUtxos = remainingUtxos
        .map((utxo) => ({
          utxo,
          adaAmount: getLovelaceAmount(utxo),
        }))
        .sort((a, b) => b.adaAmount - a.adaAmount);

      for (const { utxo, adaAmount } of adaUtxos) {
        selectedUtxos.push(utxo);
        accumulatedAda += adaAmount;
        if (accumulatedAda >= adaTarget) break;
      }
    }

    return {
      blockfrost,
      selectedUtxos,
      accumulatedAda,
      accumulatedTokenAmount,
    };
  } catch (error) {
    throw new Error(
      `Error fetching and selecting UTXOs: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
};

/**
 * Fetches the list of UTXOs (Unspent Transaction Outputs) for a given Cardano address
 * using the BlockFrost API context.
 *
 * @param {BlockFrostAPI} blockfrostContext - An instance of BlockFrostAPI to interact with the BlockFrost service.
 * @param {string} address - The Cardano address for which to fetch UTXOs.
 * @returns {Promise<Utxo[]>} A promise that resolves to an array of Utxo objects.
 * @throws Throws an error if the BlockFrost service call fails.
 */
export const fetchUtxos = async (
  blockfrostContext: BlockFrostAPI,
  address: string
): Promise<Utxo[]> => {
  try {
    return await blockfrostContext.addressesUtxos(address);
  } catch (error: any) {
    throw new Error(`fb service error: ${error.message}`);
  }
};

/**
 * Calculates the amount of a specific token (including ADA) in a given UTXO.
 *
 * @param utxo - The UTXO object containing token amounts.
 * @param policyId - The policy ID of the token. For ADA, this should be an empty string.
 * @param tokenName - The name of the token. Use "ADA" for the native currency.
 * @returns The quantity of the specified token in the UTXO as a number.
 */
export const calculateTokenAmount = (
  utxo: Utxo,
  policyId: string,
  tokenName: string
): number => {
  if (tokenName === "ADA" && policyId === "") {
    const ada = utxo.amount.find((a) => a.unit === "lovelace");
    return ada ? parseInt(ada.quantity, 10) : 0;
  }

  const assetUnit = policyId + Buffer.from(tokenName, "utf8").toString("hex");
  const token = utxo.amount.find((a) => a.unit === assetUnit);
  return token ? parseInt(token.quantity, 10) : 0;
};

/**
 * Retrieves the amount of lovelace from a given UTXO object.
 *
 * @param {Utxo} utxo - The UTXO object containing an array of amounts.
 * @returns {number} The quantity of lovelace as a number, or 0 if not found.
 */
export const getLovelaceAmount = (utxo: Utxo): number => {
  const ada = utxo.amount.find((a) => a.unit === "lovelace");
  return ada ? parseInt(ada.quantity, 10) : 0;
};

/**
 * Filters an array of UTXOs to include only those containing a specific token by policy ID and token name.
 *
 * @param {Utxo[]} utxos - The array of UTXOs to filter.
 * @param {string} tokenPolicyId - The policy ID of the token to filter by.
 * @returns {Utxo[]} An array of UTXOs containing the specified token.
 * @throws {Error} If no UTXOs are found containing the specified token, or if an unexpected error occurs during filtering.
 */
export const filterUtxos = (utxos: Utxo[], tokenPolicyId: string): Utxo[] => {
  try {
    const filtered = utxos.filter(
      (utxo) => calculateTokenAmount(utxo, tokenPolicyId, nightTokenName) > 0
    );

    if (filtered.length === 0) {
      throw new Error(
        `No UTXOs found containing token '${nightTokenName}' with policy ID '${tokenPolicyId}'.`
      );
    }

    return filtered;
  } catch (err: any) {
    throw new Error(
      `An unexpected error occurred while filtering UTXOs. ${err.message}`
    );
  }
};

/**
 * Converts an array of UTXOs into the format required by Lucid for transaction inputs.
 *
 * Each UTXO is mapped to a Lucid UTxO object, transforming the asset amounts into a record of asset unit to quantity.
 *
 * @param {Utxo[]} selectedUtxos - Array of UTXO objects to be converted.
 * @returns {lucid.UTxO[]} Array of Lucid UTxO objects formatted for transaction inputs.
 */
export const createTransactionInputs = (
  selectedUtxos: Utxo[]
): lucid.UTxO[] => {
  return selectedUtxos.map((utxo) => {
    const assets: Record<string, bigint> = {};

    for (const amount of utxo.amount) {
      assets[amount.unit] = BigInt(amount.quantity);
    }

    return {
      txHash: utxo.tx_hash,
      outputIndex: utxo.output_index,
      assets,
      address: utxo.address,
      datumHash: null,
      scriptRef: null,
    };
  });
};

/**
 * Creates transaction outputs for transferring ADA and a specific token on Cardano.
 *
 * This function calculates the required outputs for a transaction, including the recipient's output
 * with the specified amount of ADA and tokens, and the sender's change output with the remaining ADA and tokens.
 * Throws an error if the selected UTXOs do not contain enough tokens for the transfer.
 *
 * @param {number} requiredLovelace - The amount of ADA (in lovelace) required for the recipient.
 * @param {number} fee - The transaction fee (in lovelace).
 * @param {lucid.Address} recipientAddress - The Cardano address of the recipient.
 * @param {lucid.Address} senderAddress - The Cardano address of the sender (for change output).
 * @param {string} tokenPolicyId - The policy ID of the token to transfer.
 * @param {string} tokenName - The name of the token to transfer.
 * @param {number} transferAmount - The amount of the token to transfer.
 * @param {Utxo[]} selectedUtxos - The list of selected UTXOs to use for the transaction.
 * @returns {Array<{ address: lucid.Address; assets: lucid.Assets }>} An array of output objects, each containing an address and its corresponding assets.
 * @throws {Error} If there are insufficient tokens in the selected UTXOs.
 */
export const createTransactionOutputs = (
  requiredLovelace: number,
  fee: number,
  recipientAddress: lucid.Address,
  senderAddress: lucid.Address,
  tokenPolicyId: string,
  tokenName: string,
  transferAmount: number,
  selectedUtxos: Utxo[]
): {
  address: lucid.Address;
  assets: lucid.Assets;
}[] => {
  const tokenNameHex = lucid.toHex(Buffer.from(tokenName, "utf8"));
  const tokenUnit = `${tokenPolicyId}${tokenNameHex}`;

  let totalLovelace = 0n;
  let totalTokenAmount = 0n;

  // Sum ADA + tokens
  selectedUtxos.forEach((utxo) => {
    utxo.amount.forEach((asset) => {
      const quantity = BigInt(asset.quantity);
      if (asset.unit === "lovelace") {
        totalLovelace += quantity;
      } else if (asset.unit === tokenUnit) {
        totalTokenAmount += quantity;
      }
    });
  });

  if (totalTokenAmount < BigInt(transferAmount)) {
    throw new Error(
      `Insufficient tokens: have ${totalTokenAmount}, need ${transferAmount}`
    );
  }

  const changeLovelace = totalLovelace - BigInt(requiredLovelace) - BigInt(fee);
  const changeTokenAmount = totalTokenAmount - BigInt(transferAmount);

  const outputs = [];

  const recipientAssets: lucid.Assets = {
    lovelace: BigInt(requiredLovelace),
    [tokenUnit]: BigInt(transferAmount),
  };
  outputs.push({
    address: recipientAddress,
    assets: recipientAssets,
  });

  const changeAssets: lucid.Assets = {
    lovelace: changeLovelace,
  };
  if (changeTokenAmount > 0n) {
    changeAssets[tokenUnit] = changeTokenAmount;
  }
  outputs.push({
    address: senderAddress,
    assets: changeAssets,
  });

  return outputs;
};

/**
 * Builds a Cardano transaction using the provided inputs, outputs, fee, and TTL.
 *
 * @param {Object} params - The parameters for building the transaction.
 * @param {lucid.Lucid} params.lucid - The Lucid instance used to construct the transaction.
 * @param {lucid.UTxO[]} params.txInputs - Array of UTxO objects to be used as transaction inputs.
 * @param {Array<{ address: string; assets: Record<string, bigint> }>} params.txOutputs - Array of output objects, each containing an address and a record of assets to send.
 * @param {bigint} params.fee - The transaction fee as a bigint.
 * @param {number} params.ttl - The time-to-live (TTL) for the transaction, specified as a number.
 * @returns {Promise<lucid.TxComplete>} A promise that resolves to a completed Lucid transaction.
 */
export const buildTransaction = async ({
  lucid,
  txInputs,
  txOutputs,
  fee,
  ttl,
}: {
  lucid: lucid.Lucid;
  txInputs: lucid.UTxO[];
  txOutputs: {
    address: string;
    assets: Record<string, bigint>;
  }[];
  fee: bigint;
  ttl: number;
}): Promise<lucid.TxComplete> => {
  let tx = lucid.newTx();

  txInputs.forEach((utxo) => {
    tx = tx.collectFrom([utxo], undefined);
  });

  txOutputs.forEach((output) => {
    tx = tx.payToAddress(output.address, output.assets);
  });

  tx = tx.validTo(ttl);

  const completedTx = await tx.complete();

  return completedTx;
};

/**
 * Calculates the Time-To-Live (TTL) for a Cardano transaction in Unix timestamp (milliseconds).
 *
 * This function fetches the latest block slot from BlockFrost, adds a buffer to determine the TTL slot,
 * and converts the TTL slot to a Unix timestamp using Lucid utilities.
 *
 * @param {BlockFrostAPI} blockfrost - Instance of BlockFrostAPI used to fetch the latest block information.
 * @param {lucid.Lucid} lucid - Instance of Lucid used for slot-to-unix-time conversion.
 * @param {number} [bufferSlots=2600] - Number of slots to add to the current slot for TTL calculation (default: 2600).
 * @returns {Promise<number>} - The TTL as a Unix timestamp in milliseconds.
 * @throws Error if the current slot is undefined or TTL calculation fails.
 */
export const calculateTtl = async (
  blockfrost: BlockFrostAPI,
  lucid: lucid.Lucid,
  bufferSlots: number = 2600
): Promise<number> => {
  try {
    const latestBlock = await blockfrost.blocksLatest();
    const currentSlot = latestBlock.slot;
    if (!currentSlot) throw new Error("Current slot undefined");

    const ttlSlot = currentSlot + bufferSlots;

    // Convert slot to unix timestamp (in ms)
    const ttlUnixMs = lucid.utils.slotToUnixTime(ttlSlot);

    logger.info(`Calculated TTL (ms): ${ttlUnixMs} (slot: ${ttlSlot})`);

    return ttlUnixMs;
  } catch (error) {
    logger.error(`Failed to calculate TTL: ${error}`);
    throw new Error(
      `Unable to calculate TTL. ${
        error instanceof Error ? error.message : error
      }`
    );
  }
};

/**
 * Submits a signed Cardano transaction to the blockchain using the BlockFrost API.
 *
 * @param {BlockFrostAPI} blockfrostApi - An instance of the BlockFrost API client.
 * @param {lucid.TxSigned} signedTx - The signed transaction to be submitted.
 * @returns {Promise<string>} A promise that resolves to the transaction hash (ID) upon successful submission.
 * @throws {Error} Throws an error if the transaction submission fails.
 */
export const submitTransaction = async (
  blockfrostApi: BlockFrostAPI,
  signedTx: lucid.TxSigned
): Promise<string> => {
  try {
    const txCbor = signedTx.toString();

    const txHash = await blockfrostApi.txSubmit(txCbor);

    logger.info(
      `Transaction successfully submitted. Transaction ID: ${txHash}`
    );

    return txHash;
  } catch (error: any) {
    throw new Error(
      `Error in submitTransaction: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
};

/**
 * Builds a CIP-30 compliant COSE_Sign1 structure from a Fireblocks signature
 * @param message - The original message that was signed (UTF-8 string)
 * @param fullSig - The full signature from Fireblocks (hex string)
 * @param publicKey - The public key from Fireblocks (hex string)
 * @returns Object containing the COSE_Sign1 hex and public key
 */
export const buildCoseSign1 = async (
  message: string,
  fullSig: string,
): Promise<string> => {
  try {
    const { MSL } = await import("cardano-web3-js");

    // Create protected headers with EdDSA algorithm
    const protectedHeaders = MSL.HeaderMap.new();
    protectedHeaders.set_algorithm_id(
      MSL.Label.from_algorithm_id(MSL.AlgorithmId.EdDSA)
    );

    // Build headers structure
    const protectedSerialized = MSL.ProtectedHeaderMap.new(protectedHeaders);
    const unprotectedHeaders = MSL.HeaderMap.new();
    const headers = MSL.Headers.new(protectedSerialized, unprotectedHeaders);

    // Convert message to bytes
    const messageBytes = new Uint8Array(Buffer.from(message, "utf8"));

    // Build COSE_Sign1 structure
    const builder = MSL.COSESign1Builder.new(headers, messageBytes, false);
    const signatureBytes = new Uint8Array(Buffer.from(fullSig, "hex"));
    const coseSign1 = builder.build(signatureBytes);

    // Convert to hex
    const coseSign1Hex = Buffer.from(coseSign1.to_bytes()).toString("hex");

    return coseSign1Hex;
  } catch (error) {
    throw new Error(
      `Failed to build COSE_Sign1: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
};
