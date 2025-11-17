import axios from "axios";
import { midnightClaimAddress } from "../constants.js";
import {
  ClaimHistoryResponse,
  MidnightApiError,
  SubmitClaimResponse,
  SupportedBlockchains,
} from "../types/index.js";

import axiosInstance from "../utils/httpClient.js";
import { Logger } from "../utils/logger.js";
import { buildCoseSign1 } from "../utils/cardano.utils.js";
import { ErrorHandler } from "../utils/errorHandler.js";

/**
 * Service for interacting with the Midnight claim API, providing methods for querying and creating claims across supported blockchains.
 */
export class ClaimApiService {
  private readonly logger = new Logger("services:claim-api-service");
  private readonly errorHandler = new ErrorHandler("claims", this.logger);

  /**
   * Fetches the full claims history for a particular address on a specified blockchain.
   *
   * @param {SupportedBlockchains} blockchainId - The blockchain to query.
   * @param {string} address - The address for which to retrieve the claims history.
   * @returns {Promise<ClaimHistoryResponse[]>} An array of ClaimHistoryResponse objects detailing the address's claim history.
   * @throws {Error} On network or API errors; detailed Axios error messages are provided if applicable.
   */
  public getClaimsHistory = async (
    blockchainId: SupportedBlockchains,
    address: string
  ): Promise<ClaimHistoryResponse[]> => {
    try {
      const url = `${midnightClaimAddress}/claims/${blockchainId}?address=${encodeURIComponent(
        address
      )}`;
      const response = await axiosInstance.get(url);

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
        `fetching claims history for ${address} on ${blockchainId}`
      );
    }
  };

  /**
   * Submits a claim transaction to the Claims API for the specified blockchain and parameters.
   * Builds the request payload according to the blockchain type, including required signatures and fields.
   *
   * @param {SupportedBlockchains} chain - The blockchain to submit the claim on.
   * @param {string} originAddress - The originating address making the claim.
   * @param {number} amount - The amount to claim.
   * @param {string} message - The message being signed (typically for signature verification).
   * @param {string} fullSig - The hex-encoded signature (MSL COSE_Sign1 for Cardano, plain for others).
   * @param {string} destinationAddress - The address to which the claimed amount is sent.
   * @param {string} publicKey - The public key corresponding to the signature (used for Cardano claims only).
   * @returns {Promise<SubmitClaimResponse[]>} An array of SubmitClaimResponse objects containing details of the submitted claim.
   * @throws {Error} If the transaction fails or the blockchain is unsupported. Axios errors are logged and re-thrown for external handling.
   */
  public makeClaims = async (
    chain: SupportedBlockchains,
    originAddress: string,
    amount: number,
    message: string,
    fullSig: string,
    destinationAddress: string,
    publicKey: string
  ): Promise<SubmitClaimResponse[]> => {
    try {
      let params: any = {};

      switch (chain) {
        case SupportedBlockchains.CARDANO:
          const coseSign1Hex = await buildCoseSign1(message, fullSig);

          params = [
            {
              address: originAddress,
              amount,
              cose_sign1: coseSign1Hex,
              dest_address: destinationAddress,
              public_key: publicKey,
            },
          ];
          break;

        case SupportedBlockchains.BITCOIN:
        case SupportedBlockchains.ETHEREUM:
        case SupportedBlockchains.BAT:
        case SupportedBlockchains.BNB:
        case SupportedBlockchains.SOLANA:
        case SupportedBlockchains.AVALANCHE:
          params = [
            {
              address: originAddress,
              amount,
              dest_address: destinationAddress,
              signature: fullSig,
            },
          ];
          break;

        case SupportedBlockchains.XRP:
          params = [
            {
              address: originAddress,
              amount,
              dest_address: destinationAddress,
              pubkey: publicKey,
              signature: fullSig,
            },
          ];
          break;

        default:
          throw new Error(`chain ${chain} is not supported.`);
      }

      this.logger.info("makeClaim params", params);

      const response = await axios.post(
        `${midnightClaimAddress}/claims/${chain}`,
        params,
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json;charset=utf-8",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
        }
      );

      this.logger.info("NIGHT claimed success.");

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
        `making claim on ${chain} for address ${originAddress}`
      );
    }
  };
}
