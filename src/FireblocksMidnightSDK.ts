import {
  ConfigurationOptions,
  SignedMessageAlgorithmEnum,
  TransactionOperation,
  TransferPeerPathType,
  VaultWalletAddress,
} from "@fireblocks/ts-sdk";
import * as lucid from "lucid-cardano";
import { FireblocksService } from "./services/fireblocks.service.js";
import { ClaimApiService } from "./services/claim.api.service.js";
import { ProvetreeService } from "./services/provetree.service.js";
import {
  checkAddressAllocationOpts,
  ClaimHistoryResponse,
  getClaimsHistoryOpts,
  getVaultAccountAddressesOpts,
  makeClaimsOpts,
  registerScavengerHuntAddressOpts,
  RegistrationReceipt,
  ScavangerHuntChallangeResponse,
  solveScavengerHuntChallengeOpts,
  SubmitClaimResponse,
  SupportedAssetIds,
  SupportedBlockchains,
  TransferClaimsResponse,
  trasnsferClaimsOpts,
} from "./types.js";
import { nightTokenName, tokenTransactionFee } from "./constants.js";
import { getAssetIdsByBlockchain } from "./utils/general.js";
import {
  buildCoseSign1,
  calculateTtl,
  fetchAndSelectUtxos,
} from "./utils/cardano.utils.js";

import { config } from "./utils/config.js";
import { ScavengerHuntService } from "./services/scavengerHunt.service.js";
import { Logger } from "./utils/logger.js";

export class FireblocksMidnightSDK {
  private fireblocksService: FireblocksService;
  private claimApiService: ClaimApiService;
  private provetreeService: ProvetreeService;
  private scavengerHuntService: ScavengerHuntService;
  private assetId: SupportedAssetIds;
  private vaultAccountId: string;
  private address: string;
  private blockfrostProjectId?: string;
  private lucid?: lucid.Lucid;
  private readonly logger = new Logger("app:fireblocks-midnight-sdk");

  constructor(params: {
    fireblocksService: FireblocksService;
    claimApiService: ClaimApiService;
    provetreeService: ProvetreeService;
    scavengerHuntService: ScavengerHuntService;
    assetId: SupportedAssetIds;
    vaultAccountId: string;
    address: string;
    blockfrostProjectId?: string;
  }) {
    this.fireblocksService = params.fireblocksService;
    this.claimApiService = params.claimApiService;
    this.provetreeService = params.provetreeService;
    this.scavengerHuntService = params.scavengerHuntService;
    this.assetId = params.assetId;
    this.vaultAccountId = params.vaultAccountId;
    this.address = params.address;
    this.blockfrostProjectId = params.blockfrostProjectId;
  }

