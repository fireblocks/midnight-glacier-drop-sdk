import { redemptionPhaseBaseUrl } from "../constants.js";
import {
  PhaseConfigResponse,
  ThawScheduleResponse,
  TransactionBuildRequest,
  TransactionBuildResponse,
  TransactionSubmissionRequest,
  ThawTransactionResponse,
  ThawTransactionStatus,
} from "../types.js";
import axiosInstance from "../utils/httpClient.js";
import { Logger } from "../utils/logger.js";

export class ThawsService {
  private readonly logger = new Logger("services:thaws-service");

  /**
   * Get current thaws phase configuration
   */
  public getPhaseConfig = async (): Promise<PhaseConfigResponse> => {
    const url = `${redemptionPhaseBaseUrl}/thaws/phase-config`;
    try {
      this.logger.info("Fetching phase configuration");

      const response = await axiosInstance.get<PhaseConfigResponse>(url);

      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error("Error fetching phase configuration:", error.message);
      throw error;
    }
  };

  /**
   * Get the current scheduled thaw status for a destination address
   * @param destAddress - The destination address (Cardano Bech32 format)
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
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error fetching thaw schedule for ${destAddress}:`,
        error.message
      );

      throw error;
    }
  };

  /**
   * Build an unsigned thawing transaction
   * @param destAddress - The destination address
   * @param request - Transaction build request containing funding and collateral UTXOs
   */
  public buildThawTransaction = async (
    destAddress: string,
    request: TransactionBuildRequest
  ): Promise<TransactionBuildResponse> => {
    try {
      this.logger.info(`Building thaw transaction for address: ${destAddress}`);

      const url = `${redemptionPhaseBaseUrl}/thaws/${destAddress}/transactions/build`;
      const response = await axiosInstance.post<TransactionBuildResponse>(
        url,
        [request] // API expects an array with a single object
      );

      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error building thaw transaction for ${destAddress}:`,
        error.message
      );
      throw error;
    }
  };

  /**
   * Submit a signed thawing transaction
   * @param destAddress - The destination address
   * @param request - Transaction submission request with signed transaction and witness set
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
      const response = await axiosInstance.post<ThawTransactionResponse>(
        url,
        [request] // API expects an array with a single object
      );

      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error submitting thaw transaction for ${destAddress}:`,
        error.message
      );
      throw error;
    }
  };

  /**
   * Get the status of a thawing transaction
   * @param destAddress - The destination address
   * @param transactionId - The transaction ID (hex-encoded)
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
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error fetching transaction status for ${transactionId}:`,
        error.message
      );
      throw error;
    }
  };

  public isRedemptionWindowOpen = (config: PhaseConfigResponse): boolean => {
    const now = Date.now() / 1000; // Current timestamp in seconds

    const startTime = config.genesis_timestamp;
    const totalDuration =
      config.redemption_increment_period * config.redemption_increments;
    const endTime = startTime + totalDuration;

    return now >= startTime && now <= endTime;
  };

  // Get window times
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
