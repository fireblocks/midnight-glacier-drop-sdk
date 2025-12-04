import axios from "axios";
import { scavengerHuntBaseUrl } from "../constants.js";
import {
  RegistrationReceipt,
  SolutionResponse,
  TermsAndConditions,
  ScavangerHuntChallangeResponse,
  DonateToScavengerHuntResponse,
  MidnightApiError,
} from "../types/index.js";
import { Logger } from "../utils/logger.js";
import { AshMaize } from "../utils/ashmaize.js";
import { ErrorHandler } from "../utils/errorHandler.js";

/**
 * Service for interacting with the Midnight Scavenger Hunt mining system.
 *
 * The Scavenger Hunt is a proof-of-work mining system for earning NIGHT tokens on the
 * Midnight blockchain. This service provides comprehensive functionality for:
 * - Address registration and terms acceptance
 * - Challenge retrieval and mining
 * - Solution submission and verification
 * - Reward consolidation between addresses
 * - Earnings calculation and mining statistics
 *
 * The mining process uses the AshMaize hash algorithm and requires finding a nonce that,
 * when combined with challenge parameters, produces a hash matching specific difficulty
 * requirements (bit masking pattern).
 *
 * @class ScavengerHuntService
 * @example
 * ```typescript
 * const huntService = new ScavengerHuntService();
 *
 * // 1. Get and accept terms and conditions
 * const terms = await huntService.getTermsAndConditions('1-0');
 * console.log('Terms:', terms.content);
 *
 * // 2. Register Cardano address
 * const registration = await huntService.register({
 *   destinationAddress: 'addr1qx...',
 *   signature: '845846a201...',
 *   pubkey: '5820a3b4c5d6...'
 * });
 * console.log('Registered:', registration.registered);
 *
 * // 3. Get current challenge
 * const challenge = await huntService.getChallenge();
 * console.log(`Challenge ${challenge.challenge.challenge_number}, Day ${challenge.current_day}`);
 *
 * // 4. Solve the challenge (mine for solution)
 * const solution = await huntService.solveChallenge({
 *   address: 'addr1qx...',
 *   challenge: challenge.challenge,
 *   onProgress: (nonce, hashRate) => {
 *     console.log(`Mining: ${nonce} attempts, ${hashRate.toFixed(2)} H/s`);
 *   }
 * });
 *
 * // 5. Submit solution
 * const result = await huntService.submitSolution({
 *   address: 'addr1qx...',
 *   challengeId: challenge.challenge.challenge_id,
 *   nonce: solution.nonce
 * });
 *
 * // 6. Calculate earnings
 * const earnings = await huntService.calculateEarnings({
 *   1: 5,  // 5 solutions on day 1
 *   2: 3   // 3 solutions on day 2
 * });
 * console.log(`Total earned: ${earnings.totalNight} NIGHT`);
 * ```
 */
export class ScavengerHuntService {
  private readonly logger = new Logger("services:scavenger-hunt");
  private readonly errorHandler = new ErrorHandler(
    "scavenger-hunt",
    this.logger
  );

