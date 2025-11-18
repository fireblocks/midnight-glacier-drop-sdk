import { midnightProvtreeAddress } from "../constants.js";
import { SupportedBlockchains } from "../types/index.js";
import axiosInstance from "../utils/httpClient.js";
import { Logger } from "../utils/logger.js";

/**
 * Service for interacting with the Midnight Provetree API.
 *
 * Provetree is a verification system that manages address allocations and cryptographic
 * proofs for the Midnight blockchain ecosystem. This service provides methods to:
 * - Check if addresses have allocations across different blockchains
 * - Retrieve cryptographic proof data for verified addresses
 * - Validate address eligibility for NIGHT token claims
 *
 * The service handles blockchain-specific API endpoints and authentication requirements,
 * including special handling for XRP (Ripple) addresses which use different endpoint paths.
 *
 * @class ProvetreeService
 * @example
 * ```typescript
 * const provetreeService = new ProvetreeService();
 *
 * // Check Cardano address allocation
 * const cardanoAllocation = await provetreeService.checkAddressAllocation(
 *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
 *   SupportedBlockchains.CARDANO
 * );
 *
 * if (cardanoAllocation > 0) {
 *   console.log(`Address has ${cardanoAllocation} allocation`);
 * }
 *
 * // Get proof data with authentication
 * const proofData = await provetreeService.getProofData(
 *   'your-api-key',
 *   {
 *     address: 'addr1qx...',
 *     blockchain: 'CARDANO'
 *   }
 * );
 *
 * console.log('Proof:', proofData);
 * ```
 */
export class ProvetreeService {
  private readonly logger = new Logger("services:provetree");

