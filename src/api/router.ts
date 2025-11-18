import { Router } from "express";
import { ApiController } from "./controllers/controller.js";
import { FbNightApiService } from "./apiService.js";

export const configureRouter = (api: FbNightApiService): Router => {
  const router: Router = Router();
  const apiController = new ApiController(api);

  /**
   * @openapi
   * /api/check/{chain}/{vaultAccountId}:
   *   get:
   *     summary: Check address allocation value for a vault account
   *     tags:
   *       - Claims
   *     parameters:
   *       - in: path
   *         name: chain
   *         required: true
   *         schema:
   *           type: string
   *           enum: [avax, bat, bitcoin, bnb, cardano, ethereum, solana, xrp]
   *         description: Blockchain identifier
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Fireblocks vault account ID
   *     responses:
   *       200:
   *         description: Allocation value retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 value:
   *                   type: number
   *       500:
   *         description: Server error
   */
  router.get(
    "/check/:chain/:vaultAccountId",
    apiController.checkAddressAllocation
  );

  /**
   * @openapi
   * /api/claims/{chain}/{vaultAccountId}:
   *   get:
   *     summary: Get claims history for a vault account
   *     tags:
   *       - Claims
   *     parameters:
   *       - in: path
   *         name: chain
   *         required: true
   *         schema:
   *           type: string
   *           enum: [avax, bat, bitcoin, bnb, cardano, ethereum, solana, xrp]
   *         description: Blockchain identifier
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Fireblocks vault account ID
   *     responses:
   *       200:
   *         description: Claims history retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *       500:
   *         description: Server error
   */
  router.get("/claims/:chain/:vaultAccountId", apiController.getClaimsHistory);

  /**
   * @openapi
   * /api/vaults/{chain}/{vaultAccountId}:
   *   get:
   *     summary: Get Fireblocks vault account addresses
   *     tags:
   *       - Vault
   *     parameters:
   *       - in: path
   *         name: chain
   *         required: true
   *         schema:
   *           type: string
   *           enum: [avax, bat, bitcoin, bnb, cardano, ethereum, solana, xrp]
   *         description: Blockchain identifier
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Fireblocks vault account ID
   *     responses:
   *       200:
   *         description: Vault addresses retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 addresses:
   *                   type: array
   *       500:
   *         description: Server error
   */
  router.get(
    "/vaults/:chain/:vaultAccountId",
    apiController.getVaultAccountAddresses
  );

  /**
   * @openapi
   * /api/transfer:
   *   post:
   *     summary: Transfer NIGHT tokens to a recipient address
   *     tags:
   *       - Claims
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - recipientAddress
   *               - tokenPolicyId
   *               - requiredTokenAmount
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: Source vault account ID
   *                 example: "123"
   *               recipientAddress:
   *                 type: string
   *                 description: Recipient Cardano address (Bech32)
   *                 example: "addr1qxyz..."
   *               tokenPolicyId:
   *                 type: string
   *                 description: Native token policy ID
   *                 example: "abc123..."
   *               requiredTokenAmount:
   *                 type: number
   *                 description: Amount of tokens to transfer
   *                 example: 1000
   *     responses:
   *       200:
   *         description: Transfer successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 transactionHash:
   *                   type: string
   *       500:
   *         description: Server error
   */
  router.post("/transfer", apiController.transferClaims);

  /**
   * @openapi
   * /api/claims/{chain}:
   *   post:
   *     summary: Make NIGHT claims for a vault account
   *     tags:
   *       - Claims
   *     parameters:
   *       - in: path
   *         name: chain
   *         required: true
   *         schema:
   *           type: string
   *           enum: [avax, bat, bitcoin, bnb, cardano, ethereum, solana, xrp]
   *         description: Blockchain identifier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - originVaultAccountId
   *               - destinationAddress
   *             properties:
   *               originVaultAccountId:
   *                 type: string
   *                 description: Source vault account ID
   *                 example: "123"
   *               destinationAddress:
   *                 type: string
   *                 description: Recipient blockchain address
   *                 example: "addr1qxyz..."
   *     responses:
   *       200:
   *         description: Claims processed successfully
   *       500:
   *         description: Server error
   */
  router.post("/claims/:chain", apiController.makeClaims);

  /**
   * @openapi
   * /api/scavenger-hunt/challenge:
   *   get:
   *     summary: Get the current scavenger hunt challenge
   *     tags:
   *       - Scavenger Hunt
   *     responses:
   *       200:
   *         description: Current challenge retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *       500:
   *         description: Server error
   */
  router.get(
    "/scavenger-hunt/challenge",
    apiController.getScavengerHuntChallenge
  );

  /**
   * @openapi
   * /api/scavenger-hunt/register/{vaultAccountId}:
   *   post:
   *     summary: Register a Cardano address for scavenger hunt participation
   *     tags:
   *       - Scavenger Hunt
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Fireblocks vault account ID
   *       - in: query
   *         name: index
   *         required: false
   *         schema:
   *           type: number
   *           default: 0
   *         description: Address index to register (default is 0)
   *     responses:
   *       200:
   *         description: Registration successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *       500:
   *         description: Server error
   */
  router.post(
    "/scavenger-hunt/register/:vaultAccountId",
    apiController.registerScavengerHuntAddress
  );

  /**
   * @openapi
   * /api/scavenger-hunt/solve/{vaultAccountId}:
   *   post:
   *     summary: Solve the current scavenger hunt challenge
   *     tags:
   *       - Scavenger Hunt
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Fireblocks vault account ID
   *       - in: query
   *         name: index
   *         required: false
   *         schema:
   *           type: number
   *           default: 0
   *         description: Address index to use for solving (default is 0)
   *     responses:
   *       200:
   *         description: Challenge solved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *                   properties:
   *                     nonce:
   *                       type: string
   *                     hash:
   *                       type: string
   *                     attempts:
   *                       type: number
   *                     timeMs:
   *                       type: number
   *       500:
   *         description: Server error
   */
  router.post(
    "/scavenger-hunt/solve/:vaultAccountId",
    apiController.solveScavengerHuntChallenge
  );

  /**
   * @openapi
   * /api/scavenger-hunt/donate-to/{vaultAccountId}/{destAddress}:
   *   post:
   *     summary: Donate scavenger hunt rewards to another address
   *     tags:
   *       - Scavenger Hunt
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Source vault account ID
   *       - in: path
   *         name: destAddress
   *         required: true
   *         schema:
   *           type: string
   *         description: Destination Cardano address
   *       - in: query
   *         name: index
   *         required: false
   *         schema:
   *           type: number
   *           default: 0
   *         description: Source address index (default is 0)
   *     responses:
   *       200:
   *         description: Donation successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *       500:
   *         description: Server error
   */
  router.post(
    "/scavenger-hunt/donate-to/:vaultAccountId/:destAddress",
    apiController.donateToScavengerHunt
  );

  /**
   * @openapi
   * /api/thaws/phase-config:
   *   get:
   *     summary: Get current redemption phase configuration
   *     tags:
   *       - Thaws/Redemption
   *     responses:
   *       200:
   *         description: Phase configuration retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *                   properties:
   *                     genesis_timestamp:
   *                       type: number
   *                     jitter_strata_count:
   *                       type: number
   *                     redemption_increment_period:
   *                       type: number
   *                     redemption_increments:
   *                       type: number
   *                     redemption_initial_delay:
   *                       type: number
   *       500:
   *         description: Server error
   *       503:
   *         description: Redemption phase not started yet
   */
  router.get("/thaws/phase-config", apiController.getPhaseConfig);

  /**
   * @openapi
   * /api/thaws/thaw-schedule/{vaultAccountId}:
   *   get:
   *     summary: Get thaw schedule for a vault account address
   *     tags:
   *       - Thaws/Redemption
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Fireblocks vault account ID
   *       - in: query
   *         name: index
   *         required: false
   *         schema:
   *           type: number
   *           default: 0
   *         description: Address index to check (default is 0)
   *     responses:
   *       200:
   *         description: Thaw schedule retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *                   properties:
   *                     number_of_claimed_allocations:
   *                       type: number
   *                     thaws:
   *                       type: array
   *                       items:
   *                         type: object
   *       400:
   *         description: Invalid request or no redeemable thaws
   *       404:
   *         description: Address not found
   *       500:
   *         description: Server error
   *       503:
   *         description: Redemption phase not started yet
   */
  router.get(
    "/thaws/thaw-schedule/:vaultAccountId",
    apiController.getThawSchedule
  );

  /**
   * @openapi
   * /api/thaws/status/{destAddress}/{transactionId}:
   *   get:
   *     summary: Get the status of a thawing transaction
   *     tags:
   *       - Thaws/Redemption
   *     parameters:
   *       - in: path
   *         name: destAddress
   *         required: true
   *         schema:
   *           type: string
   *         description: Cardano destination address (Bech32 format)
   *       - in: path
   *         name: transactionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Transaction ID (hex-encoded)
   *     responses:
   *       200:
   *         description: Transaction status retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *                   properties:
   *                     redeemed_amount:
   *                       type: number
   *                     status:
   *                       type: string
   *                       enum: [queued, confirmed, failed, confirming, submitted]
   *                     transaction_id:
   *                       type: string
   *       400:
   *         description: Invalid request
   *       404:
   *         description: Transaction or address not found
   *       500:
   *         description: Server error
   */
  router.get(
    "/thaws/status/:destAddress/:transactionId",
    apiController.getThawStatus
  );

  /**
   * @openapi
   * /api/thaws/redeem/{vaultAccountId}:
   *   post:
   *     summary: Redeem NIGHT tokens during the redemption window
   *     tags:
   *       - Thaws/Redemption
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Fireblocks vault account ID
   *       - in: query
   *         name: index
   *         required: false
   *         schema:
   *           type: number
   *           default: 0
   *         description: Address index to redeem from (default is 0)
   *     responses:
   *       200:
   *         description: Redemption transaction submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: object
   *                   properties:
   *                     estimated_submission_time:
   *                       type: number
   *                     transaction_id:
   *                       type: string
   *       400:
   *         description: Invalid request or no redeemable thaws
   *       404:
   *         description: Address not found
   *       500:
   *         description: Server error
   *       503:
   *         description: Redemption window not open
   */
  router.post("/thaws/redeem/:vaultAccountId", apiController.redeemNight);

  return router;
};
