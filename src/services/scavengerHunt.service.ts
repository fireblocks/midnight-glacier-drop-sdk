import axios from "axios";
import { scavengerHuntBaseUrl } from "../constants.js";
import {
  RegistrationReceipt,
  SolutionResponse,
  TermsAndConditions,
  ScavangerHuntChallangeResponse,
  DonateToScavengerHuntResponse,
} from "../types.js";
import { Logger } from "../utils/logger.js";
import { AshMaize } from "../utils/ashmaize.js";

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

      if (response.status === 200 || response.status === 201) {
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
  public getChallenge = async (): Promise<ScavangerHuntChallangeResponse> => {
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
      this.logger.info("Submit Solution Response:", response.data);
      if (response.status === 200) {
        this.logger.info(`Solution accepted for ${challengeId}`);
        return response.data;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Status:", error.response?.status);
        this.logger.error("Response Data:", error.response?.data);

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
   * Solve a challenge by mining for a valid nonce
   */
  public solveChallenge = async (params: {
    address: string;
    challenge: any;
    onProgress?: (nonce: bigint, hashRate: number) => void;
    maxAttempts?: bigint;
  }): Promise<{
    nonce: string;
    hash: string;
    attempts: bigint;
    timeMs: number;
  }> => {
    try {
      const { address, challenge, onProgress, maxAttempts } = params;

      this.logger.info(
        `Starting to solve challenge ${challenge.challenge_id} with difficulty ${challenge.difficulty}`
      );

      const startTime = Date.now();
      let nonce = 0n;
      let found = false;
      let lastProgressUpdate = Date.now();
      let hashesLastUpdate = 0n;

      // Initialize AshMaize
      const ashMaize = new AshMaize();
      await ashMaize.init(challenge.no_pre_mine);

      while (!found) {
        if (maxAttempts && nonce >= maxAttempts) {
          throw new Error(
            `Max attempts (${maxAttempts}) reached without finding solution`
          );
        }

        const nonceHex = nonce.toString(16).padStart(16, "0");
        const preimage = this.buildPreimage({
          nonce: nonceHex,
          address,
          challengeId: challenge.challenge_id,
          difficulty: challenge.difficulty,
          noPreMine: challenge.no_pre_mine,
          latestSubmission: challenge.latest_submission,
          noPreMineHour: challenge.no_pre_mine_hour,
        });

        const hash = await ashMaize.hash(preimage);

        if (this.matchesDifficulty(hash, challenge.difficulty)) {
          found = true;
          const timeMs = Date.now() - startTime;
          const hashRate = Number(nonce) / (timeMs / 1000);

          this.logger.info(
            `Found solution! Nonce: ${nonceHex}, Attempts: ${nonce.toLocaleString()}, Time: ${(
              timeMs / 1000
            ).toFixed(2)}s, Hash rate: ${hashRate.toFixed(2)} H/s`
          );

          return {
            nonce: nonceHex,
            hash,
            attempts: nonce,
            timeMs,
          };
        }

        nonce++;

        // progress logging
        if (Date.now() - lastProgressUpdate > 1000) {
          const timeSinceLastUpdate = Date.now() - lastProgressUpdate;
          const hashesSinceLastUpdate = nonce - hashesLastUpdate;
          const hashRate =
            Number(hashesSinceLastUpdate) / (timeSinceLastUpdate / 1000);

          this.logger.info(
            `⛏️  Mining: ${nonce.toLocaleString()} attempts | ${hashRate.toFixed(
              2
            )} H/s | ${((Date.now() - startTime) / 1000).toFixed(0)}s elapsed`
          );

          if (onProgress) {
            onProgress(nonce, hashRate);
          }

          lastProgressUpdate = Date.now();
          hashesLastUpdate = nonce;
        }
      }

      throw new Error("Should never reach here");
    } catch (error: any) {
      this.logger.error(
        "Error solving challenge:",
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };

  /**
   * Build preimage for hashing
   */
  private buildPreimage(params: {
    nonce: string;
    address: string;
    challengeId: string;
    difficulty: string;
    noPreMine: string;
    latestSubmission: Date;
    noPreMineHour: string;
  }): string {
    const {
      nonce,
      address,
      challengeId,
      difficulty,
      noPreMine,
      latestSubmission,
      noPreMineHour,
    } = params;

    return (
      nonce +
      address +
      challengeId +
      difficulty +
      noPreMine +
      latestSubmission +
      noPreMineHour
    );
  }

  /**
   * Check if hash matches difficulty requirements
   * Rule: wherever difficulty has a 0 bit, hash must also have a 0 bit
   */
  private matchesDifficulty(hash: string, difficulty: string): boolean {
    // Get first 4 bytes (8 hex chars) of both
    const hashPrefix = hash.substring(0, 8);
    const diffPrefix = difficulty.substring(0, 8);

    // Convert to numbers
    const hashBits = parseInt(hashPrefix, 16);
    const diffBits = parseInt(diffPrefix, 16);

    // Check: hash OR difficulty should equal difficulty
    // This ensures hash has 0s wherever difficulty has 0s
    return (hashBits | diffBits) === diffBits;
  }

  /**
   * Consolidate rewards from one address to another
   */
  public donateToAddress = async (params: {
    destinationAddress: string;
    originalAddress: string;
    signature: string;
  }): Promise<DonateToScavengerHuntResponse> => {
    try {
      const { destinationAddress, originalAddress, signature } = params;

      this.logger.info(
        `Consolidating rewards from ${originalAddress} to ${destinationAddress}`
      );

      const response = await axios.post(
        `${scavengerHuntBaseUrl}/donate_to/${destinationAddress}/${originalAddress}/${signature}`
      );

      if (response.status === 200) {
        this.logger.info(
          `Successfully consolidated ${response.data.solutions_consolidated} solutions`
        );
        return response.data;
      } else {
        this.logger.error("Donate Response Data:", response.data);
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.logger.error("Response:", error.response);
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
   * Estimate time to solve based on difficulty
   */
  public estimateSolveTime = (params: {
    difficulty: string;
    hashRate: number;
  }): {
    expectedAttempts: number;
    expectedSeconds: number;
    estimatedTime: string;
  } => {
    const { difficulty, hashRate } = params;

    // Count leading zero bits in difficulty
    const difficultyBits = parseInt(difficulty.substring(0, 8), 16);
    let zeroBits = 0;

    for (let i = 31; i >= 0; i--) {
      if ((difficultyBits & (1 << i)) === 0) {
        zeroBits++;
      } else {
        break;
      }
    }

    // Expected attempts = 2^(zero bits)
    const expectedAttempts = Math.pow(2, zeroBits);
    const expectedSeconds = expectedAttempts / hashRate;

    // Format time estimate
    let estimatedTime: string;
    if (expectedSeconds < 60) {
      estimatedTime = `${expectedSeconds.toFixed(1)}s`;
    } else if (expectedSeconds < 3600) {
      estimatedTime = `${(expectedSeconds / 60).toFixed(1)}m`;
    } else {
      estimatedTime = `${(expectedSeconds / 3600).toFixed(1)}h`;
    }

    return {
      expectedAttempts,
      expectedSeconds,
      estimatedTime,
    };
  };
}