  /**
   * Creates a new instance of `FireblocksMidnightSDK` with the provided parameters.
   *
   * This method initializes required services, validates configuration, and sets up the SDK instance
   * for interacting with Fireblocks and Blockfrost. It throws an error if any required configuration
   * is missing or if the blockchain is unsupported.
   *
   * @param params - The parameters required to create the SDK instance.
   * @param {string} params.vaultAccountId - The Fireblocks vault account ID to use.
   * @param {SupportedBlockchains} params.chain - The blockchain to operate on. Must be a supported blockchain.
   * @returns A promise that resolves to a configured `FireblocksMidnightSDK` instance.
   * @throws {Error} If the blockchain is unsupported or required configuration is missing.
   */
  public static create = async (params: {
    fireblocksConfig: ConfigurationOptions;
    vaultAccountId: string;
    chain: SupportedBlockchains;
  }): Promise<FireblocksMidnightSDK> => {
    try {
      const logger = new Logger(`app:${params.chain}:fireblocks-midnight-sdk`);

      const { fireblocksConfig, vaultAccountId, chain } = params;
      const assetId = getAssetIdsByBlockchain(chain);
      if (!assetId) {
        throw new Error(`Unsupported blockchain: ${chain}`);
      }

      const fireblocksService = new FireblocksService(fireblocksConfig);
      const address = await fireblocksService.getVaultAccountAddress(
        vaultAccountId,
        assetId
      );

      const blockfrostProjectId = config.BLOCKFROST_PROJECT_ID;
      if (!blockfrostProjectId) {
        logger.warn(
          "BLOCKFROST_PROJECT_ID is not configured. Some features may not work."
        );
      }

      const claimApiService = new ClaimApiService();
      const provetreeService = new ProvetreeService();
      const scavengerHuntService = new ScavengerHuntService();

      const sdkInstance = new FireblocksMidnightSDK({
        fireblocksService,
        claimApiService,
        provetreeService,
        scavengerHuntService,
        assetId,
        vaultAccountId,
        address,
        blockfrostProjectId,
      });

      // Only initialize Lucid if blockfrostProjectId is available
      if (blockfrostProjectId) {
        const network = blockfrostProjectId.includes("mainnet")
          ? "Mainnet"
          : blockfrostProjectId.includes("preprod")
          ? "Preprod"
          : "Preview";
        sdkInstance.lucid = await lucid.Lucid.new(
          new lucid.Blockfrost(blockfrostProjectId, blockfrostProjectId),
          network
        );
      }
      return sdkInstance;
    } catch (error: any) {
      throw new Error(
        `Error creating FireblocksMidnightSDK: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  /**
   * Checks if the current address is valid for the specified blockchain and fetches its allocation value.
   *
   * @param {SupportedBlockchains} chain - The blockchain to check the address against.
   * @returns {Promise<number>} Returns a numeric result indicating address allocation value.
   * @throws {Error} If address validation fails or allocation cannot be fetched.
   */
  public checkAddressAllocation = async ({
    chain,
  }: checkAddressAllocationOpts): Promise<number> => {
    try {
      return await this.provetreeService.checkAddressAllocation(
        this.address,
        chain
      );
    } catch (error: any) {
      throw new Error(
        `Error in checkAddressAllocation: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  /**
   * Retrieves the claims history for the specified blockchain and address.
   *
   * @param {SupportedBlockchains} chain - The blockchain to fetch claims history from.
   * @returns {Promise<ClaimHistoryResponse[]>} A promise that resolves to an array of claim history responses.
   * @throws {Error} Throws an error if the claims history cannot be retrieved.
   */
  public getClaimsHistory = async ({
    chain,
  }: getClaimsHistoryOpts): Promise<ClaimHistoryResponse[]> => {
    try {
      return await this.claimApiService.getClaimsHistory(
        chain as SupportedBlockchains,
        this.address
      );
    } catch (error: any) {
      throw new Error(
        `Error in getClaimsHistory:
        ${error instanceof Error ? error.message : error}`
      );
    }
  };

  /**
   * Submits a claim transaction for the specified blockchain and destination address.
   *
   * This method performs multiple steps using the Fireblocks and ProveTree services.
   *
   * @param {makeClaimsOpts} opts - The options for the claim (chain, destinationAddress).
   * @param {SupportedBlockchains} opts.chain - The blockchain network on which to execute the claim.
   * @param {string} opts.destinationAddress - The destination address for the claim.
   * @returns {Promise<SubmitClaimResponse[]>} Resolves with claim submission result.
   * @throws {Error} On signature or service errors.
   */
  public makeClaims = async ({
    chain,
    destinationAddress,
  }: makeClaimsOpts): Promise<SubmitClaimResponse[]> => {
    try {
      const originAddress = this.address;
      const allocationValue =
        await this.provetreeService.checkAddressAllocation(
          originAddress,
          chain as SupportedBlockchains
        );

      const fbResoponse = await this.fireblocksService.signMessage({
        chain: chain as SupportedBlockchains,
        originVaultAccountId: this.vaultAccountId,
        destinationAddress,
        amount: allocationValue,
        vaultName: this.vaultAccountId,
        originAddress,
      });

      if (
        !fbResoponse ||
        !fbResoponse.publicKey ||
        !fbResoponse.algorithm ||
        !fbResoponse.signature ||
        !fbResoponse.signature.fullSig
      ) {
        throw new Error(
          "Invalid Fireblocks response: missing signature or public key"
        );
      }

      const message = fbResoponse.message;
      const publicKey = fbResoponse.publicKey;
      let signature: string = "";
      if (fbResoponse.algorithm === SignedMessageAlgorithmEnum.EcdsaSecp256K1) {
        const { r, s, v } = fbResoponse.signature;
        if (!r || !s || v === undefined)
          throw new Error("ecdsa signature error.");
        if (this.assetId === SupportedAssetIds.BTC) {
          const encodedSig =
            Buffer.from([Number.parseInt(String(v), 16) + 31]).toString("hex") +
            fbResoponse.signature.fullSig;

          signature = Buffer.from(encodedSig, "hex").toString("base64");
        } else if (this.assetId === SupportedAssetIds.XRP) {
          signature = (r + s).toUpperCase();
        } else {
          const ethV = v + 27;

          signature = r + s + ethV.toString(16).padStart(2, "0");
        }
      } else {
        signature = fbResoponse.signature.fullSig;
      }

      const claimResponse = await this.claimApiService.makeClaims(
        chain as SupportedBlockchains,
        originAddress,
        allocationValue,
        message,
        signature,
        destinationAddress,
        publicKey
      );

      return claimResponse;
    } catch (error: any) {
      throw new Error(error instanceof Error ? error.message : error);
    }
  };

  /**
   * Transfers native tokens and ADA to a recipient address on Cardano.
   *
   * This method:
   * - Selects UTXOs to cover the required token and ADA amounts.
   * - Constructs and signs the transaction using Fireblocks.
   * - Submits the transaction to the Cardano network.
   *
   * @param {trasnsferClaimsOpts} opts - Options for transferring claims.
   * @param {string} opts.recipientAddress - Recipient's Bech32 address.
   * @param {string} opts.tokenPolicyId - Native token policy ID.
   * @param {number} opts.requiredTokenAmount - Amount of token to transfer.
   * @param {number} [opts.minRecipientLovelace=1_200_000] - Minimum ADA for recipient (default: 1,200,000).
   * @param {number} [opts.minChangeLovelace=1_200_000] - Minimum ADA for change (default: 1,200,000).
   * @returns {Promise<TransferClaimsResponse>} Transaction hash, sender address, and token name.
   * @throws {Error} If UTXOs/balance are insufficient, or Fireblocks signing fails.
   */
  public transferClaims = async ({
    recipientAddress,
    tokenPolicyId,
    requiredTokenAmount,
    minRecipientLovelace = 1_200_000,
    minChangeLovelace = 1_200_000,
  }: trasnsferClaimsOpts): Promise<TransferClaimsResponse> => {
    if (!this.blockfrostProjectId) {
      throw new Error("Blockfrost project id was not provided.");
    }
    try {
      const transactionFee = BigInt(tokenTransactionFee);

      if (!this.blockfrostProjectId) {
        throw new Error("BLOCKFROST_PROJECT_ID is not configured.");
      }

      // Initialize Lucid if not already initialized
      if (!this.lucid) {
        const network = this.blockfrostProjectId.includes("mainnet")
          ? "Mainnet"
          : this.blockfrostProjectId.includes("preprod")
          ? "Preprod"
          : "Preview";
        this.lucid = await lucid.Lucid.new(
          new lucid.Blockfrost(
            this.blockfrostProjectId,
            this.blockfrostProjectId
          ),
          network
        );
      }

      const utxoResult = await fetchAndSelectUtxos(
        this.address,
        this.blockfrostProjectId,
        tokenPolicyId,
        requiredTokenAmount,
        Number(transactionFee),
        minRecipientLovelace,
        minChangeLovelace
      );

      if (!utxoResult) throw new Error("No UTXOs found");

      const {
        blockfrost,
        selectedUtxos,
        accumulatedAda,
        accumulatedTokenAmount,
      } = utxoResult;

      const adaTarget = BigInt(minRecipientLovelace) + transactionFee;

      if (
        BigInt(accumulatedTokenAmount) < BigInt(requiredTokenAmount) ||
        BigInt(accumulatedAda) < adaTarget
      ) {
        throw {
          code: "INSUFFICIENT_BALANCE",
          message: "Insufficient balance for token or ADA.",
          details: {
            requiredTokenAmount,
            accumulatedTokenAmount,
            requiredAda: Number(adaTarget),
            accumulatedAda,
          },
        };
      }

      const convertedUtxos: lucid.UTxO[] = selectedUtxos.map((utxo) => {
        const assets: Record<string, bigint> = {};
        utxo.amount.forEach(({ unit, quantity }) => {
          assets[unit] = BigInt(quantity);
        });
        return {
          txHash: utxo.tx_hash,
          outputIndex: utxo.output_index,
          address: utxo.address,
          assets,
        };
      });

      const assetNameUnit =
        tokenPolicyId + lucid.toHex(Buffer.from(nightTokenName, "utf8"));

      const dummyWallet: lucid.WalletApi = {
        getNetworkId: async () => 1, // or 0 for testnet
        getUtxos: async () => [],
        getBalance: async () => "0",
        getUsedAddresses: async () => [
          Buffer.from(
            lucid.C.Address.from_bech32(this.address).to_bytes()
          ).toString("hex"),
        ],
        getUnusedAddresses: async () => [],
        getChangeAddress: async () =>
          Buffer.from(
            lucid.C.Address.from_bech32(this.address).to_bytes()
          ).toString("hex"),
        getRewardAddresses: async () => [],
        signTx: async () => {
          throw new Error("signTx not implemented in dummy wallet");
        },
        signData: async () => {
          throw new Error("signData not implemented in dummy wallet");
        },
        submitTx: async () => {
          throw new Error("submitTx not implemented in dummy wallet");
        },
        getCollateral: async () => [],
        experimental: {
          getCollateral: async () => [],
          on: () => {},
          off: () => {},
        },
      };
      this.lucid.selectWallet(dummyWallet);
      let tx = this.lucid
        .newTx()
        .collectFrom(convertedUtxos)
        .payToAddress(recipientAddress, {
          lovelace: BigInt(minRecipientLovelace),
          [assetNameUnit]: BigInt(requiredTokenAmount),
        })
        .payToAddress(this.address, {
          lovelace: BigInt(accumulatedAda) - adaTarget,
          [assetNameUnit]:
            BigInt(accumulatedTokenAmount) - BigInt(requiredTokenAmount),
        });

      const ttl = await calculateTtl(blockfrost, this.lucid, 2600);
      tx = tx.validTo(ttl);

      const unsignedTx = await tx.complete();

      const txHash = unsignedTx.toHash();

      const transactionPayload = {
        assetId: this.assetId,
        operation: TransactionOperation.Raw,
        source: {
          type: TransferPeerPathType.VaultAccount,
          id: this.vaultAccountId,
        },
        note: "transfer ADA native tokens",
        extraParameters: {
          rawMessageData: {
            messages: [
              {
                content: txHash,
              },
            ],
          },
        },
      };

      const fbResponse = await this.fireblocksService.broadcastTransaction(
        transactionPayload
      );
      if (
        !fbResponse?.publicKey ||
        !fbResponse?.signature ||
        !fbResponse.signature.fullSig
      ) {
        throw new Error("Missing publicKey or signature from Fireblocks");
      }

      const publicKeyBytes = Buffer.from(fbResponse.publicKey, "hex");
      const signatureBytes = Buffer.from(fbResponse.signature.fullSig, "hex");
      const publicKey = lucid.C.PublicKey.from_bytes(publicKeyBytes);

      const vkey = lucid.C.Vkey.new(publicKey);

      const signature = lucid.C.Ed25519Signature.from_bytes(signatureBytes);
      const vkeyWitness = lucid.C.Vkeywitness.new(vkey, signature);
      const vkeyWitnesses = lucid.C.Vkeywitnesses.new();
      vkeyWitnesses.add(vkeyWitness);
      const witnessSet = lucid.C.TransactionWitnessSet.new();
      witnessSet.set_vkeys(vkeyWitnesses);

      const witnessHex = Buffer.from(witnessSet.to_bytes()).toString("hex");

      const signedTxComplete = unsignedTx.assemble([witnessHex]);

      const signedTx = await signedTxComplete.complete();

      const txHexString = signedTx.toString();
      const submittedHash = await this.lucid.provider.submitTx(txHexString);
      return {
        txHash: submittedHash,
        senderAddress: this.address,
        tokenName: this.assetId,
      };
    } catch (error: any) {
      throw new Error(
        `Error in transferClaims: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`
      );
    }
  };

  /**
   * Retrieves the wallet addresses associated with a specific Fireblocks vault account.
   *
   * @param {string} vaultAccountId - The unique identifier of the vault account to fetch addresses for.
   * @returns {Promise<VaultWalletAddress[]>} A promise that resolves to an array of VaultWalletAddress objects.
   * @throws {Error} Throws an error if the retrieval fails.
   */
  public getVaultAccountAddresses = async ({
    vaultAccountId,
  }: getVaultAccountAddressesOpts): Promise<VaultWalletAddress[]> => {
    try {
      return await this.fireblocksService.getVaultAccountAddresses(
        vaultAccountId,
        this.assetId
      );
    } catch (error: any) {
      throw new Error(
        `Error in getVaultAccountAddresses:
        ${error instanceof Error ? error.message : error}`
      );
    }
  };

  public registerScavengerHuntAddress = async ({
    vaultAccountId,
  }: registerScavengerHuntAddressOpts): Promise<RegistrationReceipt> => {
    try {
      const adaAddress = await this.fireblocksService.getVaultAccountAddress(
        vaultAccountId,
        SupportedAssetIds.ADA
      );

      const termsResponse = await fetch(
        "https://scavenger.prod.gd.midnighttge.io/TandC"
      );
      const terms = await termsResponse.json();
      const messageToSign = terms.message;
      const signedMessageResponse = await this.fireblocksService.signMessage({
        chain: SupportedBlockchains.CARDANO,
        originVaultAccountId: vaultAccountId,
        destinationAddress: adaAddress,
        amount: 0,
        message: messageToSign,
      });

      if (
        !signedMessageResponse ||
        !signedMessageResponse.content ||
        !signedMessageResponse.publicKey ||
        !signedMessageResponse.signature ||
        !signedMessageResponse.signature.fullSig
      ) {
        throw new Error(
          "Invalid Fireblocks response: missing signature or public key"
        );
      }

      const fullSig = signedMessageResponse.signature.fullSig;
      const publicKey = signedMessageResponse.publicKey;

      const coseSign1Hex = await buildCoseSign1(messageToSign, fullSig!);

      return await this.scavengerHuntService.register({
        destinationAddress: adaAddress,
        signature: coseSign1Hex,
        pubkey: publicKey,
      });
    } catch (error: any) {
      throw new Error(
        `Error in registerScavengerHuntAddress: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  public solveScavengerHuntChallenge = async ({
    vaultAccountId,
  }: solveScavengerHuntChallengeOpts): Promise<{
    nonce: string;
    hash: string;
    attempts: bigint;
    timeMs: number;
  }> => {
    try {
      const adaAddress = await this.fireblocksService.getVaultAccountAddress(
        vaultAccountId,
        SupportedAssetIds.ADA
      );

      const challengeResonse = await this.scavengerHuntService.getChallenge();

      const challenge = challengeResonse.challenge;

      return await this.scavengerHuntService.solveChallenge({
        address: adaAddress,
        challenge,
      });
    } catch (error: any) {
      throw new Error(
        `Error in solveScavengerHuntChallenge: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  public getScavengerHuntChallenge =
    async (): Promise<ScavangerHuntChallangeResponse> => {
      try {
        const challenge = await this.scavengerHuntService.getChallenge();
        return challenge;
      } catch (error: any) {
        throw new Error(
          `Error in getScavengerHuntChallenge:
        ${error instanceof Error ? error.message : error}`
        );
      }
    };
}
