import { Request, Response } from "express";
import {
  MidnightApiError,
  SupportedBlockchains,
  TransactionType,
  TransferClaimsResponse,
} from "../../types/index.js";
import { FbNightApiService } from "../apiService.js";
import { Logger } from "../../utils/logger.js";

/**
 * Controller class that handles HTTP requests for Midnight blockchain operations.
 *
 * This controller serves as the interface between Express routes and the FbNightApiService,
 * handling various operations including address allocation, claims management, scavenger hunt
 * challenges, and token redemption.
 *
 * @class ApiController
 * @example
 * ```typescript
 * const apiService = new FbNightApiService(config);
 * const controller = new ApiController(apiService);
 *
 * app.get('/allocation/:vaultAccountId/:chain', controller.checkAddressAllocation);
 * ```
 */
export class ApiController {
  api: FbNightApiService;
  private readonly logger = new Logger("api:controller");

  /**
   * Creates an instance of ApiController.
   *
   * @param api - The FbNightApiService instance to use for blockchain operations
   */
  constructor(api: FbNightApiService) {
    this.api = api;
  }

  /**
   * Checks the address allocation status for a given vault account and blockchain.
   *
   * This endpoint retrieves the SDK instance for the specified vault account and blockchain,
   * then checks whether an address has been allocated for that vault account.
   *
   * @param req - Express request object
   * @param req.params.vaultAccountId - The vault account ID to check
   * @param req.params.chain - The blockchain to check (e.g., 'CARDANO')
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent
   * @throws {MidnightApiError} When the API operation fails
   *
   * @example
   * GET /allocation/123/CARDANO
   * Response: { "value": true }
   */
  public checkAddressAllocation = async (req: Request, res: Response) => {
    const { vaultAccountId, chain } = req.params;

    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: chain as SupportedBlockchains,
        transactionType: TransactionType.CHECK_ADDRESS_ALLOCATION,
        params: { chain: chain as SupportedBlockchains },
      });

      this.logger.info(
        `${chain} allocation for vault ${vaultAccountId}:`,
        result
      );
      res.status(200).json({ value: result });
    } catch (error: any) {
      this.handleError(error, res, "checkAddressAllocation");
    }
  };

  /**
   * Retrieves the claims history for a specific vault account and blockchain.
   *
   * This endpoint fetches all historical claims made by the specified vault account,
   * including timestamps, amounts, and transaction details.
   *
   * @param req - Express request object
   * @param req.params.vaultAccountId - The vault account ID to query
   * @param req.params.chain - The blockchain to query
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with the claims history
   * @throws {MidnightApiError} When the API operation fails
   *
   * @example
   * GET /claims/history/123/CARDANO
   * Response: [{ claimId: "...", amount: 100, timestamp: "..." }]
   */
  public getClaimsHistory = async (req: Request, res: Response) => {
    const { vaultAccountId, chain } = req.params;

    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: chain as SupportedBlockchains,
        transactionType: TransactionType.GET_CLAIMS_HISTORY,
        params: { chain: chain as SupportedBlockchains },
      });

      this.logger.info(`Claims history retrieved successfully`);
      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getClaimsHistory");
    }
  };

  /**
   * Creates a new claim for NIGHT tokens on the specified blockchain.
   *
   * This endpoint initiates the claim process for a given vault account, creating
   * a claim that can be transferred to a destination address.
   *
   * @param req - Express request object
   * @param req.params.chain - The blockchain to use for the claim
   * @param req.body.originVaultAccountId - The vault account ID that will make the claim
   * @param req.body.destinationAddress - The address where claimed tokens will be sent
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with claim details
   * @throws {MidnightApiError} When the claim creation fails
   *
   * @example
   * POST /claims/CARDANO
   * Body: { "originVaultAccountId": "123", "destinationAddress": "addr1..." }
   * Response: { claimId: "...", amount: 100, status: "pending" }
   */
  public makeClaims = async (req: Request, res: Response) => {
    const { chain } = req.params;
    const { originVaultAccountId, destinationAddress } = req.body;

    try {
      const claims = await this.api.executeTransaction({
        vaultAccountId: originVaultAccountId,
        chain: chain as SupportedBlockchains,
        transactionType: TransactionType.MAKE_CLAIMS,
        params: { chain: chain as SupportedBlockchains, destinationAddress },
      });

      this.logger.info("Claimed NIGHT successfully:", claims);
      res.status(200).json(claims);
    } catch (error: any) {
      this.handleError(error, res, "makeClaims");
    }
  };

  /**
   * Transfers claimed tokens from a vault account to a recipient address.
   *
   * This endpoint executes a token transfer on the Cardano blockchain, moving a specific
   * amount of tokens identified by their policy ID from the vault account to the recipient.
   *
   * @param req - Express request object
   * @param req.body.vaultAccountId - The source vault account ID
   * @param req.body.recipientAddress - The destination address for the tokens
   * @param req.body.tokenPolicyId - The policy ID of the token to transfer
   * @param req.body.requiredTokenAmount - The amount of tokens to transfer
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with transaction details
   * @throws {MidnightApiError} When the transfer fails
   *
   * @example
   * POST /transfer
   * Body: {
   *   "vaultAccountId": "123",
   *   "recipientAddress": "addr1...",
   *   "tokenPolicyId": "abc123...",
   *   "requiredTokenAmount": "1000000"
   * }
   * Response: {
   *   "status": "success",
   *   "transactionHash": "...",
   *   "recipientAddress": "addr1...",
   *   "amount": "1000000"
   * }
   */
  public transferClaims = async (req: Request, res: Response) => {
    try {
      const {
        vaultAccountId,
        recipientAddress,
        tokenPolicyId,
        requiredTokenAmount,
      } = req.body;

      const { txHash, senderAddress, tokenName } =
        (await this.api.executeTransaction({
          vaultAccountId,
          chain: SupportedBlockchains.CARDANO,
          transactionType: TransactionType.TRANSFER_CLAIMS,
          params: {
            recipientAddress,
            tokenPolicyId,
            requiredTokenAmount: Number(requiredTokenAmount),
          },
        })) as TransferClaimsResponse;

      this.logger.info(
        `Transfer successful. TxHash: ${txHash}, Amount: ${requiredTokenAmount}`
      );

      res.status(200).json({
        status: "success",
        transactionHash: txHash,
        recipientAddress,
        senderAddress,
        tokenPolicyId,
        tokenName,
        amount: requiredTokenAmount,
      });
    } catch (error: any) {
      this.handleError(error, res, "transferClaims");
    }
  };

  /**
   * Retrieves all addresses associated with a vault account for a specific blockchain.
   *
   * This endpoint returns the list of blockchain addresses that are linked to the
   * specified vault account, which may include multiple addresses at different derivation indices.
   *
   * @param req - Express request object
   * @param req.params.chain - The blockchain to query
   * @param req.params.vaultAccountId - The vault account ID to query
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with the address list
   * @throws {MidnightApiError} When the address retrieval fails
   *
   * @example
   * GET /addresses/CARDANO/123
   * Response: { "addresses": ["addr1...", "addr2..."] }
   */
  public getVaultAccountAddresses = async (req: Request, res: Response) => {
    const { chain, vaultAccountId } = req.params;

    try {
      const addresses = await this.api.executeTransaction({
        vaultAccountId,
        chain: chain as SupportedBlockchains,
        transactionType: TransactionType.GET_VAULT_ACCOUNT_ADDRESSES,
        params: { vaultAccountId },
      });

      res.status(200).json({ addresses });
    } catch (error: any) {
      this.handleError(error, res, "getVaultAccountAddresses");
    }
  };

  /**
   * Retrieves the current scavenger hunt challenge details.
   *
   * This endpoint fetches the active scavenger hunt challenge information, including
   * the challenge parameters and requirements needed to solve it.
   *
   * @param req - Express request object (unused, challenge is global)
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with challenge details
   * @throws {MidnightApiError} When the challenge retrieval fails
   *
   * @example
   * GET /scavenger-hunt/challenge
   * Response: { "result": { challengeId: "...", difficulty: 5, ... } }
   */
  public getScavengerHuntChallenge = async (req: Request, res: Response) => {
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId: "0",
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_SCAVENGER_HUNT_CHALLENGE,
        params: { vaultAccountId: "0" },
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "getScavengerHuntChallenge");
    }
  };

  /**
   * Registers a vault account address for participation in the scavenger hunt.
   *
   * This endpoint signs and submits a registration message that associates a vault account
   * address with the scavenger hunt, enabling that address to solve challenges and earn rewards.
   *
   * @param req - Express request object
   * @param req.params.vaultAccountId - The vault account ID to register
   * @param req.query.index - Optional derivation index for the address (defaults to 0)
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with registration confirmation
   * @throws {MidnightApiError} When the registration fails
   *
   * @example
   * POST /scavenger-hunt/register/123?index=0
   * Response: { "result": { registered: true, address: "addr1..." } }
   */
  public registerScavengerHuntAddress = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;

    const index = req.query.index ? Number(req.query.index) : 0;
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.REGISTER_SCAVENGER_HUNT_ADDRESS,
        params: { vaultAccountId, index },
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "registerScavengerHuntAddress");
    }
  };

  /**
   * Attempts to solve the current scavenger hunt challenge.
   *
   * This endpoint performs the computational work required to solve the scavenger hunt
   * challenge (e.g., mining a hash with specific properties) and submits the solution
   * to claim NIGHT token rewards.
   *
   * @param req - Express request object
   * @param req.params.vaultAccountId - The vault account ID attempting to solve the challenge
   * @param req.query.index - Optional derivation index for the address (defaults to 0)
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with solution results
   * @throws {MidnightApiError} When the challenge solving fails
   *
   * @example
   * POST /scavenger-hunt/solve/123?index=0
   * Response: { "result": { solved: true, reward: 100, txHash: "..." } }
   */
  public solveScavengerHuntChallenge = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;

    const index = req.query.index ? Number(req.query.index) : 0;

    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.SOLVE_SCAVENGER_HUNT_CHALLENGE,
        params: { vaultAccountId, index },
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "solveScavengerHuntChallenge");
    }
  };

  /**
   * Donates ADA to the scavenger hunt reward pool.
   *
   * This endpoint allows users to contribute ADA to the scavenger hunt prize pool,
   * increasing the rewards available for participants who successfully solve challenges.
   *
   * @param req - Express request object
   * @param req.params.vaultAccountId - The vault account ID making the donation
   * @param req.params.destAddress - The destination address for the donation (scavenger hunt pool)
   * @param req.query.index - Optional derivation index for the address (defaults to 0)
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with donation confirmation
   * @throws {MidnightApiError} When the donation fails
   *
   * @example
   * POST /scavenger-hunt/donate/123/addr1...?index=0
   * Response: { "result": { donated: true, amount: "2000000", txHash: "..." } }
   */
  public donateToScavengerHunt = async (req: Request, res: Response) => {
    const { vaultAccountId, destAddress } = req.params;

    const index = req.query.index ? Number(req.query.index) : 0;

    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.DONATE_TO_SCAVENGER_HUNT,
        params: { vaultAccountId, index, destAddress },
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "donateToScavengerHunt");
    }
  };

  /**
   * Retrieves the current phase configuration for the Midnight network.
   *
   * This endpoint returns configuration details about the current operational phase,
   * including timing parameters, reward schedules, and network state.
   *
   * @param _req - Express request object (unused)
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with phase configuration
   * @throws {MidnightApiError} When the configuration retrieval fails
   *
   * @example
   * GET /phase-config
   * Response: { "result": { phase: 2, startTime: "...", endTime: "..." } }
   */
  public getPhaseConfig = async (_req: Request, res: Response) => {
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId: "0",
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_PHASE_CONFIG,
        params: {} as any,
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "getPhaseConfig");
    }
  };

  /**
   * Retrieves the thaw schedule for a vault account.
   *
   * This endpoint returns information about when frozen NIGHT tokens will become
   * available for redemption, including unlock times and amounts.
   *
   * @param req - Express request object
   * @param req.params.vaultAccountId - The vault account ID to query
   * @param req.query.index - Optional derivation index for the address (defaults to 0)
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with thaw schedule details
   * @throws {MidnightApiError} When the schedule retrieval fails
   *
   * @example
   * GET /thaw/schedule/123?index=0
   * Response: { "result": { unlockDate: "...", amount: 1000, status: "frozen" } }
   */
  public getThawSchedule = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;
    const index = req.query.index ? Number(req.query.index) : 0;
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_THAW_SCHEDULE,
        params: { vaultAccountId, index },
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "getThawSchedule");
    }
  };

  /**
   * Checks the status of a thaw transaction.
   *
   * This endpoint queries the current status of a thawing process, indicating whether
   * the tokens have been successfully unfrozen and are ready for redemption.
   *
   * @param req - Express request object
   * @param req.params.destAddress - The destination address for the thawed tokens
   * @param req.params.transactionId - The transaction ID to check
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with thaw status
   * @throws {MidnightApiError} When the status check fails
   *
   * @example
   * GET /thaw/status/addr1.../abc123...
   * Response: { "result": { status: "complete", amount: 1000, txHash: "..." } }
   */
  public getThawStatus = async (req: Request, res: Response) => {
    const { destAddress, transactionId } = req.params;

    try {
      const result = await this.api.executeTransaction({
        vaultAccountId: "0",
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_THAW_STATUS,
        params: { destAddress, transactionId },
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "getThawStatus");
    }
  };

  /**
   * Redeems thawed NIGHT tokens to a vault account address.
   *
   * This endpoint initiates the redemption process for tokens that have completed their
   * thawing period, transferring them to the specified vault account address.
   * Optionally waits for transaction confirmation with configurable polling and timeout.
   *
   * @param req - Express request object
   * @param req.params.vaultAccountId - The vault account ID receiving the tokens
   * @param req.query.index - Optional derivation index for the address (defaults to 0)
   * @param req.body.waitForConfirmation - Whether to wait for transaction confirmation
   * @param req.body.pollingIntervalMs - Polling interval in milliseconds when waiting for confirmation
   * @param req.body.timeoutMs - Timeout in milliseconds for confirmation wait
   * @param res - Express response object
   * @returns A Promise that resolves when the response is sent with redemption details
   * @throws {MidnightApiError} When the redemption fails
   *
   * @example
   * POST /redeem/123?index=0
   * Body: {
   *   "waitForConfirmation": true,
   *   "pollingIntervalMs": 5000,
   *   "timeoutMs": 300000
   * }
   * Response: { "result": { redeemed: true, amount: 1000, txHash: "..." } }
   */
  public redeemNight = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;

    const index = req.query.index ? Number(req.query.index) : 0;

    const { waitForConfirmation, pollingIntervalMs, timeoutMs } = req.body;
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.REDEEM_NIGHT,
        params: {
          vaultAccountId,
          index,
          waitForConfirmation,
          pollingIntervalMs,
          timeoutMs,
        },
      });

      res.status(200).json({ result });
    } catch (error: any) {
      this.handleError(error, res, "redeemNight");
    }
  };

  /**
   * Handles errors that occur during API operations.
   *
   * This private method provides centralized error handling, distinguishing between
   * MidnightApiError instances (which have structured error information) and generic
   * errors. It logs the error details and sends an appropriate HTTP response.
   *
   * @param error - The error that occurred
   * @param res - Express response object
   * @param endpoint - The name of the endpoint where the error occurred (for logging)
   * @returns void
   *
   * @remarks
   * For MidnightApiError instances, returns a structured JSON response with statusCode,
   * errorType, service, message, and additional error info.
   * For generic errors, returns a 500 status with a simple error message.
   */
  private handleError(error: any, res: Response, endpoint: string): void {
    if (error instanceof MidnightApiError) {
      const statusCode = error.statusCode || 500;

      this.logger.error(`${endpoint} - MidnightApiError:`, {
        statusCode: error.statusCode,
        errorType: error.errorType,
        service: error.service,
        message: error.message,
      });

      res.status(statusCode).json({
        error: error.message,
        statusCode: error.statusCode,
        type: error.errorType,
        info: error.errorInfo,
        service: error.service,
      });
    } else {
      this.logger.error(`${endpoint} - Error:`, error.message || error);

      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
}