  /**
   * Checks the allocation value for a blockchain address via the Provetree API.
   *
   * This method queries the Provetree verification system to determine if an address
   * has an allocation for NIGHT token claims. The allocation value indicates the
   * amount or eligibility status of the address for claiming tokens.
   *
   * Special handling is implemented for XRP addresses, which use a different API
   * endpoint path ("/check/ripple/") compared to other blockchains ("/check/{chain}/").
   *
   * @param address - The blockchain address to verify (format depends on blockchain)
   * @param blockchainId - The blockchain network identifier
   *
   * @returns A Promise resolving to a number representing the allocation value:
   * - 0: No allocation exists for this address
   * - >0: Allocation amount or eligibility value
   *
   * @throws {Error} When the API request fails
   * @throws {Error} When the API returns a non-200 status code
   * @throws {Error} When network connectivity issues occur
   * @throws {Error} When the address format is invalid for the specified blockchain
   *
   * @example
   * ```typescript
   * const service = new ProvetreeService();
   *
   * // Check Cardano address
   * const cardanoAllocation = await service.checkAddressAllocation(
   *   'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   SupportedBlockchains.CARDANO
   * );
   * console.log('Cardano allocation:', cardanoAllocation);
   *
   * // Check Ethereum address
   * const ethAllocation = await service.checkAddressAllocation(
   *   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   SupportedBlockchains.ETHEREUM
   * );
   *
   * // Check XRP address (uses special 'ripple' endpoint)
   * const xrpAllocation = await service.checkAddressAllocation(
   *   'rN7n7otQDd6FczFgLdlqtyMVrn3HMzve32',
   *   SupportedBlockchains.XRP
   * );
   *
   * // Check Bitcoin address
   * const btcAllocation = await service.checkAddressAllocation(
   *   'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
   *   SupportedBlockchains.BITCOIN
   * );
   *
   * // Handle no allocation
   * if (cardanoAllocation === 0) {
   *   console.log('This address has no allocation');
   * }
   *
   * // Validate allocation before proceeding with claim
   * try {
   *   const allocation = await service.checkAddressAllocation(
   *     address,
   *     chain
   *   );
   *
   *   if (allocation > 0) {
   *     // Proceed with claim process
   *     await claimService.makeClaims(...);
   *   } else {
   *     console.log('Address not eligible for claims');
   *   }
   * } catch (error) {
   *   console.error('Allocation check failed:', error);
   * }
   * ```
   *
   * @remarks
   * The method uses the configured axiosInstance which includes default timeout
   * and retry logic for improved reliability.
   *
   * XRP addresses are routed to "/check/ripple/{address}" instead of
   * "/check/XRP/{address}" to maintain compatibility with the Provetree API's
   * naming conventions for Ripple addresses.
   *
   * The allocation value format and meaning may vary by blockchain and should be
   * interpreted in the context of the specific claim rules for that network.
   */
  public checkAddressAllocation = async (
    address: string,
    blockchainId: SupportedBlockchains
  ): Promise<number> => {
    try {
      const response = await axiosInstance.get(
        `${
          blockchainId === SupportedBlockchains.XRP
            ? `${midnightProvtreeAddress}/check/ripple/${address}`
            : `${midnightProvtreeAddress}/check/${blockchainId}/${address}`
        }`,
        {
          headers: {
            Accept: "application/json;charset=utf-8",
          },
        }
      );

      if (response.status === 200) {
        return response.data.value;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error fetching data for address ${address}:`,
        error.message
      );
      throw error;
    }
  };

  /**
   * Retrieves cryptographic proof data from the Provetree API with authentication.
   *
   * This method fetches proof data for verified addresses, which includes cryptographic
   * proofs that can be used to validate address eligibility and claims. The request
   * requires API key authentication via a Bearer token.
   *
   * Proof data typically includes Merkle proofs, signatures, or other cryptographic
   * evidence that an address is part of a verified allocation set.
   *
   * @param apiKey - The API key for authenticating with the Provetree service
   * @param requestData - The request payload object containing query parameters such as:
   *   - address: The blockchain address to get proof for
   *   - blockchain: The blockchain identifier
   *   - Additional blockchain-specific parameters
   *
   * @returns A Promise resolving to the proof data object containing:
   * - Merkle proof components (path, siblings, root hash)
   * - Signature data
   * - Verification metadata
   * - Any additional proof-specific fields
   *
   * @throws {Error} When authentication fails (invalid or missing API key)
   * @throws {Error} When the API returns a non-200 status code
   * @throws {Error} When the request payload is malformed
   * @throws {Error} When network connectivity issues occur
   * @throws {Error} When the specified address has no proof data available
   *
   * @example
   * ```typescript
   * const service = new ProvetreeService();
   *
   * // Basic proof data request
   * const proofData = await service.getProofData(
   *   process.env.PROVETREE_API_KEY!,
   *   {
   *     address: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *     blockchain: 'CARDANO'
   *   }
   * );
   *
   * console.log('Merkle root:', proofData.merkleRoot);
   * console.log('Proof path:', proofData.proof);
   *
   * // Request with additional parameters
   * const detailedProof = await service.getProofData(
   *   apiKey,
   *   {
   *     address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *     blockchain: 'ETHEREUM',
   *     includeSignature: true,
   *     timestamp: Date.now()
   *   }
   * );
   *
   * // Use proof data for verification
   * const proof = await service.getProofData(apiKey, {
   *   address: cardanoAddress,
   *   blockchain: 'CARDANO'
   * });
   *
   * // Verify the proof locally
   * const isValid = verifyMerkleProof(
   *   proof.proof,
   *   proof.leaf,
   *   proof.merkleRoot
   * );
   *
   * if (isValid) {
   *   console.log('Proof verified successfully');
   *   // Proceed with claim submission
   * }
   *
   * // Handle authentication errors
   * try {
   *   const proof = await service.getProofData(
   *     'invalid-key',
   *     requestData
   *   );
   * } catch (error) {
   *   if (error.response?.status === 401) {
   *     console.error('Invalid API key');
   *   }
   * }
   * ```
   *
   * @remarks
   * The API key should be kept secure and not exposed in client-side code.
   * Store it in environment variables or secure configuration management systems.
   *
   * The requestData structure and proof data format may vary depending on the
   * blockchain and Provetree API version. Consult the Provetree API documentation
   * for the latest schema requirements.
   *
   * The method uses POST instead of GET to allow for complex request payloads and
   * to keep sensitive data out of URL parameters.
   */
  public getProofData = async (
    apiKey: string,
    requestData: object
  ): Promise<any> => {
    try {
      const response = await axiosInstance.post(
        midnightProvtreeAddress,
        requestData,
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error("Error fetching proof data:", error.message);
      throw error;
    }
  };
}
