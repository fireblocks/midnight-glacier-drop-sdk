import { redemptionPhaseBaseUrl } from "../constants.js";
import axiosInstance from "../utils/httpClient.js";
import { Logger } from "../utils/logger.js";
import {
  PhaseConfigResponse,
  ThawScheduleResponse,
  ThawTransactionResponse,
  ThawTransactionStatus,
  TransactionBuildRequest,
  TransactionBuildResponse,
  TransactionSubmissionRequest,
  MidnightApiError,
} from "../types/index.js";
import { ErrorHandler } from "../utils/errorHandler.js";

/**
 * Service for managing NIGHT token thawing and redemption operations.
 *
 * The Thaws service handles the process of redeeming frozen NIGHT tokens earned from
 * the scavenger hunt. Frozen tokens go through a "thawing" period before they can be
 * redeemed to a Cardano address. This service provides functionality for:
 * - Checking thaw schedules and unlock times
 * - Building unsigned Cardano transactions for redemption
 * - Submitting signed transactions to the blockchain
 * - Tracking transaction status and confirmations
 * - Managing redemption phase timing and windows
 *
 * The redemption process follows these steps:
 * 1. Check phase config to verify redemption window is open
 * 2. Get thaw schedule to see available tokens
 * 3. Build unsigned transaction with funding/collateral UTXOs
 * 4. Sign transaction using Fireblocks or wallet
 * 5. Submit signed transaction for on-chain execution
 * 6. Monitor transaction status until confirmed
 *
 * @class ThawsService
 * @example
 * ```typescript
 * const thawsService = new ThawsService();
 *
 * // 1. Check if redemption is currently available
 * const config = await thawsService.getPhaseConfig();
 * const windowInfo = thawsService.getRedemptionWindowTimes(config);
 *
 * if (windowInfo.isOpen) {
 *   console.log('Redemption window is open until:', windowInfo.endTime);
 *
 *   // 2. Check thaw schedule
 *   const schedule = await thawsService.getThawSchedule('addr1qx...');
 *   console.log(`Available to redeem: ${schedule.thawed_amount} NIGHT`);
 *
 *   // 3. Build redemption transaction
 *   const buildRequest = {
 *     funding_utxos: fundingUtxos,
 *     collateral_utxo: collateralUtxo
 *   };
 *   const unsignedTx = await thawsService.buildThawTransaction(
 *     'addr1qx...',
 *     buildRequest
 *   );
 *
 *   // 4. Sign and submit
 *   const signedTx = await signTransaction(unsignedTx.transaction);
 *   const result = await thawsService.submitThawTransaction(
 *     'addr1qx...',
 *     { transaction: signedTx, witness_set: witnesses }
 *   );
 *
 *   // 5. Monitor status
 *   const status = await thawsService.getTransactionStatus(
 *     'addr1qx...',
 *     result.transaction_id
 *   );
 *   console.log('Status:', status.status);
 * }
 * ```
 */
export class ThawsService {
  private readonly logger = new Logger("services:thaws-service");
  private readonly errorHandler = new ErrorHandler("thaws", this.logger);

