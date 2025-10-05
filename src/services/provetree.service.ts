import { midnightProvtreeAdress } from "../constants.js";
import { SupportedBlockchains } from "../types.js";
import axiosInstance from "../utils/httpClient.js";

/**
 * Service for interacting with the Provetree API, providing methods to check addresses and retrieve proof data.
 */
export class ProvetreeService {
  /**
   * Fetches the allocation value of a blockchain address via the Provetree API.
   *
   * @param {string} address - The blockchain address to verify.
   * @param {SupportedBlockchains} blockchainId - The blockchain identifier (must be a SupportedBlockchains value).
   * @returns {Promise<number>} A promise resolving to a number indicating the allocation value.
   * @throws {Error} Throws an error if the request fails or the response status is not 200.
   */
  public checkAddressAllocation = async (
    address: string,
    blockchainId: SupportedBlockchains
  ): Promise<number> => {
    try {
      const response = await axiosInstance.get(
        `${midnightProvtreeAdress}/check/${blockchainId}/${address}`,
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
      console.error(
        `Error fetching data for address ${address}:`,
        error.message
      );
      throw error;
    }
  };

  public getProofData = async (
    apiKey: string,
    requestData: object
  ): Promise<any> => {
    try {
      const response = await axiosInstance.post(
        midnightProvtreeAdress,
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
      console.error("Error fetching proof data:", error.message);
      throw error;
    }
  };
}
