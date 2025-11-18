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
 * Service for interacting with the Midnight Claims API.
 *
 * This service provides methods for querying claim history and creating new claims
 * across multiple supported blockchains. It handles the blockchain-specific signature
 * formats and request structures required by the Midnight API, including:
 * - COSE_Sign1 formatting for Cardano
 * - Standard signature handling for EVM chains, Bitcoin, Solana, etc.
 * - XRP-specific signature with public key requirements
 *
 * The service integrates with Fireblocks-signed messages and transforms them into
 * the appropriate format for each blockchain's claim submission requirements.
 *
 * @class ClaimApiService
 * @example
 * ```typescript
 * const claimService = new ClaimApiService();
 *
 * // Get claims history
 * const history = await claimService.getClaimsHistory(
 *   SupportedBlockchains.CARDANO,
 *   'addr1qx...'
 * );
 *
 * console.log(`Found ${history.length} claims`);
 *
 * // Submit a new claim
 * const claims = await claimService.makeClaims(
 *   SupportedBlockchains.CARDANO,
 *   'addr1qx...',              // origin address
 *   1000000,                   // amount
 *   'claim-message',           // message that was signed
 *   '82a4...',                 // full signature hex
 *   'addr1qy...',              // destination address
 *   '5820a3b4...'              // public key
 * );
 *
 * console.log('Claim submitted:', claims);
 * ```
 */
export class ClaimApiService {
  private readonly logger = new Logger("services:claim-api-service");
  private readonly errorHandler = new ErrorHandler("claims", this.logger);

  /**
   * Retrieves the complete claims history for a specific address on a blockchain.
   *
   * Queries the Midnight Claims API to fetch all historical claims associated with
   * the provided address. The response includes details about each claim such as
   * amounts, timestamps, transaction hashes, and claim status.
   *
   * @param blockchainId - The blockchain network to query
   * @param address - The blockchain address to retrieve claims history for
   * @returns A Promise resolving to an array of ClaimHistoryResponse objects, each
   * containing details of a historical claim including:
   * - Claim ID and status
   * - Claim amount
   * - Creation and processing timestamps
   * - Associated transaction hashes
   * - Source and destination addresses
   *
   * @throws {MidnightApiError} When API returns a non-200 status code
   * @throws {Error} When network errors or other issues occur during the request
   *
   * @example
   * ```typescript
   * const service = new ClaimApiService();
   *
   * // Get Cardano claims history
   * const cardanoClaims = await service.getClaimsHistory(
   *   SupportedBlockchains.CARDANO,
   *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc'
   * );
   *
   * console.log(`Total claims: ${cardanoClaims.length}`);
   * cardanoClaims.forEach(claim => {
   *   console.log(`Claim ${claim.id}: ${claim.amount} at ${claim.timestamp}`);
   * });
   *
   * // Get Ethereum claims history
   * const ethClaims = await service.getClaimsHistory(
   *   SupportedBlockchains.ETHEREUM,
   *   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
   * );
   *
   * // Check if address has any claims
   * if (ethClaims.length === 0) {
   *   console.log('No claims found for this address');
   * }
   * ```
   *
   * @remarks
   * The address parameter is URL-encoded automatically to handle special characters.
   * The method uses the configured axiosInstance for HTTP requests, which includes
   * default timeout and retry logic.
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
   * Submits a claim transaction to the Midnight Claims API.
   *
   * This method creates and submits a claim request for NIGHT tokens on the specified
   * blockchain. It handles the blockchain-specific signature formatting requirements:
   *
   * **Cardano**: Converts the signature to COSE_Sign1 format using CIP-8/30 standard,
   * includes the public key for verification.
   *
   * **Ethereum/Bitcoin/BNB/Solana/Avalanche/BAT**: Uses standard signature format
   * with address, amount, destination, and signature fields.
   *
   * **XRP**: Includes both public key and signature in the request payload.
   *
   * The method constructs the appropriate request payload based on the blockchain type
   * and submits it to the Claims API for processing.
   *
   * @param chain - The blockchain network to submit the claim on
   * @param originAddress - The address making the claim (must have signed the message)
   * @param amount - The amount of NIGHT tokens to claim
   * @param message - The original message that was signed (used for signature verification)
   * @param fullSig - The complete signature hex string:
   *   - For Cardano: MSL signature that will be wrapped in COSE_Sign1
   *   - For other chains: Standard hex-encoded signature
   * @param destinationAddress - The address where claimed NIGHT tokens will be sent
   * @param publicKey - The public key corresponding to the signature:
   *   - Required for Cardano and XRP
   *   - Not used for other blockchains
   *
   * @returns A Promise resolving to an array of SubmitClaimResponse objects containing:
   * - Claim ID and status
   * - Transaction hash for on-chain verification
   * - Claimed amount and addresses
   * - Processing timestamps
   *
   * @throws {Error} When the blockchain is not supported
   * @throws {MidnightApiError} When API returns a non-200 status code
   * @throws {Error} When signature building fails (Cardano COSE_Sign1 construction)
   * @throws {Error} When network errors occur during submission
   *
   * @example
   * ```typescript
   * const service = new ClaimApiService();
   *
   * // Submit Cardano claim
   * const cardanoClaim = await service.makeClaims(
   *   SupportedBlockchains.CARDANO,
   *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   1000000,
   *   'Midnight claim message',
   *   '845846a201276761646472657373...',
   *   'addr1qy9prvx8ufwutkwxx9cmmuuajaqmjqwujqlp9d8pvg6gupczjjrx',
   *   '5820a3b4c5d6e7f8...'
   * );
   *
   * console.log('Claim submitted:', cardanoClaim[0].txHash);
   *
   * // Submit Ethereum claim
   * const ethClaim = await service.makeClaims(
   *   SupportedBlockchains.ETHEREUM,
   *   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   500000,
   *   'Midnight claim message',
   *   '0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f',
   *   '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
   *   '' // public key not needed for Ethereum
   * );
   *
   * // Submit XRP claim (requires public key)
   * const xrpClaim = await service.makeClaims(
   *   SupportedBlockchains.XRP,
   *   'rN7n7otQDd6FczFgLdlqtyMVrn3HMzve32',
   *   750000,
   *   'Midnight claim message',
   *   '3045022100...',
   *   'rLHzPsX6oXkzU9rXm85Fy8k3EFCCq4bJkf',
   *   '02a1b2c3d4e5f6...'
   * );
   * ```
   *
   * @remarks
   * The method constructs different request payloads based on the blockchain:
   * - Cardano: Builds COSE_Sign1 structure from the signature
   * - XRP: Includes both pubkey and signature fields
   * - Others: Use standard signature field
   *
   * All requests are sent as arrays to support potential batch claiming in the future,
   * though currently only single claims are supported per request.
   *
   * The User-Agent header is set to mimic a browser to avoid potential API restrictions.
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
