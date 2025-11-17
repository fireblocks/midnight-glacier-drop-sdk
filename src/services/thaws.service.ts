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

export class ThawsService {
  private readonly logger = new Logger("services:thaws-service");
  private readonly errorHandler = new ErrorHandler("thaws", this.logger);

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

  public isRedemptionWindowOpen = (config: PhaseConfigResponse): boolean => {
    const now = Date.now() / 1000;
    const startTime = config.genesis_timestamp;
    const totalDuration =
      config.redemption_increment_period * config.redemption_increments;
    const endTime = startTime + totalDuration;

    return now >= startTime && now <= endTime;
  };

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