  /**
   * Retrieves the current redemption phase configuration.
   *
   * The phase configuration contains critical timing information about the redemption
   * window, including when it opens, how long it lasts, and the incremental unlock
   * schedule. This information is essential for determining when tokens can be redeemed
   * and planning redemption timing.
   *
   * @returns A Promise resolving to PhaseConfigResponse containing:
   * - genesis_timestamp: Unix timestamp when redemption window opens
   * - redemption_increment_period: Duration of each unlock period (seconds)
   * - redemption_increments: Total number of unlock periods
   * - current_phase: Current redemption phase status
   * - Additional configuration parameters
   *
   * @throws {MidnightApiError} When API returns a non-200 status code
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ThawsService();
   *
   * // Get phase configuration
   * const config = await service.getPhaseConfig();
   *
   * console.log('Redemption starts:', new Date(config.genesis_timestamp * 1000));
   * console.log('Increment period:', config.redemption_increment_period, 'seconds');
   * console.log('Total increments:', config.redemption_increments);
   *
   * // Calculate total redemption duration
   * const totalDuration =
   *   config.redemption_increment_period * config.redemption_increments;
   * const durationDays = totalDuration / 86400;
   * console.log(`Redemption window: ${durationDays} days`);
   *
   * // Check if window is open
   * const isOpen = service.isRedemptionWindowOpen(config);
   * if (isOpen) {
   *   console.log('Redemption is currently available');
   * } else {
   *   const windowTimes = service.getRedemptionWindowTimes(config);
   *   console.log('Redemption opens:', windowTimes.startTime);
   *   console.log('Redemption closes:', windowTimes.endTime);
   * }
   *
   * // Calculate current unlock percentage
   * const now = Date.now() / 1000;
   * const elapsed = now - config.genesis_timestamp;
   * const periodsPassed = Math.floor(elapsed / config.redemption_increment_period);
   * const percentUnlocked =
   *   (periodsPassed / config.redemption_increments) * 100;
   * console.log(`${percentUnlocked.toFixed(1)}% of tokens unlocked`);
   * ```
   *
   * @remarks
   * Phase configuration should be checked before attempting redemption to ensure
   * the redemption window is currently open.
   *
   * Tokens unlock incrementally over time - the earlier you redeem, the less
   * tokens will be available, but later periods may have higher network fees.
   */
  public getPhaseConfig = async (): Promise<PhaseConfigResponse> => {
    const url = `${redemptionPhaseBaseUrl}/thaws/phase-config`;
    try {
      this.logger.info("Fetching phase configuration");

      const response = await axiosInstance.get<PhaseConfigResponse>(url);

      if (response.status === 200) {
        return response.data;
      }

      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        "fetching phase configuration"
      );
    }
  };

  /**
   * Retrieves the thaw schedule for a specific Cardano destination address.
   *
   * The thaw schedule shows when frozen NIGHT tokens will become available for redemption
   * and how many tokens are currently thawed (unlocked) versus still frozen. This
   * information is crucial for planning redemption timing and understanding token
   * availability.
   *
   * @param destAddress - The Cardano address in Bech32 format (addr1...)
   *
   * @returns A Promise resolving to ThawScheduleResponse containing:
   * - total_amount: Total NIGHT tokens allocated to this address
   * - thawed_amount: Amount currently available for redemption
   * - frozen_amount: Amount still locked and not yet available
   * - next_unlock_time: Timestamp when next unlock occurs
   * - next_unlock_amount: Amount that will unlock at next_unlock_time
   * - schedule: Array of future unlock events with timestamps and amounts
   *
   * @throws {MidnightApiError} When API returns a non-200 status code
   * @throws {Error} When the address format is invalid
   * @throws {Error} When network request fails
   * @throws {Error} When the address has no thaw schedule (no tokens allocated)
   *
   * @example
   * ```typescript
   * const service = new ThawsService();
   *
   * // Get thaw schedule
   * const schedule = await service.getThawSchedule(
   *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc'
   * );
   *
   * console.log(`Total: ${schedule.total_amount} NIGHT`);
   * console.log(`Available now: ${schedule.thawed_amount} NIGHT`);
   * console.log(`Still frozen: ${schedule.frozen_amount} NIGHT`);
   *
   * // Check if redemption is possible
   * if (schedule.thawed_amount > 0) {
   *   console.log('You can redeem now!');
   * } else {
   *   console.log('Next unlock:', new Date(schedule.next_unlock_time * 1000));
   *   console.log('Will unlock:', schedule.next_unlock_amount, 'NIGHT');
   * }
   *
   * // Show full unlock schedule
   * console.log('Future unlocks:');
   * schedule.schedule.forEach(unlock => {
   *   const date = new Date(unlock.timestamp * 1000);
   *   console.log(`  ${date.toISOString()}: ${unlock.amount} NIGHT`);
   * });
   *
   * // Calculate time until fully unlocked
   * if (schedule.schedule.length > 0) {
   *   const lastUnlock = schedule.schedule[schedule.schedule.length - 1];
   *   const lastUnlockDate = new Date(lastUnlock.timestamp * 1000);
   *   const daysUntilComplete =
   *     (lastUnlock.timestamp - Date.now() / 1000) / 86400;
   *   console.log(`Fully unlocked in ${daysUntilComplete.toFixed(1)} days`);
   * }
   *
   * // Wait for next unlock
   * if (schedule.thawed_amount === 0 && schedule.next_unlock_time) {
   *   const msUntilUnlock =
   *     (schedule.next_unlock_time * 1000) - Date.now();
   *   setTimeout(async () => {
   *     console.log('New tokens unlocked!');
   *     const updated = await service.getThawSchedule(destAddress);
   *     console.log('Now available:', updated.thawed_amount);
   *   }, msUntilUnlock);
   * }
   * ```
   *
   * @remarks
   * The thaw schedule is dynamic and changes over time as tokens progressively unlock.
   * Fetch the schedule immediately before redemption to get current availability.
   *
   * Only addresses that participated in the scavenger hunt or have allocated tokens
   * will have a thaw schedule. Addresses with no participation will return an error.
   *
   * The address must be in Bech32 format (starting with "addr1").
   */
  public getThawSchedule = async (
    destAddress: string
  ): Promise<ThawScheduleResponse> => {
    try {
      this.logger.info(`Fetching thaw schedule for address: ${destAddress}`);

      const url = `${redemptionPhaseBaseUrl}/thaws/${destAddress}/schedule`;
      const response = await axiosInstance.get<ThawScheduleResponse>(url);

      if (response.status === 200) {
        return response.data;
      }

      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching thaw schedule for ${destAddress}`
      );
    }
  };

  /**
   * Builds an unsigned Cardano transaction for redeeming thawed NIGHT tokens.
   *
   * This method constructs a properly formatted Cardano transaction that will transfer
   * the available thawed NIGHT tokens to the specified address. The transaction requires
   * funding UTXOs to cover transaction fees and a collateral UTXO for script execution.
   * The returned unsigned transaction can then be signed using Fireblocks or a Cardano wallet.
   *
   * @param destAddress - The Cardano address receiving the NIGHT tokens (Bech32 format)
   * @param request - Transaction build parameters
   * @param request.funding_utxos - Array of UTXOs to fund transaction fees:
   *   - tx_hash: Transaction hash containing the UTXO
   *   - output_index: Output index within the transaction
   *   - amount: Amount of ADA in lovelace
   *   - address: Address that owns this UTXO
   * @param request.collateral_utxo - UTXO reserved as collateral for smart contract execution:
   *   - Must be pure ADA (no native tokens)
   *   - Typically 5 ADA minimum
   *   - Same structure as funding UTXOs
   *
   * @returns A Promise resolving to TransactionBuildResponse containing:
   * - transaction: Hex-encoded unsigned transaction (CBOR)
   * - transaction_id: Computed transaction ID for tracking
   * - inputs: List of transaction inputs (UTXOs being spent)
   * - outputs: List of transaction outputs (destinations)
   * - fee: Calculated transaction fee in lovelace
   * - required_signers: Public key hashes that must sign the transaction
   *
   * @throws {MidnightApiError} When API returns an error status code
   * @throws {Error} When funding UTXOs are insufficient for fees
   * @throws {Error} When collateral UTXO is invalid or contains tokens
   * @throws {Error} When the address has no thawed tokens available
   * @throws {Error} When transaction building fails (invalid UTXOs, etc.)
   *
   * @example
   * ```typescript
   * const service = new ThawsService();
   *
   * // Prepare UTXOs (typically from wallet or Blockfrost)
   * const fundingUtxos = [
   *   {
   *     tx_hash: 'abc123...',
   *     output_index: 0,
   *     amount: 10000000, // 10 ADA
   *     address: 'addr1qx...'
   *   },
   *   {
   *     tx_hash: 'def456...',
   *     output_index: 1,
   *     amount: 5000000, // 5 ADA
   *     address: 'addr1qx...'
   *   }
   * ];
   *
   * const collateralUtxo = {
   *   tx_hash: 'ghi789...',
   *   output_index: 0,
   *   amount: 5000000, // 5 ADA (pure ADA only)
   *   address: 'addr1qx...'
   * };
   *
   * // Build transaction
   * const buildRequest = {
   *   funding_utxos: fundingUtxos,
   *   collateral_utxo: collateralUtxo
   * };
   *
   * const unsignedTx = await service.buildThawTransaction(
   *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   buildRequest
   * );
   *
   * console.log('Transaction ID:', unsignedTx.transaction_id);
   * console.log('Fee:', unsignedTx.fee, 'lovelace');
   * console.log('Required signers:', unsignedTx.required_signers);
   *
   * // Inspect outputs
   * unsignedTx.outputs.forEach((output, i) => {
   *   console.log(`Output ${i}:`, output.amount, 'to', output.address);
   * });
   *
   * // Fetch UTXOs from Blockfrost
   * const blockfrostUtxos = await fetchUtxos(address, blockfrostApiKey);
   * const fundingUtxos = blockfrostUtxos
   *   .filter(u => u.amount.some(a => a.unit === 'lovelace' && a.quantity >= '5000000'))
   *   .slice(0, 3) // Use first 3 suitable UTXOs
   *   .map(u => ({
   *     tx_hash: u.tx_hash,
   *     output_index: u.output_index,
   *     amount: parseInt(u.amount.find(a => a.unit === 'lovelace')!.quantity),
   *     address: address
   *   }));
   *
   * // Find pure ADA UTXO for collateral
   * const collateralUtxo = blockfrostUtxos
   *   .find(u =>
   *     u.amount.length === 1 &&
   *     u.amount[0].unit === 'lovelace' &&
   *     parseInt(u.amount[0].quantity) >= 5000000
   *   );
   * ```
   *
   * @remarks
   * The transaction must be signed with the private key corresponding to the
   * funding UTXOs and collateral UTXO addresses.
   *
   * Funding UTXOs must provide sufficient ADA to cover transaction fees (typically
   * 0.2-0.5 ADA) plus any min-ADA requirements for outputs.
   *
   * The collateral UTXO is only consumed if smart contract execution fails. It must
   * be pure ADA with no native tokens, as tokens in collateral cannot be returned.
   *
   * This method does not actually submit the transaction - it only builds the unsigned
   * version. After building, you must sign it and use submitThawTransaction().
   */
  public buildThawTransaction = async (
    destAddress: string,
    request: TransactionBuildRequest
  ): Promise<TransactionBuildResponse> => {
    try {
      this.logger.info(`Building thaw transaction for address: ${destAddress}`);

      const url = `${redemptionPhaseBaseUrl}/thaws/${destAddress}/transactions/build`;
      const response = await axiosInstance.post<TransactionBuildResponse>(url, [
        request,
      ]);

      if (response.status === 200) {
        return response.data;
      }

      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `building thaw transaction for ${destAddress}`
      );
    }
  };

  /**
   * Submits a signed thawing transaction to the Cardano blockchain.
   *
   * After building and signing the redemption transaction, this method submits it to
   * the blockchain for execution. The transaction will be validated, included in a block,
   * and the NIGHT tokens will be transferred to the destination address. This is the
   * final step in the redemption process.
   *
   * @param destAddress - The Cardano address receiving the NIGHT tokens
   * @param request - Transaction submission parameters
   * @param request.transaction - Hex-encoded signed transaction (CBOR format)
   * @param request.witness_set - Transaction witness set containing signatures:
   *   - vkey_witnesses: Array of verification key witnesses (signatures)
   *   - native_scripts: Optional native scripts if required
   *   - plutus_scripts: Optional Plutus scripts if required
   *   - plutus_data: Optional Plutus datums
   *   - redeemers: Optional script redeemers
   *
   * @returns A Promise resolving to ThawTransactionResponse containing:
   * - transaction_id: Blockchain transaction ID for tracking
   * - status: Initial transaction status (typically "submitted" or "pending")
   * - submitted_at: Timestamp when transaction was submitted
   * - confirmation_time: Optional estimated confirmation time
   *
   * @throws {MidnightApiError} When API returns an error status code
   * @throws {Error} When transaction signature is invalid
   * @throws {Error} When transaction validation fails (insufficient fees, invalid inputs, etc.)
   * @throws {Error} When the transaction has already been submitted
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ThawsService();
   *
   * // 1. Build unsigned transaction
   * const unsignedTx = await service.buildThawTransaction(
   *   'addr1qx...',
   *   buildRequest
   * );
   *
   * // 2. Sign transaction (example with hypothetical signing service)
   * const signedTxCbor = await signTransaction(
   *   unsignedTx.transaction,
   *   privateKey
   * );
   *
   * const witnesses = {
   *   vkey_witnesses: [{
   *     vkey: publicKeyHex,
   *     signature: signatureHex
   *   }]
   * };
   *
   * // 3. Submit signed transaction
   * const result = await service.submitThawTransaction(
   *   'addr1qx...',
   *   {
   *     transaction: signedTxCbor,
   *     witness_set: witnesses
   *   }
   * );
   *
   * console.log('Transaction submitted!');
   * console.log('TX ID:', result.transaction_id);
   * console.log('Status:', result.status);
   *
   * // 4. Monitor until confirmed
   * let status = result.status;
   * while (status === 'pending' || status === 'submitted') {
   *   await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
   *
   *   const txStatus = await service.getTransactionStatus(
   *     'addr1qx...',
   *     result.transaction_id
   *   );
   *   status = txStatus.status;
   *   console.log('Status update:', status);
   * }
   *
   * if (status === 'confirmed') {
   *   console.log('Redemption successful!');
   * } else {
   *   console.error('Transaction failed:', status);
   * }
   *
   * // Complete workflow with Fireblocks
   * const fireblocksService = new FireblocksService(config);
   *
   * // Build transaction
   * const unsignedTx = await service.buildThawTransaction(destAddress, buildRequest);
   *
   * // Sign with Fireblocks
   * const signature = await fireblocksService.signMessage({
   *   chain: SupportedBlockchains.CARDANO,
   *   originVaultAccountId: vaultId,
   *   message: unsignedTx.transaction,
   *   // ... other params
   * });
   *
   * // Submit
   * const result = await service.submitThawTransaction(
   *   destAddress,
   *   {
   *     transaction: unsignedTx.transaction,
   *     witness_set: {
   *       vkey_witnesses: [{
   *         vkey: signature.publicKey,
   *         signature: signature.signature.fullSig
   *       }]
   *     }
   *   }
   * );
   * ```
   *
   * @remarks
   * The transaction must be properly signed with valid signatures for all required
   * signers specified in the buildThawTransaction() response.
   *
   * Transaction submission is idempotent - submitting the same transaction multiple
   * times will not create duplicate transfers, though it may return an error if already
   * submitted.
   *
   * After submission, use getTransactionStatus() to monitor confirmation. Cardano
   * transactions typically confirm within 20-60 seconds (1-3 blocks).
   *
   * Failed transactions will have their collateral UTXO consumed to pay for the
   * failed execution, so ensure transaction validity before submission.
   */
  public submitThawTransaction = async (
    destAddress: string,
    request: TransactionSubmissionRequest
  ): Promise<ThawTransactionResponse> => {
    try {
      this.logger.info(
        `Submitting thaw transaction for address: ${destAddress}`
      );

      const url = `${redemptionPhaseBaseUrl}/thaws/${destAddress}/transactions`;
      const response = await axiosInstance.post<ThawTransactionResponse>(url, [
        request,
      ]);

      if (response.status === 200) {
        return response.data;
      }

      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `submitting thaw transaction for ${destAddress}`
      );
    }
  };

  /**
   * Retrieves the current status of a submitted thawing transaction.
   *
   * After submitting a redemption transaction, use this method to monitor its progress
   * through the blockchain confirmation process. The status indicates whether the
   * transaction has been accepted, confirmed on-chain, or if any errors occurred.
   *
   * @param destAddress - The Cardano address that was used for redemption
   * @param transactionId - The transaction ID returned from submitThawTransaction()
   *
   * @returns A Promise resolving to ThawTransactionStatus containing:
   * - transaction_id: The transaction ID being queried
   * - status: Current status - "pending", "submitted", "confirmed", "failed"
   * - confirmations: Number of block confirmations (if confirmed)
   * - block_height: Block number containing the transaction (if confirmed)
   * - block_time: Timestamp of the block (if confirmed)
   * - error: Error message if transaction failed
   *
   * @throws {MidnightApiError} When API returns a non-200 status code
   * @throws {Error} When transaction ID is not found
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ThawsService();
   *
   * // Submit transaction
   * const result = await service.submitThawTransaction(
   *   'addr1qx...',
   *   submissionRequest
   * );
   *
   * const txId = result.transaction_id;
   *
   * // Poll for status
   * const checkStatus = async () => {
   *   const status = await service.getTransactionStatus(
   *     'addr1qx...',
   *     txId
   *   );
   *
   *   console.log('Status:', status.status);
   *   console.log('Confirmations:', status.confirmations);
   *
   *   if (status.status === 'confirmed') {
   *     console.log('Transaction confirmed in block:', status.block_height);
   *     console.log('Block time:', new Date(status.block_time * 1000));
   *     return true;
   *   } else if (status.status === 'failed') {
   *     console.error('Transaction failed:', status.error);
   *     return true;
   *   }
   *
   *   return false;
   * };
   *
   * // Poll every 10 seconds until confirmed or failed
   * let completed = false;
   * while (!completed) {
   *   completed = await checkStatus();
   *   if (!completed) {
   *     await new Promise(resolve => setTimeout(resolve, 10000));
   *   }
   * }
   *
   * // Wait for specific number of confirmations
   * const waitForConfirmations = async (required: number) => {
   *   while (true) {
   *     const status = await service.getTransactionStatus(
   *       'addr1qx...',
   *       txId
   *     );
   *
   *     if (status.status === 'confirmed' &&
   *         status.confirmations >= required) {
   *       return status;
   *     }
   *
   *     if (status.status === 'failed') {
   *       throw new Error(`Transaction failed: ${status.error}`);
   *     }
   *
   *     await new Promise(resolve => setTimeout(resolve, 10000));
   *   }
   * };
   *
   * const finalStatus = await waitForConfirmations(3);
   * console.log('Transaction has 3+ confirmations');
   *
   * // Track multiple transactions
   * const txIds = ['tx1...', 'tx2...', 'tx3...'];
   * const statuses = await Promise.all(
   *   txIds.map(txId =>
   *     service.getTransactionStatus('addr1qx...', txId)
   *   )
   * );
   *
   * statuses.forEach((status, i) => {
   *   console.log(`TX ${i + 1}: ${status.status}`);
   * });
   * ```
   *
   * @remarks
   * Transaction status typically progresses: submitted → pending → confirmed.
   *
   * Cardano transactions usually confirm within 20-60 seconds (1-3 blocks),
   * but can take longer during high network congestion.
   *
   * A transaction with 15+ confirmations is considered immutable on Cardano.
   *
   * If a transaction shows "failed" status, the error field will contain details
   * about why it failed. Common failures: insufficient fees, invalid scripts,
   * or already-spent inputs.
   */
  public getTransactionStatus = async (
    destAddress: string,
    transactionId: string
  ): Promise<ThawTransactionStatus> => {
    try {
      this.logger.info(
        `Fetching transaction status for ${transactionId} at address: ${destAddress}`
      );

      const url = `${redemptionPhaseBaseUrl}/thaws/${destAddress}/transactions/${transactionId}`;
      const response = await axiosInstance.get<ThawTransactionStatus>(url);

      if (response.status === 200) {
        return response.data;
      }

      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching transaction status for ${transactionId}`
      );
    }
  };

  /**
   * Checks if the redemption window is currently open.
   *
   * This utility method evaluates the phase configuration to determine if the current
   * time falls within the redemption period. Redemption is only possible when the
   * window is open - attempts outside this period will fail.
   *
   * @param config - The PhaseConfigResponse from getPhaseConfig()
   * @returns True if redemption is currently available, false otherwise
   *
   * @example
   * ```typescript
   * const service = new ThawsService();
   *
   * const config = await service.getPhaseConfig();
   * const isOpen = service.isRedemptionWindowOpen(config);
   *
   * if (isOpen) {
   *   console.log('Redemption is available now');
   *   // Proceed with redemption
   * } else {
   *   console.log('Redemption window is closed');
   *   // Show window timing
   *   const windowTimes = service.getRedemptionWindowTimes(config);
   *   console.log('Opens:', windowTimes.startTime);
   *   console.log('Closes:', windowTimes.endTime);
   * }
   *
   * // Guard redemption operations
   * const config = await service.getPhaseConfig();
   * if (!service.isRedemptionWindowOpen(config)) {
   *   throw new Error('Cannot redeem: redemption window is closed');
   * }
   *
   * // Proceed with redemption...
   * const schedule = await service.getThawSchedule(address);
   * ```
   *
   * @remarks
   * The redemption window has a fixed start time (genesis_timestamp) and duration
   * calculated from redemption_increment_period * redemption_increments.
   *
   * This method uses the current system time, so ensure your system clock is accurate.
   */
  public isRedemptionWindowOpen = (config: PhaseConfigResponse): boolean => {
    const now = Date.now() / 1000;
    const startTime = config.genesis_timestamp;
    const totalDuration =
      config.redemption_increment_period * config.redemption_increments;
    const endTime = startTime + totalDuration;

    return now >= startTime && now <= endTime;
  };

  /**
   * Calculates and returns detailed redemption window timing information.
   *
   * This utility method provides comprehensive timing details about the redemption
   * window, including start/end times, current status, and total duration. Useful
   * for displaying countdown timers, planning redemption timing, and user interfaces.
   *
   * @param config - The PhaseConfigResponse from getPhaseConfig()
   * @returns An object containing:
   * - startTime: Date when redemption window opens
   * - endTime: Date when redemption window closes
   * - isOpen: Boolean indicating if window is currently open
   * - totalDurationSeconds: Total window duration in seconds
   *
   * @example
   * ```typescript
   * const service = new ThawsService();
   *
   * const config = await service.getPhaseConfig();
   * const windowInfo = service.getRedemptionWindowTimes(config);
   *
   * console.log('Redemption Window:');
   * console.log('  Opens:', windowInfo.startTime.toISOString());
   * console.log('  Closes:', windowInfo.endTime.toISOString());
   * console.log('  Duration:', windowInfo.totalDurationSeconds / 86400, 'days');
   * console.log('  Currently open:', windowInfo.isOpen);
   *
   * // Display countdown
   * if (!windowInfo.isOpen) {
   *   const now = new Date();
   *   if (now < windowInfo.startTime) {
   *     const msUntilOpen = windowInfo.startTime.getTime() - now.getTime();
   *     const daysUntilOpen = msUntilOpen / (1000 * 60 * 60 * 24);
   *     console.log(`Redemption opens in ${daysUntilOpen.toFixed(1)} days`);
   *   } else {
   *     console.log('Redemption window has closed');
   *   }
   * } else {
   *   const msUntilClose = windowInfo.endTime.getTime() - Date.now();
   *   const hoursRemaining = msUntilClose / (1000 * 60 * 60);
   *   console.log(`Redemption closes in ${hoursRemaining.toFixed(1)} hours`);
   * }
   *
   * // Create UI countdown timer
   * const updateCountdown = () => {
   *   const config = await service.getPhaseConfig();
   *   const windowInfo = service.getRedemptionWindowTimes(config);
   *
   *   if (windowInfo.isOpen) {
   *     const msRemaining = windowInfo.endTime.getTime() - Date.now();
   *     const hours = Math.floor(msRemaining / (1000 * 60 * 60));
   *     const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
   *     console.log(`Time remaining: ${hours}h ${minutes}m`);
   *   }
   * };
   *
   * setInterval(updateCountdown, 60000); // Update every minute
   *
   * // Plan optimal redemption time
   * const config = await service.getPhaseConfig();
   * const windowInfo = service.getRedemptionWindowTimes(config);
   *
   * // Wait until 50% through window for more tokens to unlock
   * const halfwayPoint = new Date(
   *   windowInfo.startTime.getTime() +
   *   (windowInfo.totalDurationSeconds * 1000 / 2)
   * );
   *
   * console.log('Consider redeeming after:', halfwayPoint.toISOString());
   * ```
   *
   * @remarks
   * The returned Date objects use the local system timezone for display.
   *
   * Use this method for UI elements like countdown timers, status indicators,
   * and redemption planning tools.
   */
  public getRedemptionWindowTimes = (config: PhaseConfigResponse) => {
    const startTime = config.genesis_timestamp;
    const totalDuration =
      config.redemption_increment_period * config.redemption_increments;
    const endTime = startTime + totalDuration;

    return {
      startTime: new Date(startTime * 1000),
      endTime: new Date(endTime * 1000),
      isOpen: Date.now() / 1000 >= startTime && Date.now() / 1000 <= endTime,
      totalDurationSeconds: totalDuration,
    };
  };
}
