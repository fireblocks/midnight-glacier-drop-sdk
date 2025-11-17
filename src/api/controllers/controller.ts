import { Request, Response } from "express";
import {
  SupportedBlockchains,
  TransactionType,
  TransferClaimsResponse,
} from "../../types.js";
import { FbNightApiService } from "../apiService.js";
import { Logger } from "../../utils/logger.js";

export class ApiController {
  api: FbNightApiService;
  private readonly logger = new Logger("api:controller");
  constructor(api: FbNightApiService) {
    this.api = api;
  }

  /**
   * Handles the request to check address allocation for a given vault account and blockchain.
   * Responds with the allocation value or an error message if the operation fails.
   *
   * @remarks
   * This method retrieves the SDK instance for the specified vault account and blockchain,
   * then checks the address allocation status and returns the result in the response.
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
        `${chain} allocation value for vault account no. ${vaultAccountId}:`,
        result
      );

      res.status(200).json({ value: result });
    } catch (error: any) {
      this.logger.error("checkAddressAllocation:", error.message);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * Handles the request to retrieve the claims history for a specific vault account and blockchain.
   *
   * Responds with the claims history as JSON on success, or an error message on failure.
   *
   * @remarks
   * This method expects `vaultAccountId` and `chain` to be present in the request parameters.
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
      this.logger.info(`Claims history retrieved successfully:`, result);
      res.status(200).json(result);
    } catch (error: any) {
      this.logger.error("getClaimsHistory:", error.message);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * Handles the claim creation process for a given blockchain and destination address.
   *
   * This method retrieves the appropriate SDK instance and initiates the claim process.
   * On success, it responds with the claim details; on failure, it returns an error response.
   *
   * @remarks
   * Expects `chain` in request parameters and `originVaultAccountId`, `destinationAddress` in request body.
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
      this.logger.error(
        "makeClaims:",
        error instanceof Error ? error.message : error
      );
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : error });
    }
  };

  /**
   * Handles the transfer of claims from a specified vault account to a recipient address.
   *
   * This method extracts transfer details from the request body, initiates the transfer using the SDK,
   * and responds with the transaction details upon success.
   */
  public transferClaims = async (req: Request, res: Response) => {
    try {
      const {
        vaultAccountId,
        recipientAddress,
        tokenPolicyId,
        requiredTokenAmount,
      } = req.body;
      this.logger.info(
        `Transferring claims from vault ${vaultAccountId} to ${recipientAddress} with policy ${tokenPolicyId} and amount ${requiredTokenAmount}`
      );
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
        `Transfer successful. TxHash: ${txHash}, Sender: ${senderAddress}, TokenName: ${tokenName}, Amount: ${requiredTokenAmount}`
      );

      res.status(200).json({
        status: "success",
        transactionHash: txHash,
        recipientAddress,
        senderAddress: senderAddress,
        tokenPolicyId,
        tokenName,
        amount: requiredTokenAmount,
      });
    } catch (error: any) {
      this.logger.error(
        "transferClaims:",
        error instanceof Error ? error.message : error
      );
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : error });
    }
  };

  /**
   * Handles the request to retrieve vault account addresses for a specific blockchain and vault account.
   * Responds with a JSON object containing the addresses or an error message if the operation fails.
   *
   * @remarks
   * This method expects `chain` and `vaultAccountId` as route parameters.
   *
   * @returns A JSON response with the vault account addresses or an error message.
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

      res.status(200).json({ addresses: addresses });
    } catch (error: any) {
      this.logger.error("getVaultAccountAddresses:", error.message);
      res.status(500).json({ error: error.message });
    }
  };

  public getScavengerHuntChallenge = async (req: Request, res: Response) => {
    try {
      const addresses = await this.api.executeTransaction({
        vaultAccountId: "0",
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_SCAVENGER_HUNT_CHALLENGE,
        params: { vaultAccountId: "0" },
      });

      res.status(200).json({ addresses: addresses });
    } catch (error: any) {
      this.logger.error("getVaultAccountAddresses:", error.message);
      res.status(500).json({ error: error.message });
    }
  };

  public registerScavengerHuntAddress = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;
    try {
      const addresses = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.REGISTER_SCAVENGER_HUNT_ADDRESS,
        params: { vaultAccountId },
      });

      res.status(200).json({ addresses: addresses });
    } catch (error: any) {
      this.logger.error("registerScavengerHuntAddress:", error.message);
      res.status(500).json({ error });
    }
  };

  public solveScavengerHuntChallenge = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.SOLVE_SCAVENGER_HUNT_CHALLENGE,
        params: { vaultAccountId },
      });

      res.status(200).json({ result: result });
    } catch (error: any) {
      this.logger.error("solveScavengerHuntChallenge:", error.message);
      res.status(500).json({ error });
    }
  };

  public donateToScavengerHunt = async (req: Request, res: Response) => {
    const { vaultAccountId, destAddress } = req.params;
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.DONATE_TO_SCAVENGER_HUNT,
        params: { vaultAccountId, destAddress },
      });

      res.status(200).json({ result: result });
    } catch (error: any) {
      this.logger.error("donateToScavengerHunt:", error.message);
      res.status(500).json({ error });
    }
  };

  public getPhaseConfig = async (_req: Request, res: Response) => {
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId: "0",
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_PHASE_CONFIG,
        params: {} as any,
      });

      res.status(200).json({ result: result });
    } catch (error: any) {
      this.logger.error("getPhaseConfig:", error.message);
      res.status(500).json({ error });
    }
  };

  public getThawSchedule = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.params;
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_THAW_SCHEDULE,
        params: { vaultAccountId },
      });

      res.status(200).json({ result: result });
    } catch (error: any) {
      this.logger.error("getThawSchedule:", error.message);
      res.status(500).json({ error });
    }
  };

  public getThawStatus = async (req: Request, res: Response) => {
    const { destAddress, transactionId } = req.params;
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId: "0",
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.GET_THAW_STATUS,
        params: { destAddress, transactionId },
      });

      res.status(200).json({ result: result });
    } catch (error: any) {
      this.logger.error("getThawStatus:", error.message);
      res.status(500).json({ error });
    }
  };

  public redeemNight = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;
    const { destAddress } = req.body;
    try {
      const result = await this.api.executeTransaction({
        vaultAccountId,
        chain: SupportedBlockchains.CARDANO,
        transactionType: TransactionType.REDEEM_NIGHT,
        params: { vaultAccountId, destAddress },
      });

      res.status(200).json({ result: result });
    } catch (error: any) {
      this.logger.error("donateToScavengerHunt:", error.message);
      res.status(500).json({ error });
    }
  };
}