  /**
   * Retrieves the Terms and Conditions document that must be signed for participation.
   *
   * Before registering for the scavenger hunt, participants must accept the terms and
   * conditions by signing the document content. This method fetches the T&C document
   * for a specific version.
   *
   * @param version - The T&C version string (defaults to "1-0")
   * @returns A Promise resolving to the TermsAndConditions object containing:
   * - version: The version string
   * - content: The full terms and conditions text
   * - hash: Optional hash of the content for verification
   * - effectiveDate: When these terms became effective
   *
   * @throws {MidnightApiError} When API returns a non-200 status code
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   *
   * // Get default version
   * const terms = await service.getTermsAndConditions();
   * console.log('Terms content:', terms.content);
   * console.log('Version:', terms.version);
   *
   * // Get specific version
   * const v1_1Terms = await service.getTermsAndConditions('1-1');
   *
   * // Sign the terms and register
   * const terms = await service.getTermsAndConditions('1-0');
   * const signature = await fireblocksService.signMessage({
   *   message: terms.content,
   *   // ... other params
   * });
   *
   * await service.register({
   *   destinationAddress: address,
   *   signature: signature.signature.fullSig,
   *   pubkey: signature.publicKey
   * });
   * ```
   *
   * @remarks
   * The terms content should be presented to users for review before they sign.
   * The signed message is used during registration to prove acceptance of terms.
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
   * Registers a Cardano address for scavenger hunt participation.
   *
   * Registration is required before an address can submit solutions and earn rewards.
   * The registration includes a cryptographic signature proving ownership of the address
   * and acceptance of the terms and conditions.
   *
   * The signature must be generated using CIP-8/30 compliant message signing, typically
   * through Fireblocks or a Cardano wallet.
   *
   * @param params - Registration parameters
   * @param params.destinationAddress - The Cardano address to register (must be the signing address)
   * @param params.signature - COSE_Sign1 hex string proving address ownership and T&C acceptance
   * @param params.pubkey - Public key corresponding to the signature, hex-encoded
   *
   * @returns A Promise resolving to a RegistrationReceipt containing:
   * - registered: Boolean indicating successful registration
   * - address: The registered Cardano address
   * - timestamp: Registration timestamp
   * - status: Registration status message
   *
   * @throws {MidnightApiError} When API returns an error status code
   * @throws {Error} When the signature is invalid or address is already registered
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   * const fireblocksService = new FireblocksService(config);
   *
   * // 1. Get terms to sign
   * const terms = await service.getTermsAndConditions();
   *
   * // 2. Sign terms with Fireblocks
   * const signature = await fireblocksService.signMessage({
   *   chain: SupportedBlockchains.CARDANO,
   *   originVaultAccountId: '123',
   *   destinationAddress: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   message: terms.content,
   *   amount: 0,
   *   noteType: NoteType.REGISTER
   * });
   *
   * // 3. Register with signed terms
   * const receipt = await service.register({
   *   destinationAddress: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   signature: signature.signature.fullSig,
   *   pubkey: signature.publicKey!
   * });
   *
   * if (receipt.registered) {
   *   console.log('Successfully registered at:', receipt.timestamp);
   * }
   *
   * // Handle already registered
   * try {
   *   await service.register({...});
   * } catch (error) {
   *   if (error.message.includes('already registered')) {
   *     console.log('Address is already registered');
   *   }
   * }
   * ```
   *
   * @remarks
   * Each address can only be registered once. Attempting to register an already
   * registered address will result in an error.
   *
   * The signature must be generated from the exact terms content retrieved from
   * getTermsAndConditions() for the registration to be valid.
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
   * Retrieves the current active scavenger hunt challenge.
   *
   * Challenges change periodically (typically daily) and each challenge has specific
   * difficulty parameters that determine how hard it is to mine a solution. The challenge
   * includes all parameters needed for mining: difficulty target, anti-premine settings,
   * and challenge identification.
   *
   * @returns A Promise resolving to ScavangerHuntChallangeResponse containing:
   * - current_day: The current day number of the hunt
   * - challenge: The active challenge object with:
   *   - challenge_id: Unique identifier for this challenge
   *   - challenge_number: Sequential challenge number
   *   - difficulty: Hex string representing required hash bit pattern
   *   - no_pre_mine: Anti-premine token to prevent mining before official start
   *   - no_pre_mine_hour: Time restriction for anti-premine
   *   - latest_submission: Timestamp of most recent solution
   *
   * @throws {MidnightApiError} When API returns a non-200 status code
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   *
   * // Get current challenge
   * const response = await service.getChallenge();
   * console.log(`Day ${response.current_day}`);
   * console.log(`Challenge #${response.challenge.challenge_number}`);
   * console.log(`Difficulty: ${response.challenge.difficulty}`);
   *
   * // Use challenge for mining
   * const solution = await service.solveChallenge({
   *   address: 'addr1qx...',
   *   challenge: response.challenge
   * });
   *
   * // Estimate solve time
   * const estimate = service.estimateSolveTime({
   *   difficulty: response.challenge.difficulty,
   *   hashRate: 1000 // Your mining hash rate
   * });
   * console.log(`Estimated time: ${estimate.estimatedTime}`);
   *
   * // Poll for new challenges
   * setInterval(async () => {
   *   const newChallenge = await service.getChallenge();
   *   if (newChallenge.current_day !== response.current_day) {
   *     console.log('New day started, new challenge available!');
   *   }
   * }, 60000); // Check every minute
   * ```
   *
   * @remarks
   * The challenge should be fetched fresh before starting each mining attempt to ensure
   * you're working on the current active challenge. Mining solutions for expired challenges
   * will be rejected.
   *
   * The difficulty value is a hex string that defines a bit pattern - the mined hash must
   * have zeros in all positions where the difficulty has zeros.
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
   * Submits a mined solution (nonce) for a challenge to earn rewards.
   *
   * After successfully mining a valid nonce using solveChallenge(), this method submits
   * the solution to the scavenger hunt API for verification and reward crediting.
   * Solutions are verified by the server to ensure they meet the difficulty requirements.
   *
   * @param params - Solution submission parameters
   * @param params.address - The registered Cardano address submitting the solution
   * @param params.challengeId - The unique identifier of the challenge being solved
   * @param params.nonce - The hex-encoded nonce that produces a valid hash (16 chars, zero-padded)
   *
   * @returns A Promise resolving to SolutionResponse containing:
   * - accepted: Boolean indicating if solution was accepted
   * - reward: STAR tokens earned for this solution
   * - hash: The resulting hash from the nonce
   * - timestamp: Submission timestamp
   * - message: Status or error message
   *
   * @throws {MidnightApiError} When API rejects the solution or returns error status
   * @throws {Error} When the nonce is invalid or doesn't meet difficulty requirements
   * @throws {Error} When the address is not registered
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   *
   * // Get challenge and solve it
   * const challengeResponse = await service.getChallenge();
   * const solution = await service.solveChallenge({
   *   address: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   challenge: challengeResponse.challenge
   * });
   *
   * console.log(`Found solution: ${solution.nonce} in ${solution.timeMs}ms`);
   *
   * // Submit the solution
   * const result = await service.submitSolution({
   *   address: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   challengeId: challengeResponse.challenge.challenge_id,
   *   nonce: solution.nonce
   * });
   *
   * if (result.accepted) {
   *   console.log(`Solution accepted! Earned ${result.reward} STAR`);
   * }
   *
   * // Handle rejection
   * try {
   *   await service.submitSolution({...});
   * } catch (error) {
   *   console.error('Solution rejected:', error.message);
   *   // Nonce might be invalid or challenge expired
   * }
   *
   * // Automated mining loop
   * while (true) {
   *   const challenge = await service.getChallenge();
   *   const solution = await service.solveChallenge({
   *     address: myAddress,
   *     challenge: challenge.challenge
   *   });
   *
   *   const result = await service.submitSolution({
   *     address: myAddress,
   *     challengeId: challenge.challenge.challenge_id,
   *     nonce: solution.nonce
   *   });
   *
   *   console.log(`Reward: ${result.reward}`);
   * }
   * ```
   *
   * @remarks
   * Solutions must be submitted for the currently active challenge. If a new challenge
   * starts while mining, solutions for the old challenge will be rejected.
   *
   * The nonce must be exactly 16 hex characters (zero-padded) representing a 64-bit number.
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
   * Mines for a valid nonce that satisfies the challenge difficulty requirements.
   *
   * This method performs proof-of-work mining by iterating through nonce values and
   * hashing each one with the challenge parameters using the AshMaize algorithm. It
   * continues until finding a hash that matches the difficulty bit pattern (zeros in
   * required positions).
   *
   * The mining process:
   * 1. Initializes AshMaize hasher with anti-premine token
   * 2. Iterates through nonces starting from 0
   * 3. Builds preimage: nonce + address + challengeId + difficulty + timestamps
   * 4. Hashes preimage with AshMaize
   * 5. Checks if hash matches difficulty pattern
   * 6. Returns when match found or maxAttempts reached
   *
   * @param params - Mining parameters
   * @param params.address - The registered Cardano address mining the challenge
   * @param params.challenge - The challenge object from getChallenge()
   * @param params.onProgress - Optional callback invoked periodically with mining progress
   *   (nonce: current nonce value, hashRate: hashes per second)
   * @param params.maxAttempts - Optional maximum number of nonces to try before giving up
   *
   * @returns A Promise resolving to mining result containing:
   * - nonce: The hex-encoded nonce that solved the challenge (16 chars)
   * - hash: The resulting hash that matches difficulty
   * - attempts: Total number of hashes computed (as BigInt)
   * - timeMs: Time taken to find solution in milliseconds
   *
   * @throws {Error} When maxAttempts is reached without finding solution
   * @throws {Error} When AshMaize initialization fails
   * @throws {Error} When challenge parameters are invalid
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   *
   * // Basic mining
   * const challenge = await service.getChallenge();
   * const solution = await service.solveChallenge({
   *   address: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   challenge: challenge.challenge
   * });
   *
   * console.log(`Solution found: ${solution.nonce}`);
   * console.log(`Attempts: ${solution.attempts.toLocaleString()}`);
   * console.log(`Time: ${(solution.timeMs / 1000).toFixed(2)}s`);
   *
   * // Mining with progress tracking
   * const solution = await service.solveChallenge({
   *   address: 'addr1qx...',
   *   challenge: challenge.challenge,
   *   onProgress: (nonce, hashRate) => {
   *     console.log(`Progress: ${nonce.toLocaleString()} attempts, ${hashRate.toFixed(2)} H/s`);
   *   }
   * });
   *
   * // Mining with timeout
   * const solution = await service.solveChallenge({
   *   address: 'addr1qx...',
   *   challenge: challenge.challenge,
   *   maxAttempts: 1_000_000n // Stop after 1 million attempts
   * });
   *
   * // Estimate before mining
   * const estimate = service.estimateSolveTime({
   *   difficulty: challenge.challenge.difficulty,
   *   hashRate: 500 // Your typical hash rate
   * });
   *
   * if (estimate.expectedSeconds > 3600) {
   *   console.log('This will take over an hour, skipping...');
   * } else {
   *   const solution = await service.solveChallenge({
   *     address: myAddress,
   *     challenge: challenge.challenge
   *   });
   * }
   *
   * // Parallel mining (multiple workers)
   * const workers = 4;
   * const solutions = await Promise.race(
   *   Array.from({ length: workers }, (_, i) =>
   *     service.solveChallenge({
   *       address: 'addr1qx...',
   *       challenge: challenge.challenge,
   *       maxAttempts: 10_000_000n
   *     })
   *   )
   * );
   * ```
   *
   * @remarks
   * Mining is CPU-intensive and will block the event loop. Consider running in a worker
   * thread or using multiple processes for parallel mining.
   *
   * The progress callback is invoked approximately once per second to avoid performance
   * overhead from frequent callbacks.
   *
   * Hash rate varies by CPU and difficulty. Typical rates: 100-5000 H/s per core.
   * Expected time = 2^(difficulty zero bits) / hash rate.
   *
   * The AshMaize hasher is initialized once per mining session with the no_pre_mine token
   * to prevent precomputation of hashes before the challenge officially starts.
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
   * Builds the preimage string for hashing during mining.
   *
   * The preimage is constructed by concatenating all challenge parameters and the nonce
   * in a specific order. This preimage is then hashed with AshMaize to produce the
   * candidate hash for difficulty checking.
   *
   * @param params - Preimage components
   * @param params.nonce - Hex-encoded nonce (16 chars)
   * @param params.address - Cardano address
   * @param params.challengeId - Challenge identifier
   * @param params.difficulty - Difficulty hex string
   * @param params.noPreMine - Anti-premine token
   * @param params.latestSubmission - Latest submission timestamp
   * @param params.noPreMineHour - Anti-premine hour restriction
   *
   * @returns The concatenated preimage string
   *
   * @private
   *
   * @remarks
   * The preimage format is fixed and must match the server's verification logic.
   * Changing the order or format will result in invalid solutions.
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
   * Checks if a hash meets the difficulty requirements using bit masking.
   *
   * The difficulty check follows the rule: wherever the difficulty has a 0 bit,
   * the hash must also have a 0 bit. This is verified using bitwise OR:
   * (hash | difficulty) should equal difficulty if hash has zeros in all required positions.
   *
   * Only the first 4 bytes (8 hex chars) are compared for performance.
   *
   * @param hash - The hash string to check (hex)
   * @param difficulty - The difficulty pattern (hex)
   * @returns True if hash matches difficulty requirements, false otherwise
   *
   * @private
   *
   * @example
   * ```typescript
   * // Difficulty: 0x00FF0000 requires first byte to be all zeros
   * matchesDifficulty('0x00123456...', '0x00FF0000...') // true
   * matchesDifficulty('0xFF123456...', '0x00FF0000...') // false
   * ```
   *
   * @remarks
   * This is a critical performance path in mining - it's called once per nonce attempt.
   * Only checking the first 4 bytes balances difficulty requirements with performance.
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
   * Consolidates rewards from one address to another (donation/transfer).
   *
   * This method allows transferring all earned solutions and rewards from one registered
   * address to another. Useful for consolidating rewards from multiple addresses or
   * donating earnings to another participant. Requires a signature proving ownership
   * of the source address.
   *
   * @param params - Donation parameters
   * @param params.destinationAddress - The address to receive the consolidated rewards
   * @param params.originalAddress - The address donating/transferring its rewards
   * @param params.signature - Signature from originalAddress proving authorization
   *
   * @returns A Promise resolving to DonateToScavengerHuntResponse containing:
   * - success: Boolean indicating successful consolidation
   * - solutions_consolidated: Number of solutions transferred
   * - total_star_transferred: Amount of STAR tokens moved
   * - timestamp: Transaction timestamp
   *
   * @throws {MidnightApiError} When API returns error status
   * @throws {Error} When signature is invalid or addresses not registered
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   * const fireblocksService = new FireblocksService(config);
   *
   * // Sign donation authorization
   * const donationMessage = `Transfer rewards from ${fromAddress} to ${toAddress}`;
   * const signature = await fireblocksService.signMessage({
   *   chain: SupportedBlockchains.CARDANO,
   *   originVaultAccountId: '123',
   *   destinationAddress: toAddress,
   *   message: donationMessage,
   *   amount: 0,
   *   noteType: NoteType.DONATE
   * });
   *
   * // Consolidate rewards
   * const result = await service.donateToAddress({
   *   destinationAddress: 'addr1qy9prvx8ufwutkwxx9cmmuuajaqmjqwujqlp9d8pvg6gupczjjrx',
   *   originalAddress: 'addr1qx2kd88w9p6m7c8xc6qzn2g3vxy9wjsa9fkw32ylm9z8r3qp4c5tc',
   *   signature: signature.signature.fullSig
   * });
   *
   * console.log(`Transferred ${result.solutions_consolidated} solutions`);
   * console.log(`Total STAR: ${result.total_star_transferred}`);
   *
   * // Consolidate from multiple addresses
   * const addresses = ['addr1qx...', 'addr1qy...', 'addr1qz...'];
   * const mainAddress = 'addr1main...';
   *
   * for (const addr of addresses) {
   *   const sig = await signDonation(addr, mainAddress);
   *   const result = await service.donateToAddress({
   *     destinationAddress: mainAddress,
   *     originalAddress: addr,
   *     signature: sig
   *   });
   *   console.log(`Consolidated from ${addr}: ${result.solutions_consolidated} solutions`);
   * }
   * ```
   *
   * @remarks
   * This operation is irreversible - once rewards are transferred, they cannot be
   * moved back to the original address.
   *
   * Both addresses must be registered in the scavenger hunt before consolidation.
   *
   * The signature must prove ownership of the originalAddress (source of funds).
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
   * Retrieves the daily reward rates (STAR tokens per solution).
   *
   * The scavenger hunt has different reward rates for each day, typically decreasing
   * over time. This method fetches the complete schedule of how many STAR tokens are
   * awarded per solution for each day of the hunt.
   *
   * @returns A Promise resolving to an array of numbers where:
   * - Index represents day number (0-indexed, so index 0 = day 1)
   * - Value represents STAR tokens earned per solution on that day
   *
   * @throws {MidnightApiError} When API returns error status
   * @throws {Error} When network request fails
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   *
   * const rates = await service.getWorkToStarRate();
   * console.log(`Total days: ${rates.length}`);
   * console.log(`Day 1 rate: ${rates[0]} STAR per solution`);
   * console.log(`Day 10 rate: ${rates[9]} STAR per solution`);
   *
   * // Calculate potential earnings
   * const solutionsPerDay = 5;
   * const day = 1;
   * const dayIndex = day - 1;
   * const earnings = solutionsPerDay * rates[dayIndex];
   * const nightTokens = earnings / 1_000_000;
   * console.log(`${solutionsPerDay} solutions on day ${day} = ${nightTokens} NIGHT`);
   *
   * // Find best day to mine
   * const maxRate = Math.max(...rates);
   * const bestDay = rates.indexOf(maxRate) + 1;
   * console.log(`Best day to mine: Day ${bestDay} at ${maxRate} STAR/solution`);
   *
   * // Track rate changes
   * rates.forEach((rate, index) => {
   *   const day = index + 1;
   *   console.log(`Day ${day}: ${rate} STAR`);
   * });
   * ```
   *
   * @remarks
   * STAR is the internal point system, with 1,000,000 STAR = 1 NIGHT token.
   *
   * Rates typically decrease over time to incentivize early participation.
   *
   * The returned array length indicates the total duration of the scavenger hunt.
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
   * Calculates estimated NIGHT token earnings from completed solutions.
   *
   * This method takes a record of solutions submitted per day and calculates the total
   * earnings in both STAR points and NIGHT tokens. It fetches the current reward rate
   * schedule and applies it to each day's solution count, providing a detailed breakdown.
   *
   * @param solutionsByDay - Object mapping day numbers to solution counts
   *   Example: { 1: 5, 2: 3, 5: 10 } means 5 solutions day 1, 3 on day 2, 10 on day 5
   *
   * @returns A Promise resolving to earnings breakdown containing:
   * - totalStar: Total STAR points earned across all days
   * - totalNight: Total NIGHT tokens earned (totalStar / 1,000,000)
   * - breakdown: Array of per-day earnings with:
   *   - day: Day number
   *   - solutions: Number of solutions submitted that day
   *   - star: STAR points earned that day
   *   - night: NIGHT tokens earned that day
   *
   * @throws {Error} When fetching work-to-star rates fails
   * @throws {Error} When calculation errors occur
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   *
   * // Calculate earnings for specific days
   * const earnings = await service.calculateEarnings({
   *   1: 5,   // 5 solutions on day 1
   *   2: 3,   // 3 solutions on day 2
   *   3: 8,   // 8 solutions on day 3
   *   5: 12   // 12 solutions on day 5 (skipped day 4)
   * });
   *
   * console.log(`Total earned: ${earnings.totalNight.toFixed(6)} NIGHT`);
   * console.log(`Total STAR: ${earnings.totalStar.toLocaleString()}`);
   *
   * // Show breakdown
   * earnings.breakdown.forEach(day => {
   *   console.log(
   *     `Day ${day.day}: ${day.solutions} solutions = ${day.night.toFixed(6)} NIGHT`
   *   );
   * });
   *
   * // Track cumulative earnings
   * const solutionsByDay = {};
   * let cumulativeNight = 0;
   *
   * for (let day = 1; day <= 30; day++) {
   *   // Assume 5 solutions per day
   *   solutionsByDay[day] = 5;
   *
   *   const earnings = await service.calculateEarnings(solutionsByDay);
   *   cumulativeNight = earnings.totalNight;
   *
   *   console.log(`After day ${day}: ${cumulativeNight.toFixed(2)} NIGHT total`);
   * }
   *
   * // Project future earnings
   * const currentSolutions = { 1: 5, 2: 3 };
   * const current = await service.calculateEarnings(currentSolutions);
   *
   * // Add projected solutions for remaining days
   * for (let day = 3; day <= 30; day++) {
   *   currentSolutions[day] = 5; // Assume 5 per day
   * }
   * const projected = await service.calculateEarnings(currentSolutions);
   *
   * console.log(`Current: ${current.totalNight.toFixed(2)} NIGHT`);
   * console.log(`Projected: ${projected.totalNight.toFixed(2)} NIGHT`);
   * ```
   *
   * @remarks
   * The conversion rate is fixed: 1,000,000 STAR = 1 NIGHT token.
   *
   * Days not included in solutionsByDay are assumed to have 0 solutions.
   *
   * This method fetches the latest reward rates, so calculations are always current.
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
   * Estimates the time required to solve a challenge based on difficulty and hash rate.
   *
   * Provides a statistical estimate of how long mining will take given the challenge
   * difficulty (number of leading zero bits required) and the miner's hash rate.
   * The actual time can vary significantly due to the probabilistic nature of mining.
   *
   * @param params - Estimation parameters
   * @param params.difficulty - The difficulty hex string from the challenge
   * @param params.hashRate - The mining hash rate in hashes per second
   *
   * @returns An object containing:
   * - expectedAttempts: Average number of hashes needed (2^zero_bits)
   * - expectedSeconds: Average time in seconds (attempts / hash_rate)
   * - estimatedTime: Human-readable time string (e.g., "5.2m", "1.3h")
   *
   * @example
   * ```typescript
   * const service = new ScavengerHuntService();
   *
   * // Get challenge and estimate
   * const challenge = await service.getChallenge();
   * const estimate = service.estimateSolveTime({
   *   difficulty: challenge.challenge.difficulty,
   *   hashRate: 1000 // 1000 H/s
   * });
   *
   * console.log(`Expected attempts: ${estimate.expectedAttempts.toLocaleString()}`);
   * console.log(`Expected time: ${estimate.estimatedTime}`);
   *
   * // Decide whether to mine
   * if (estimate.expectedSeconds > 3600) {
   *   console.log('Too slow, skipping this challenge');
   * } else {
   *   console.log('Starting mining...');
   *   const solution = await service.solveChallenge({...});
   * }
   *
   * // Compare different hash rates
   * const hashRates = [100, 500, 1000, 5000];
   * hashRates.forEach(rate => {
   *   const est = service.estimateSolveTime({
   *     difficulty: challenge.challenge.difficulty,
   *     hashRate: rate
   *   });
   *   console.log(`${rate} H/s: ${est.estimatedTime}`);
   * });
   *
   * // Benchmark your system
   * const startTime = Date.now();
   * const benchmarkSolution = await service.solveChallenge({
   *   address: 'addr1qx...',
   *   challenge: challenge.challenge,
   *   maxAttempts: 10000n
   * });
   * const actualHashRate = Number(benchmarkSolution.attempts) /
   *   (benchmarkSolution.timeMs / 1000);
   * console.log(`Your hash rate: ${actualHashRate.toFixed(2)} H/s`);
   * ```
   *
   * @remarks
   * This is a statistical average - actual mining time can be much shorter or longer.
   * Mining follows a geometric distribution, so there's always a chance of finding
   * the solution on the first try or taking 10x the expected time.
   *
   * The estimate only considers the first 32 bits of the difficulty pattern.
   *
   * Hash rate varies by CPU model, core count, and system load. Benchmark your
   * specific hardware to get accurate estimates.
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
