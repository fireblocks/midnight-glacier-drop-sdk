// utils/errorHandler.ts
import axios from "axios";
import { MidnightApiError } from "../types.js";
import { Logger } from "./logger.js";

export class ErrorHandler {
  constructor(
    private readonly serviceName: string,
    private readonly logger: Logger
  ) {}

  /**
   * Handles API errors consistently
   * @param error - The caught error
   * @param context - Description of what operation failed
   * @returns MidnightApiError with structured error information
   */
  handleApiError(error: any, context: string): MidnightApiError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      // Log detailed error information
      this.logger.error(`Error ${context}`);
      this.logger.error("Status:", status);
      this.logger.error("Response Data:", data);
      this.logger.error("Request URL:", error.config?.url);

      // Extract meaningful error message
      const message =
        data?.message ||
        data?.info ||
        error.response?.statusText ||
        `Error ${context}`;

      return new MidnightApiError(
        message,
        status,
        data?.type,
        data?.info,
        this.serviceName
      );
    }

    // Handle MidnightApiError - pass through unchanged
    if (error instanceof MidnightApiError) {
      return error;
    }

    // Non-Axios errors
    this.logger.error(`Unexpected error ${context}:`, error);
    return new MidnightApiError(
      error instanceof Error ? error.message : `Error ${context}`,
      undefined,
      undefined,
      error,
      this.serviceName
    );
  }
}
