import axios from "axios";
import { scavengerHuntBaseUrl } from "../constants.js";
import {
  RegistrationReceipt,
  ChallengeResponse,
  SolutionResponse,
  DonationResponse,
  TermsAndConditions,
} from "../types.js";
import { Logger } from "../utils/logger.js";

export class ScavengerHuntService {
  private readonly logger = new Logger("services:scavenger-hunt");

  /**
   * Get Terms and Conditions that need to be signed
   */
  public getTermsAndConditions = async (
    version = "1-0"
  ): Promise<TermsAndConditions> => {
    try {
      const response = await axios.get(
        `${scavengerHuntBaseUrl}/TandC/${version}`
      );

      if (response.status === 200) {
        this.logger.info("Successfully fetched Terms and Conditions");
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);
      }
      this.logger.error(
        "Error fetching T&C:",
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Register a Cardano address for participation
   */
  public register = async (params: {
    destinationAddress: string;
    signature: string;
    pubkey: string;
  }): Promise<RegistrationReceipt> => {
    try {
      const { destinationAddress, signature, pubkey } = params;

      const response = await axios.post(
        `${scavengerHuntBaseUrl}/register/${destinationAddress}/${signature}/${pubkey}`
      );

      if (response.status === 201) {
        this.logger.info(`Successfully registered ${destinationAddress}`);
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);
        this.logger.error("Request URL:", error.config?.url);
        throw new Error(
          error.response?.data?.message ||
            error.response ||
            "Error registering address"
        );
      }
      this.logger.error(
        `Error registering ${params.destinationAddress}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Get the current challenge
   */
  public getChallenge = async (): Promise<ChallengeResponse> => {
    try {
      const response = await axios.get(`${scavengerHuntBaseUrl}/challenge`);

      if (response.status === 200) {
        const challenge = response.data;
        this.logger.info(
          `Fetched challenge: Day ${challenge.current_day}, Challenge ${challenge.challenge.challenge_number}`
        );
        return challenge;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);
      }
      this.logger.error(
        "Error fetching challenge:",
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Submit a solution for a challenge
   */
  public submitSolution = async (params: {
    address: string;
    challengeId: string;
    nonce: string;
  }): Promise<SolutionResponse> => {
    try {
      const { address, challengeId, nonce } = params;

      this.logger.info(
        `Submitting solution for ${challengeId} with nonce ${nonce}`
      );

      const response = await axios.post(
        `${scavengerHuntBaseUrl}/solution/${address}/${challengeId}/${nonce}`,
        {}
      );

      if (response.status === 200) {
        this.logger.info(`✅ Solution accepted for ${challengeId}`);
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);

        // Specific error messages
        if (
          error.response?.data?.message?.includes("Address is not registered")
        ) {
          throw new Error("Address is not registered. Please register first.");
        } else if (
          error.response?.data?.message?.includes("does not meet difficulty")
        ) {
          throw new Error("Solution does not meet difficulty requirements.");
        } else if (
          error.response?.data?.message?.includes("Challenge not found")
        ) {
          throw new Error("Challenge not found or expired.");
        }
      }

      this.logger.error(
        `Error submitting solution:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Consolidate rewards from one address to another
   */
  public donateToAddress = async (params: {
    destinationAddress: string;
    originalAddress: string;
    signature: string;
  }): Promise<DonationResponse> => {
    try {
      const { destinationAddress, originalAddress, signature } = params;

      this.logger.info(
        `Consolidating rewards from ${originalAddress} to ${destinationAddress}`
      );

      const response = await axios.post(
        `${scavengerHuntBaseUrl}/donate_to/${destinationAddress}/${originalAddress}/${signature}`,
        {}
      );

      if (response.status === 200) {
        this.logger.info(
          `✅ Successfully consolidated ${response.data.solutions_consolidated} solutions`
        );
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);

        if (error.response?.data?.message?.includes("not registered")) {
          throw new Error("Original address is not registered.");
        } else if (
          error.response?.data?.message?.includes(
            "already has an active donation"
          )
        ) {
          throw new Error(
            "Original address already has an active donation assignment."
          );
        }
      }

      this.logger.error(
        `Error consolidating addresses:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Get the daily reward rates (STAR per solution)
   */
  public getWorkToStarRate = async (): Promise<number[]> => {
    try {
      const response = await axios.get(
        `${scavengerHuntBaseUrl}/work_to_star_rate`
      );

      if (response.status === 200) {
        this.logger.info(
          `Fetched work to star rates for ${response.data.length} days`
        );
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);
      }
      this.logger.error(
        "Error fetching star rates:",
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Calculate estimated NIGHT tokens earned
   */
  public calculateEarnings = async (
    solutionsByDay: Record<number, number>
  ): Promise<{
    totalStar: number;
    totalNight: number;
    breakdown: Array<{
      day: number;
      solutions: number;
      star: number;
      night: number;
    }>;
  }> => {
    try {
      const rates = await this.getWorkToStarRate();

      let totalStar = 0;
      const breakdown = [];

      for (const [dayStr, solutions] of Object.entries(solutionsByDay)) {
        const day = parseInt(dayStr);
        const dayIndex = day - 1; // Array is 0-indexed, days are 1-indexed

        if (dayIndex < rates.length && rates[dayIndex]) {
          const star = solutions * rates[dayIndex];
          totalStar += star;

          breakdown.push({
            day,
            solutions,
            star,
            night: star / 1_000_000,
          });
        }
      }

      return {
        totalStar,
        totalNight: totalStar / 1_000_000,
        breakdown,
      };
    } catch (error: any) {
      this.logger.error(
        "Error calculating earnings:",
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Check if mining is currently active
   */
  public getMiningStatus = async (): Promise<{
    isActive: boolean;
    code: "before" | "active" | "after";
    message?: string;
    startsAt?: string;
  }> => {
    try {
      const response = await axios.get(`${scavengerHuntBaseUrl}/challenge`);

      if (response.status === 200) {
        const data = response.data;

        return {
          isActive: data.code === "active",
          code: data.code,
          message:
            data.code === "active"
              ? `Mining active - Day ${data.current_day}/${data.max_day}`
              : data.code === "before"
              ? `Mining starts at ${data.starts_at}`
              : "Mining has ended",
          startsAt: data.starts_at,
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);
      }
      throw error;
    }
  };
}
