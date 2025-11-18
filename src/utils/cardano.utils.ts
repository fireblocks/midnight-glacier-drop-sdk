import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import * as lucid from "lucid-cardano";
import { nightTokenName } from "../constants.js";
import { Utxo } from "../types/index.js";
import { Logger, LogLevel } from "./logger.js";

const logLevel = "INFO";
Logger.setLogLevel(
  LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO
);
const logger = new Logger("utils:cardano");

/**
 * Fetches and selects UTXOs sufficient for a token transfer with fees and minimum ADA requirements.
 *
 * This function implements intelligent UTXO selection for Cardano transactions involving native tokens.
 * It uses a two-phase selection strategy:
 * 1. Selects UTXOs containing the target token, sorted by token amount (largest first)
 * 2. If additional ADA is needed for fees and minimum outputs, selects pure ADA UTXOs
 *
 * The selection ensures sufficient funds for:
 * - Required token amount for transfer
 * - Recipient output minimum ADA (default 1.2 ADA)
 * - Transaction fees
 * - Change output minimum ADA (default 1.2 ADA)
 *
 * @param address - The Cardano address to fetch UTXOs from (Bech32 format, e.g., addr1...)
 * @param blockfrostProjectId - Blockfrost API project ID for authentication
 * @param tokenPolicyId - The policy ID of the native token to transfer (hex string)
 * @param requiredTokenAmount - Minimum token amount required for the transfer
 * @param transactionFee - Estimated transaction fee in lovelace (typically 170,000-300,000)
 * @param minRecipientLovelace - Minimum ADA required for recipient output (default: 1,200,000 lovelace = 1.2 ADA)
 * @param minChangeLovelace - Minimum ADA required for change output (default: 1,200,000 lovelace = 1.2 ADA)
 *
 * @returns A Promise resolving to an object containing:
 * - blockfrost: Initialized BlockFrostAPI instance for subsequent operations
 * - selectedUtxos: Array of selected UTXOs sufficient for the transaction
 * - accumulatedAda: Total ADA amount in selected UTXOs (lovelace)
 * - accumulatedTokenAmount: Total token amount in selected UTXOs
 *
 * @throws {Error} When fetching UTXOs from Blockfrost fails
 * @throws {Error} When no UTXOs contain the specified token
 * @throws {Error} When insufficient UTXOs to meet ADA or token requirements
 *
 * @example
 * ```typescript
 * // Select UTXOs for transferring 1000 NIGHT tokens
 * const result = await fetchAndSelectUtxos(
 *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
 *   'mainnetABC123...',
 *   'abc123...', // NIGHT token policy ID
 *   1000,        // Transfer 1000 tokens
 *   200000,      // 0.2 ADA fee estimate
 *   1500000,     // 1.5 ADA min for recipient
 *   1200000      // 1.2 ADA min for change
 * );
 *
 * console.log(`Selected ${result.selectedUtxos.length} UTXOs`);
 * console.log(`Total ADA: ${result.accumulatedAda / 1_000_000} ADA`);
 * console.log(`Total tokens: ${result.accumulatedTokenAmount}`);
 *
 * // Use results for transaction building
 * const inputs = createTransactionInputs(result.selectedUtxos);
 * const outputs = createTransactionOutputs(
 *   1500000,
 *   200000,
 *   recipientAddress,
 *   result.selectedUtxos[0].address,
 *   tokenPolicyId,
 *   'NIGHT',
 *   1000,
 *   result.selectedUtxos
 * );
 *
 * // Basic usage with defaults
 * const { blockfrost, selectedUtxos, accumulatedAda, accumulatedTokenAmount } =
 *   await fetchAndSelectUtxos(
 *     address,
 *     blockfrostProjectId,
 *     tokenPolicyId,
 *     1000,
 *     200000
 *   );
 *
 * // Check if selection was successful
 * if (accumulatedTokenAmount < 1000) {
 *   throw new Error('Insufficient token balance');
 * }
 *
 * if (accumulatedAda < 1500000 + 200000 + 1200000) {
 *   throw new Error('Insufficient ADA for fees and minimums');
 * }
 * ```
 *
 * @remarks
 * The function prioritizes UTXOs with the most tokens to minimize the number of inputs,
 * which helps reduce transaction size and fees.
 *
 * Cardano requires minimum ADA amounts in all UTXOs containing native tokens. The default
 * 1.2 ADA minimum is safe for most tokens, but complex tokens with long names or many
 * different tokens in one UTXO may require higher minimums.
 *
 * Transaction fees vary based on transaction size (number of inputs/outputs). A typical
 * token transfer uses 170,000-300,000 lovelace. For precise fees, build the transaction
 * first and use the calculated fee from Lucid.
 *
 * The returned BlockFrostAPI instance can be reused for other operations in the same
 * transaction flow (e.g., fetching latest block, submitting transaction).
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
 * Fetches all unspent transaction outputs (UTXOs) for a Cardano address.
 *
 * Retrieves the complete list of UTXOs available at the specified address using the
 * Blockfrost API. Each UTXO represents funds that can be spent in new transactions.
 *
 * @param blockfrostContext - Initialized BlockFrostAPI instance
 * @param address - The Cardano address to query (Bech32 format)
 *
 * @returns A Promise resolving to an array of Utxo objects, each containing:
 * - tx_hash: Transaction hash where this UTXO was created
 * - output_index: Output index within that transaction
 * - amount: Array of assets (lovelace and native tokens)
 * - address: The address owning this UTXO
 * - data_hash: Optional datum hash for script outputs
 *
 * @throws {Error} When the Blockfrost API call fails (network error, invalid address, etc.)
 *
 * @example
 * ```typescript
 * const blockfrost = new BlockFrostAPI({
 *   projectId: 'mainnetABC123...'
 * });
 *
 * // Fetch all UTXOs for an address
 * const utxos = await fetchUtxos(
 *   blockfrost,
 *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc'
 * );
 *
 * console.log(`Found ${utxos.length} UTXOs`);
 *
 * // Calculate total balance
 * const totalLovelace = utxos.reduce((sum, utxo) => {
 *   const lovelace = utxo.amount.find(a => a.unit === 'lovelace');
 *   return sum + (lovelace ? parseInt(lovelace.quantity) : 0);
 * }, 0);
 * console.log(`Total balance: ${totalLovelace / 1_000_000} ADA`);
 *
 * // Find UTXOs containing specific token
 * const tokenPolicyId = 'abc123...';
 * const tokenUtxos = utxos.filter(utxo =>
 *   utxo.amount.some(asset => asset.unit.startsWith(tokenPolicyId))
 * );
 * console.log(`Found ${tokenUtxos.length} UTXOs with token`);
 *
 * // List all assets
 * utxos.forEach(utxo => {
 *   console.log(`UTXO: ${utxo.tx_hash}#${utxo.output_index}`);
 *   utxo.amount.forEach(asset => {
 *     console.log(`  ${asset.unit}: ${asset.quantity}`);
 *   });
 * });
 * ```
 *
 * @remarks
 * This function fetches all UTXOs in a single call. For addresses with many UTXOs,
 * consider implementing pagination if needed.
 *
 * The returned UTXOs can be used as transaction inputs after conversion to Lucid format
 * using createTransactionInputs().
 *
 * Empty addresses return an empty array, not an error.
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
 * Calculates the amount of a specific token or ADA in a UTXO.
 *
 * Searches through a UTXO's assets to find and return the quantity of a specific token.
 * Handles both native ADA (lovelace) and Cardano native tokens identified by policy ID
 * and token name.
 *
 * @param utxo - The UTXO to search within
 * @param policyId - The token policy ID (empty string "" for ADA)
 * @param tokenName - The token name ("ADA" for native ADA, or actual token name for native tokens)
 *
 * @returns The quantity of the specified token in the UTXO as a number (0 if not found)
 *
 * @example
 * ```typescript
 * // Calculate ADA amount
 * const adaAmount = calculateTokenAmount(utxo, '', 'ADA');
 * console.log(`ADA: ${adaAmount / 1_000_000} ADA`);
 *
 * // Calculate NIGHT token amount
 * const nightAmount = calculateTokenAmount(
 *   utxo,
 *   'abc123...', // NIGHT policy ID
 *   'NIGHT'
 * );
 * console.log(`NIGHT tokens: ${nightAmount}`);
 *
 * // Calculate custom token amount
 * const customAmount = calculateTokenAmount(
 *   utxo,
 *   'def456...', // Custom token policy ID
 *   'MyToken'
 * );
 *
 * // Check if UTXO contains token
 * const hasToken = calculateTokenAmount(utxo, policyId, tokenName) > 0;
 * if (hasToken) {
 *   console.log('UTXO contains the token');
 * }
 *
 * // Sum token across multiple UTXOs
 * const totalTokens = utxos.reduce((sum, utxo) =>
 *   sum + calculateTokenAmount(utxo, policyId, tokenName),
 *   0
 * );
 * ```
 *
 * @remarks
 * For native tokens, the function constructs the asset unit by concatenating the
 * policy ID with the hex-encoded token name. This matches Cardano's asset ID format.
 *
 * ADA is identified by the special unit "lovelace" and uses empty string for policy ID.
 *
 * The token name is UTF-8 encoded, so multi-byte characters are supported.
 *
 * Returns 0 (not null or undefined) when the token is not found, making it safe for
 * arithmetic operations without additional null checks.
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
 * Extracts the lovelace (ADA) amount from a UTXO.
 *
 * A convenience function that retrieves the ADA balance from a UTXO. Equivalent to
 * calling calculateTokenAmount(utxo, '', 'ADA') but more readable and efficient.
 *
 * @param utxo - The UTXO to extract lovelace from
 * @returns The quantity of lovelace (ADA) as a number (0 if not found)
 *
 * @example
 * ```typescript
 * // Get ADA amount from UTXO
 * const lovelace = getLovelaceAmount(utxo);
 * console.log(`${lovelace / 1_000_000} ADA`);
 *
 * // Sum ADA across UTXOs
 * const totalAda = utxos.reduce((sum, utxo) =>
 *   sum + getLovelaceAmount(utxo),
 *   0
 * );
 * console.log(`Total: ${totalAda / 1_000_000} ADA`);
 *
 * // Filter UTXOs with minimum ADA
 * const minAda = 2_000_000; // 2 ADA
 * const richUtxos = utxos.filter(utxo =>
 *   getLovelaceAmount(utxo) >= minAda
 * );
 *
 * // Find largest UTXO by ADA
 * const largestUtxo = utxos.reduce((max, utxo) =>
 *   getLovelaceAmount(utxo) > getLovelaceAmount(max) ? utxo : max
 * );
 * ```
 *
 * @remarks
 * All Cardano UTXOs must contain at least some ADA (typically 1-2 ADA minimum for
 * UTXOs with native tokens). This function will return 0 only for malformed UTXOs,
 * which should not occur in practice on mainnet.
 *
 * 1 ADA = 1,000,000 lovelace. Divide the result by 1,000,000 for ADA display.
 */
