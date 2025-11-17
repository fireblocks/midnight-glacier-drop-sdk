import axios from "axios";
import { scavengerHuntBaseUrl } from "../constants.js";
import {
  RegistrationReceipt,
  SolutionResponse,
  TermsAndConditions,
  ScavangerHuntChallangeResponse,
  DonateToScavengerHuntResponse,
  MidnightApiError,
} from "../types.js";
import { Logger } from "../utils/logger.js";
import { AshMaize } from "../utils/ashmaize.js";
import { ErrorHandler } from "../utils/errorHandler.js";

export class ScavengerHuntService {
  private readonly logger = new Logger("services:scavenger-hunt");
  private readonly errorHandler = new ErrorHandler(
    "scavenger-hunt",
    this.logger
  );

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
      }
      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        "fetching Terms and Conditions"
      );
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
      }
      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `registering address ${params.destinationAddress}`
      );
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
      }
      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "fetching challenge");
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
        `${scavengerHuntBaseUrl}/solution/${address}/${challengeId}/${nonce}`
      );
      this.logger.info("Submit Solution Response:", response.data);
      if (response.status === 200) {
        this.logger.info(`Solution accepted for ${challengeId}`);
        return response.data;
      }
      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `submitting solution for challenge ${params.challengeId}`
      );
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
      }
      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `donating rewards from ${params.originalAddress} to ${params.destinationAddress}`
      );
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
      }
      throw new MidnightApiError(
        `Unexpected response status: ${response.status}`,
        response.status
      );
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        "fetching work to star rates"
      );
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