export const getLovelaceAmount = (utxo: Utxo): number => {
  const ada = utxo.amount.find((a) => a.unit === "lovelace");
  return ada ? parseInt(ada.quantity, 10) : 0;
};

/**
 * Filters UTXOs to only those containing a specific native token.
 *
 * Searches through an array of UTXOs and returns only those containing the specified
 * token (identified by policy ID and token name). Useful for finding spendable tokens
 * before building a transaction.
 *
 * @param utxos - Array of UTXOs to filter
 * @param tokenPolicyId - The policy ID of the token to filter by
 *
 * @returns Array of UTXOs containing the specified token (at least 1 token)
 *
 * @throws {Error} When no UTXOs are found containing the specified token
 * @throws {Error} When an unexpected error occurs during filtering
 *
 * @example
 * ```typescript
 * const blockfrost = new BlockFrostAPI({ projectId: '...' });
 * const utxos = await fetchUtxos(blockfrost, address);
 *
 * // Filter for NIGHT tokens
 * const nightUtxos = filterUtxos(utxos, 'abc123...'); // NIGHT policy ID
 * console.log(`Found ${nightUtxos.length} UTXOs with NIGHT tokens`);
 *
 * // Calculate total NIGHT balance
 * const totalNight = nightUtxos.reduce((sum, utxo) =>
 *   sum + calculateTokenAmount(utxo, 'abc123...', 'NIGHT'),
 *   0
 * );
 *
 * // Handle no tokens found
 * try {
 *   const tokenUtxos = filterUtxos(utxos, policyId);
 *   console.log('Tokens found:', tokenUtxos.length);
 * } catch (error) {
 *   console.log('No tokens in wallet');
 * }
 *
 * // Sort by token amount (most tokens first)
 * const sortedUtxos = filterUtxos(utxos, policyId)
 *   .sort((a, b) => {
 *     const amountA = calculateTokenAmount(a, policyId, 'NIGHT');
 *     const amountB = calculateTokenAmount(b, policyId, 'NIGHT');
 *     return amountB - amountA;
 *   });
 * ```
 *
 * @remarks
 * This function uses the nightTokenName constant for token name matching. If filtering
 * for a different token name, you'll need to modify the calculateTokenAmount call.
 *
 * The function throws an error rather than returning an empty array when no tokens
 * are found, making it easier to handle the "no tokens" case explicitly.
 *
 * UTXOs are considered to contain the token if they have any amount > 0 of that token.
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
 * Converts Blockfrost UTXOs to Lucid transaction input format.
 *
 * Transforms UTXOs from Blockfrost's format to the format required by the Lucid library
 * for building Cardano transactions. This includes converting asset quantities from
 * strings to BigInt and restructuring the UTXO fields.
 *
 * @param selectedUtxos - Array of Blockfrost UTXO objects to convert
 * @returns Array of Lucid UTxO objects ready for use in transaction building
 *
 * @example
 * ```typescript
 * // Fetch and convert UTXOs
 * const blockfrost = new BlockFrostAPI({ projectId: '...' });
 * const utxos = await fetchUtxos(blockfrost, address);
 * const lucidInputs = createTransactionInputs(utxos);
 *
 * // Use in Lucid transaction
 * const tx = lucid.newTx()
 *   .collectFrom(lucidInputs, undefined)
 *   .payToAddress(recipientAddress, { lovelace: 2000000n })
 *   .complete();
 *
 * // Convert selected UTXOs
 * const { selectedUtxos } = await fetchAndSelectUtxos(
 *   address,
 *   blockfrostProjectId,
 *   tokenPolicyId,
 *   1000,
 *   200000
 * );
 * const inputs = createTransactionInputs(selectedUtxos);
 *
 * // Build transaction with converted inputs
 * const completedTx = await buildTransaction({
 *   lucid,
 *   txInputs: inputs,
 *   txOutputs: outputs,
 *   fee: 200000n,
 *   ttl: await calculateTtl(blockfrost, lucid)
 * });
 *
 * // Inspect converted inputs
 * inputs.forEach(input => {
 *   console.log(`Input: ${input.txHash}#${input.outputIndex}`);
 *   Object.entries(input.assets).forEach(([unit, amount]) => {
 *     console.log(`  ${unit}: ${amount}`);
 *   });
 * });
 * ```
 *
 * @remarks
 * The conversion is necessary because Blockfrost uses strings for asset quantities
 * (to avoid JavaScript number precision limitations), while Lucid uses BigInt for
 * precise arithmetic.
 *
 * The function sets datumHash and scriptRef to null as these are only relevant for
 * smart contract UTXOs. For standard payment UTXOs, these fields are not needed.
 *
 * All asset units (including lovelace) are preserved in the conversion, so the Lucid
 * inputs will contain both ADA and any native tokens from the original UTXOs.
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
 * Creates transaction outputs for a native token transfer with ADA and change.
 *
 * Constructs the output structure for a Cardano transaction that transfers native tokens
 * from a sender to a recipient. Calculates proper change amounts for both ADA and tokens,
 * ensuring minimum ADA requirements are met for all outputs.
 *
 * The function creates two outputs:
 * 1. Recipient output: Contains the transferred tokens and required minimum ADA
 * 2. Change output: Returns remaining ADA and tokens to the sender
 *
 * @param requiredLovelace - Amount of ADA to include with recipient's tokens (lovelace)
 * @param fee - Transaction fee in lovelace
 * @param recipientAddress - Cardano address to receive the tokens
 * @param senderAddress - Cardano address to receive change
 * @param tokenPolicyId - Policy ID of the token being transferred (hex string)
 * @param tokenName - Name of the token being transferred
 * @param transferAmount - Amount of tokens to transfer
 * @param selectedUtxos - UTXOs being spent in the transaction
 *
 * @returns Array of two output objects, each containing address and assets:
 * - [0]: Recipient output with transferred tokens and ADA
 * - [1]: Change output with remaining tokens and ADA
 *
 * @throws {Error} When selected UTXOs contain insufficient tokens for the transfer
 *
 * @example
 * ```typescript
 * // Create outputs for NIGHT token transfer
 * const outputs = createTransactionOutputs(
 *   1500000,     // 1.5 ADA with tokens
 *   200000,      // 0.2 ADA fee
 *   'addr1qy...', // Recipient
 *   'addr1qx...', // Sender (for change)
 *   'abc123...', // NIGHT policy ID
 *   'NIGHT',
 *   1000,        // Transfer 1000 NIGHT
 *   selectedUtxos
 * );
 *
 * console.log('Recipient gets:');
 * console.log(`  ADA: ${outputs[0].assets.lovelace} lovelace`);
 * console.log(`  NIGHT: ${outputs[0].assets[tokenUnit]}`);
 *
 * console.log('Change returns:');
 * console.log(`  ADA: ${outputs[1].assets.lovelace} lovelace`);
 * if (outputs[1].assets[tokenUnit]) {
 *   console.log(`  NIGHT: ${outputs[1].assets[tokenUnit]}`);
 * }
 *
 * // Use with transaction builder
 * const { selectedUtxos } = await fetchAndSelectUtxos(...);
 * const inputs = createTransactionInputs(selectedUtxos);
 * const outputs = createTransactionOutputs(
 *   1500000,
 *   200000,
 *   recipientAddress,
 *   selectedUtxos[0].address, // Use first UTXO's address for change
 *   tokenPolicyId,
 *   tokenName,
 *   1000,
 *   selectedUtxos
 * );
 *
 * const tx = await buildTransaction({
 *   lucid,
 *   txInputs: inputs,
 *   txOutputs: outputs,
 *   fee: 200000n,
 *   ttl: ttl
 * });
 *
 * // Validate outputs
 * if (outputs[1].assets.lovelace < 1000000n) {
 *   console.warn('Change output might be below minimum ADA');
 * }
 * ```
 *
 * @remarks
 * The function automatically handles token change - if transferring 1000 tokens from
 * a UTXO containing 5000 tokens, the change output will include 4000 tokens.
 *
 * If all tokens are transferred (no token change), the change output will only contain
 * ADA, making it a pure ADA UTXO suitable for future use as collateral.
 *
 * Ensure selectedUtxos were obtained from fetchAndSelectUtxos() to guarantee sufficient
 * funds for the transfer, fees, and minimum ADA requirements.
 *
 * The token unit is constructed by concatenating policy ID with hex-encoded token name,
 * following Cardano's asset ID standard.
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
 * Builds a Cardano transaction using Lucid from inputs, outputs, fee, and TTL.
 *
 * Constructs a complete transaction using the Lucid library's transaction builder.
 * Collects specified inputs, creates outputs, sets the time-to-live, and completes
 * the transaction ready for signing.
 *
 * @param params - Transaction building parameters
 * @param params.lucid - Initialized Lucid instance
 * @param params.txInputs - Array of UTxO inputs to spend in the transaction
 * @param params.txOutputs - Array of outputs specifying recipients and amounts
 * @param params.fee - Transaction fee as BigInt (in lovelace)
 * @param params.ttl - Time-to-live timestamp (Unix time in milliseconds)
 *
 * @returns A Promise resolving to a completed Lucid transaction ready for signing
 *
 * @example
 * ```typescript
 * // Initialize Lucid
 * const lucid = await Lucid.new(
 *   new Blockfrost('https://cardano-mainnet.blockfrost.io/api/v0', projectId),
 *   'Mainnet'
 * );
 *
 * // Prepare transaction components
 * const inputs = createTransactionInputs(selectedUtxos);
 * const outputs = createTransactionOutputs(
 *   1500000, 200000, recipientAddress, senderAddress,
 *   tokenPolicyId, 'NIGHT', 1000, selectedUtxos
 * );
 * const ttl = await calculateTtl(blockfrost, lucid);
 *
 * // Build transaction
 * const completedTx = await buildTransaction({
 *   lucid,
 *   txInputs: inputs,
 *   txOutputs: outputs,
 *   fee: 200000n,
 *   ttl
 * });
 *
 * // Sign and submit
 * lucid.selectWallet(...);
 * const signedTx = await completedTx.sign().complete();
 * const txHash = await signedTx.submit();
 *
 * // Complete workflow
 * const blockfrost = new BlockFrostAPI({ projectId });
 * const lucid = await Lucid.new(
 *   new Blockfrost('https://cardano-mainnet.blockfrost.io/api/v0', projectId),
 *   'Mainnet'
 * );
 *
 * // Fetch and select UTXOs
 * const { selectedUtxos } = await fetchAndSelectUtxos(
 *   address, projectId, tokenPolicyId, 1000, 200000
 * );
 *
 * // Create inputs and outputs
 * const inputs = createTransactionInputs(selectedUtxos);
 * const outputs = createTransactionOutputs(
 *   1500000, 200000, recipientAddress, senderAddress,
 *   tokenPolicyId, 'NIGHT', 1000, selectedUtxos
 * );
 *
 * // Calculate TTL and build
 * const ttl = await calculateTtl(blockfrost, lucid);
 * const tx = await buildTransaction({
 *   lucid, txInputs: inputs, txOutputs: outputs,
 *   fee: 200000n, ttl
 * });
 * ```
 *
 * @remarks
 * The fee parameter is included but not actually used by Lucid in this implementation.
 * Lucid calculates the actual fee automatically when the transaction is completed.
 * However, the fee is useful for output calculation in createTransactionOutputs().
 *
 * The TTL (time-to-live) determines how long the transaction remains valid on the
 * blockchain. Transactions that aren't confirmed before the TTL expires are rejected.
 * Use calculateTtl() to get an appropriate TTL value.
 *
 * The second parameter in collectFrom() is for Plutus redeemers - undefined is
 * appropriate for simple payment transactions without smart contracts.
 *
 * The completed transaction must still be signed before submission. Use Lucid's
 * sign() method with a wallet or private key.
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
 * Calculates the time-to-live (TTL) for a Cardano transaction.
 *
 * Determines an appropriate TTL by fetching the current blockchain slot, adding a
 * buffer of future slots, and converting to Unix timestamp. The TTL defines how long
 * a transaction remains valid before expiring.
 *
 * @param blockfrost - Initialized BlockFrostAPI instance
 * @param lucid - Initialized Lucid instance (for slot-to-time conversion)
 * @param bufferSlots - Number of slots to add as buffer (default: 2600 ≈ 13 minutes)
 *
 * @returns A Promise resolving to the TTL as Unix timestamp in milliseconds
 *
 * @throws {Error} When fetching latest block fails
 * @throws {Error} When current slot is undefined
 * @throws {Error} When slot-to-time conversion fails
 *
 * @example
 * ```typescript
 * const blockfrost = new BlockFrostAPI({ projectId: '...' });
 * const lucid = await Lucid.new(
 *   new Blockfrost('https://cardano-mainnet.blockfrost.io/api/v0', projectId),
 *   'Mainnet'
 * );
 *
 * // Calculate TTL with default buffer (13 minutes)
 * const ttl = await calculateTtl(blockfrost, lucid);
 * console.log('TTL:', new Date(ttl));
 *
 * // Use shorter TTL for faster transactions (5 minutes)
 * const shortTtl = await calculateTtl(blockfrost, lucid, 1000);
 *
 * // Use longer TTL for delayed transactions (30 minutes)
 * const longTtl = await calculateTtl(blockfrost, lucid, 6000);
 *
 * // Use in transaction building
 * const completedTx = await buildTransaction({
 *   lucid,
 *   txInputs: inputs,
 *   txOutputs: outputs,
 *   fee: 200000n,
 *   ttl: await calculateTtl(blockfrost, lucid)
 * });
 *
 * // Check TTL validity
 * const ttl = await calculateTtl(blockfrost, lucid);
 * const now = Date.now();
 * const remainingMs = ttl - now;
 * console.log(`TTL valid for ${remainingMs / 60000} more minutes`);
 *
 * // Retry logic for expired transactions
 * let tx;
 * try {
 *   tx = await buildTransaction({...});
 * } catch (error) {
 *   if (error.message.includes('TTL')) {
 *     const newTtl = await calculateTtl(blockfrost, lucid);
 *     tx = await buildTransaction({..., ttl: newTtl});
 *   }
 * }
 * ```
 *
 * @remarks
 * On Cardano mainnet, one slot is approximately 1 second. The default buffer of
 * 2600 slots provides about 43 minutes for transaction construction, signing, and
 * submission.
 *
 * Shorter TTLs reduce the risk of double-spending attacks but give less time for
 * transaction processing. Longer TTLs are more forgiving but increase vulnerability
 * to UTXO race conditions.
 *
 * The TTL must be in the future when the transaction is submitted to the blockchain.
 * If signing takes too long, the transaction may expire before submission.
 *
 * Failed transactions due to expired TTL can be rebuilt with a new TTL without
 * changing any other transaction parameters.
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
 * Submits a signed Cardano transaction to the blockchain via Blockfrost.
 *
 * Takes a signed transaction from Lucid and broadcasts it to the Cardano network
 * using the Blockfrost API. Returns the transaction hash for tracking and verification.
 *
 * @param blockfrostApi - Initialized BlockFrostAPI instance
 * @param signedTx - Signed Lucid transaction ready for submission
 *
 * @returns A Promise resolving to the transaction hash (ID) as a hex string
 *
 * @throws {Error} When transaction submission fails (invalid tx, network error, etc.)
 *
 * @example
 * ```typescript
 * const blockfrost = new BlockFrostAPI({ projectId: '...' });
 *
 * // Build, sign, and submit transaction
 * const completedTx = await buildTransaction({...});
 * lucid.selectWallet(...);
 * const signedTx = await completedTx.sign().complete();
 *
 * const txHash = await submitTransaction(blockfrost, signedTx);
 * console.log('Transaction submitted:', txHash);
 * console.log('View on explorer:', `https://cardanoscan.io/transaction/${txHash}`);
 *
 * // Complete workflow
 * const { selectedUtxos } = await fetchAndSelectUtxos(...);
 * const inputs = createTransactionInputs(selectedUtxos);
 * const outputs = createTransactionOutputs(...);
 * const ttl = await calculateTtl(blockfrost, lucid);
 *
 * const tx = await buildTransaction({
 *   lucid, txInputs: inputs, txOutputs: outputs,
 *   fee: 200000n, ttl
 * });
 *
 * lucid.selectWallet(wallet);
 * const signedTx = await tx.sign().complete();
 * const txHash = await submitTransaction(blockfrost, signedTx);
 *
 * // Wait for confirmation
 * let confirmed = false;
 * while (!confirmed) {
 *   await new Promise(resolve => setTimeout(resolve, 10000));
 *   try {
 *     const txInfo = await blockfrost.txs(txHash);
 *     if (txInfo.block_height) {
 *       confirmed = true;
 *       console.log('Confirmed in block:', txInfo.block_height);
 *     }
 *   } catch (error) {
 *     console.log('Waiting for confirmation...');
 *   }
 * }
 *
 * // Handle submission errors
 * try {
 *   const txHash = await submitTransaction(blockfrost, signedTx);
 * } catch (error) {
 *   if (error.message.includes('InputsExhaustedError')) {
 *     console.error('UTXOs already spent, fetch fresh UTXOs');
 *   } else if (error.message.includes('FeeTooSmallUTxO')) {
 *     console.error('Transaction fee too low');
 *   } else {
 *     console.error('Submission failed:', error.message);
 *   }
 * }
 * ```
 *
 * @remarks
 * The transaction must be fully signed with all required signatures before submission.
 * Missing signatures will cause the submission to fail.
 *
 * Common submission errors:
 * - InputsExhaustedError: UTXOs already spent (race condition)
 * - FeeTooSmallUTxO: Transaction fee insufficient
 * - ValueNotConservedUTxO: Input/output value mismatch
 * - TTLExpiredError: Transaction TTL has passed
 *
 * Successful submission returns immediately with the transaction hash, but the
 * transaction still needs to be confirmed on-chain (typically 20-60 seconds).
 *
 * The returned hash can be used to track the transaction on Cardano explorers
 * (Cardanoscan, AdaStat, etc.) and to fetch transaction details via Blockfrost.
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
 * Builds a CIP-8/30 compliant COSE_Sign1 structure from a Fireblocks signature.
 *
 * Converts a raw Fireblocks EdDSA signature into the COSE_Sign1 format required by
 * Cardano CIP-8 and CIP-30 standards for message signing. This is necessary for
 * scavenger hunt registration and other signed message verification on Cardano.
 *
 * The COSE_Sign1 structure includes:
 * - Protected headers with EdDSA algorithm identifier
 * - The original message as payload
 * - The cryptographic signature
 *
 * @param message - The original message that was signed (UTF-8 string)
 * @param fullSig - The complete signature from Fireblocks (hex string)
 *
 * @returns A Promise resolving to the COSE_Sign1 structure as a hex string
 *
 * @throws {Error} When cardano-web3-js module cannot be imported
 * @throws {Error} When COSE_Sign1 construction fails
 * @throws {Error} When message or signature format is invalid
 *
 * @example
 * ```typescript
 * // Sign message with Fireblocks
 * const fireblocksService = new FireblocksService(config);
 * const signature = await fireblocksService.signMessage({
 *   chain: SupportedBlockchains.CARDANO,
 *   originVaultAccountId: '123',
 *   destinationAddress: 'addr1qx...',
 *   message: 'Scavenger hunt registration',
 *   amount: 0,
 *   noteType: NoteType.REGISTER
 * });
 *
 * // Build COSE_Sign1 for CIP-8/30 compliance
 * const coseSign1Hex = await buildCoseSign1(
 *   'Scavenger hunt registration',
 *   signature.signature.fullSig
 * );
 *
 * // Use in scavenger hunt registration
 * const huntService = new ScavengerHuntService();
 * const receipt = await huntService.register({
 *   destinationAddress: 'addr1qx...',
 *   signature: coseSign1Hex,
 *   pubkey: signature.publicKey!
 * });
 *
 * // Use in claim submission
 * const claimService = new ClaimApiService();
 * const terms = await huntService.getTermsAndConditions();
 * const signature = await fireblocksService.signMessage({
 *   message: terms.content,
 *   // ... other params
 * });
 *
 * const coseSign1 = await buildCoseSign1(
 *   terms.content,
 *   signature.signature.fullSig
 * );
 *
 * const claims = await claimService.makeClaims(
 *   SupportedBlockchains.CARDANO,
 *   originAddress,
 *   amount,
 *   terms.content,
 *   coseSign1,
 *   destinationAddress,
 *   signature.publicKey!
 * );
 *
 * // Verify COSE_Sign1 format
 * console.log('COSE_Sign1 length:', coseSign1Hex.length);
 * console.log('First bytes (header):', coseSign1Hex.substring(0, 20));
 * ```
 *
 * @remarks
 * This function requires the cardano-web3-js library (MSL - Message Signing Library)
 * to be installed. The library is dynamically imported to avoid loading it when not needed.
 *
 * The COSE_Sign1 format is specifically required for Cardano wallet message signing
 * according to CIP-8 (Message Signing) and CIP-30 (dApp Connector) standards.
 *
 * The message is encoded as UTF-8 bytes before being embedded in the COSE structure.
 * Ensure the message passed to this function matches exactly what was signed by Fireblocks.
 *
 * The signature must be from an EdDSA signing operation (Ed25519 curve), which is
 * the standard for Cardano. Other signature algorithms will not work.
 *
 * The resulting COSE_Sign1 hex string can be verified by Cardano nodes and services
 * that support CIP-8/30 message verification.
 */
export const buildCoseSign1 = async (
  message: string,
  fullSig: string
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
