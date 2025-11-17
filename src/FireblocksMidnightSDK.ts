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
  donateToScavengerHuntOpts,
  DonateToScavengerHuntResponse,
  getClaimsHistoryOpts,
  getVaultAccountAddressesOpts,
  makeClaimsOpts,
  NoteType,
  PhaseConfigResponse,
  registerScavengerHuntAddressOpts,
  RegistrationReceipt,
  ScavangerHuntChallangeResponse,
  solveScavengerHuntChallengeOpts,
  SubmitClaimResponse,
  SupportedAssetIds,
  SupportedBlockchains,
  ThawScheduleResponse,
  ThawStatusSchedule,
  ThawTransactionResponse,
  ThawTransactionStatus,
  TransactionBuildRequest,
  TransactionBuildResponse,
  TransactionSubmissionRequest,
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
import { ThawsService } from "./services/thaws.service.js";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";

export class FireblocksMidnightSDK {
  private fireblocksService: FireblocksService;
  private claimApiService: ClaimApiService;
  private provetreeService: ProvetreeService;
  private scavengerHuntService: ScavengerHuntService;
  private thawsService: ThawsService;
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
    thawsService: ThawsService;
    assetId: SupportedAssetIds;
    vaultAccountId: string;
    address: string;
    blockfrostProjectId?: string;
  }) {
    this.fireblocksService = params.fireblocksService;
    this.claimApiService = params.claimApiService;
    this.provetreeService = params.provetreeService;
    this.scavengerHuntService = params.scavengerHuntService;
    this.thawsService = params.thawsService;
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
      const thawsService = new ThawsService();

      const sdkInstance = new FireblocksMidnightSDK({
        fireblocksService,
        claimApiService,
        provetreeService,
        scavengerHuntService,
        thawsService,
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
      this.logger.error(
        `Error in checking allocation for address ${this.address} on chain ${chain}:`,
        error instanceof Error ? error.message : error
      );
      throw new Error(
        `Error in checking allocation for address ${
          this.address
        } on chain ${chain}: ${error instanceof Error ? error.message : error}`
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
      this.logger.error(
        `Error in fetching claims history for address ${this.address} on chain ${chain}:`,
        error instanceof Error ? error.message : error
      );
      throw new Error(
        `Error in fetching claims history for address ${
          this.address
        } on chain ${chain}:
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
        noteType: NoteType.CLAIM,
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

      this.logger.appendData("claims-history", {
        address: claimResponse[0].address,
        amount: claimResponse[0].amount,
        claim_id: claimResponse[0].claim_id,
        dest_address: claimResponse[0].dest_address,
      });

      return claimResponse;
    } catch (error: any) {
      this.logger.error(
        `Error in making claims for address ${this.address} on chain ${chain}:`,
        error instanceof Error ? error.message : error
      );
      throw new Error(
        `Error in making claims for address ${
          this.address
        } on chain ${chain}: ${error instanceof Error ? error.message : error}`
      );
    }
  };

  /**
   * Transfers native tokens and ADA to a recipient address on Cardano.
   */
  public transferClaims = async ({
    recipientAddress,
    tokenPolicyId,
    requiredTokenAmount,
    minRecipientLovelace = 1_200_000,
    minChangeLovelace = 1_200_000,
  }: trasnsferClaimsOpts): Promise<TransferClaimsResponse> => {
    try {
      this.validateBlockfrostConfig();

      if (!this.lucid) {
        await this.initializeLucid();
      }
      const { blockfrost, utxos, accumulatedAda, accumulatedTokenAmount } =
        await this.fetchAndValidateUtxos(
          tokenPolicyId,
          requiredTokenAmount,
          minRecipientLovelace,
          minChangeLovelace
        );

      const convertedUtxos = this.convertUtxosForLucid(utxos);

      const unsignedTx = await this.buildTransferTransaction({
        blockfrost,
        convertedUtxos,
        recipientAddress,
        tokenPolicyId,
        requiredTokenAmount,
        minRecipientLovelace,
        accumulatedAda,
        accumulatedTokenAmount,
      });

      const witnessHex = await this.signTransferTransaction(unsignedTx);

      const txHash = await this.assembleAndSubmitTransaction(
        unsignedTx,
        witnessHex
      );

      return {
        txHash,
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

  private validateBlockfrostConfig(): void {
    if (!this.blockfrostProjectId) {
      throw new Error("BLOCKFROST_PROJECT_ID is not configured");
    }
  }

  private async fetchAndValidateUtxos(
    tokenPolicyId: string,
    requiredTokenAmount: number,
    minRecipientLovelace: number,
    minChangeLovelace: number
  ): Promise<{
    blockfrost: BlockFrostAPI;
    utxos: any[];
    accumulatedAda: number;
    accumulatedTokenAmount: number;
  }> {
    const transactionFee = BigInt(tokenTransactionFee);

    const utxoResult = await fetchAndSelectUtxos(
      this.address,
      this.blockfrostProjectId!,
      tokenPolicyId,
      requiredTokenAmount,
      Number(transactionFee),
      minRecipientLovelace,
      minChangeLovelace
    );

    if (!utxoResult) {
      throw new Error("No UTXOs found");
    }

    const {
      selectedUtxos,
      accumulatedAda,
      accumulatedTokenAmount,
      blockfrost,
    } = utxoResult;

    this.validateSufficientBalance(
      accumulatedAda,
      accumulatedTokenAmount,
      requiredTokenAmount,
      minRecipientLovelace,
      Number(transactionFee)
    );

    return {
      utxos: selectedUtxos,
      accumulatedAda,
      accumulatedTokenAmount,
      blockfrost,
    };
  }

  private validateSufficientBalance(
    accumulatedAda: number,
    accumulatedTokenAmount: number,
    requiredTokenAmount: number,
    minRecipientLovelace: number,
    transactionFee: number
  ): void {
    const adaTarget = BigInt(minRecipientLovelace) + BigInt(transactionFee);

    if (
      BigInt(accumulatedTokenAmount) < BigInt(requiredTokenAmount) ||
      BigInt(accumulatedAda) < adaTarget
    ) {
      throw {
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient balance for token or ADA",
        details: {
          requiredTokenAmount,
          accumulatedTokenAmount,
          requiredAda: Number(adaTarget),
          accumulatedAda,
        },
      };
    }
  }

  private convertUtxosForLucid(utxos: any[]): lucid.UTxO[] {
    return utxos.map((utxo) => {
      const assets: Record<string, bigint> = {};
      utxo.amount.forEach(({ unit, quantity }: any) => {
        assets[unit] = BigInt(quantity);
      });
      return {
        txHash: utxo.tx_hash,
        outputIndex: utxo.output_index,
        address: utxo.address,
        assets,
      };
    });
  }

  private createDummyWallet(address: string): lucid.WalletApi {
    const addressHex = Buffer.from(
      lucid.C.Address.from_bech32(address).to_bytes()
    ).toString("hex");

    return {
      getNetworkId: async () => 1,
      getUtxos: async () => [],
      getBalance: async () => "0",
      getUsedAddresses: async () => [addressHex],
      getUnusedAddresses: async () => [],
      getChangeAddress: async () => addressHex,
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
  }

  private async buildTransferTransaction(params: {
    blockfrost: BlockFrostAPI;
    convertedUtxos: lucid.UTxO[];
    recipientAddress: string;
    tokenPolicyId: string;
    requiredTokenAmount: number;
    minRecipientLovelace: number;
    accumulatedAda: number;
    accumulatedTokenAmount: number;
  }): Promise<lucid.TxComplete> {
    const {
      blockfrost,
      convertedUtxos,
      recipientAddress,
      tokenPolicyId,
      requiredTokenAmount,
      minRecipientLovelace,
      accumulatedAda,
      accumulatedTokenAmount,
    } = params;

    const transactionFee = BigInt(tokenTransactionFee);
    const adaTarget = BigInt(minRecipientLovelace) + transactionFee;

    const assetNameUnit =
      tokenPolicyId + lucid.toHex(Buffer.from(nightTokenName, "utf8"));

    // Set dummy wallet
    const dummyWallet = this.createDummyWallet(this.address);
    this.lucid!.selectWallet(dummyWallet);

    // Build transaction
    let tx = this.lucid!.newTx()
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

    const ttl = await calculateTtl(blockfrost, this.lucid!, 2600);
    tx = tx.validTo(ttl);

    return await tx.complete();
  }

  private async signTransferTransaction(
    unsignedTx: lucid.TxComplete
  ): Promise<string> {
    const txHash = unsignedTx.toHash();

    const transactionPayload = {
      assetId: this.assetId,
      operation: TransactionOperation.Raw,
      source: {
        type: TransferPeerPathType.VaultAccount,
        id: this.vaultAccountId,
      },
      note: "Transfer ADA native tokens",
      extraParameters: {
        rawMessageData: {
          messages: [{ content: txHash }],
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

    return this.createTransferWitnessSet(
      fbResponse.publicKey,
      fbResponse.signature.fullSig
    );
  }

  private createTransferWitnessSet(
    publicKeyHex: string,
    signatureHex: string
  ): string {
    const publicKeyBytes = Buffer.from(publicKeyHex, "hex");
    const signatureBytes = Buffer.from(signatureHex, "hex");

    const publicKey = lucid.C.PublicKey.from_bytes(publicKeyBytes);
    const vkey = lucid.C.Vkey.new(publicKey);
    const signature = lucid.C.Ed25519Signature.from_bytes(signatureBytes);
    const vkeyWitness = lucid.C.Vkeywitness.new(vkey, signature);

    const vkeyWitnesses = lucid.C.Vkeywitnesses.new();
    vkeyWitnesses.add(vkeyWitness);

    const witnessSet = lucid.C.TransactionWitnessSet.new();
    witnessSet.set_vkeys(vkeyWitnesses);

    return Buffer.from(witnessSet.to_bytes()).toString("hex");
  }

  private async assembleAndSubmitTransaction(
    unsignedTx: lucid.TxComplete,
    witnessHex: string
  ): Promise<string> {
    const signedTxComplete = unsignedTx.assemble([witnessHex]);
    const signedTx = await signedTxComplete.complete();
    const txHexString = signedTx.toString();

    return await this.lucid!.provider.submitTx(txHexString);
  }
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
      this.logger.error(
        `Error in getVaultAccountAddresses for vault account ${vaultAccountId}:`,
        error instanceof Error ? error.message : error
      );
      throw new Error(
        `Error in getVaultAccountAddresses for vault account ${vaultAccountId}: ${
          error instanceof Error ? error.message : error
        }`
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
        noteType: NoteType.REGISTER,
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

      const result = await this.scavengerHuntService.register({
        destinationAddress: adaAddress,
        signature: coseSign1Hex,
        pubkey: publicKey,
      });

      this.logger.saveData("registered-addresses", {
        vaultAccountId: vaultAccountId,
        address: adaAddress,
        publicKey: publicKey,
        timestamp: result.timestamp,
        registrationReceipt: result.registrationReceipt,
        preimage: result.preimage,
        signature: result.signature,
      });

      return result;
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

      const result = await this.scavengerHuntService.solveChallenge({
        address: adaAddress,
        challenge,
      });

      this.logger.appendData("mining-history", {
        challengeId: challenge.challenge_id,
        nonce: result.nonce,
        attempts: Number(result.attempts),
        timeMs: result.timeMs,
        hashRate: Number(result.nonce) / (result.timeMs / 1000),
        adaAddress,
      });

      return result;
    } catch (error: any) {
      throw new Error(
        `Error in solveScavengerHuntChallenge: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  public donateToScavengerHunt = async ({
    vaultAccountId,
    destAddress,
  }: donateToScavengerHuntOpts): Promise<DonateToScavengerHuntResponse> => {
    try {
      const adaAddress = await this.fireblocksService.getVaultAccountAddress(
        vaultAccountId,
        SupportedAssetIds.ADA
      );

      const messageToSign = `Assign accumulated Scavenger rights to: ${destAddress}`;

      const signedMessageResponse = await this.fireblocksService.signMessage({
        chain: SupportedBlockchains.CARDANO,
        originVaultAccountId: vaultAccountId,
        destinationAddress: adaAddress,
        amount: 0,
        message: messageToSign,
        noteType: NoteType.DONATE,
      });

      if (
        !signedMessageResponse ||
        !signedMessageResponse.content ||
        !signedMessageResponse.signature ||
        !signedMessageResponse.signature.fullSig
      ) {
        throw new Error(
          "Invalid Fireblocks response: missing signature or public key"
        );
      }

      const fullSig = signedMessageResponse.signature.fullSig;

      const signature = await buildCoseSign1(messageToSign, fullSig!);

      const result = await this.scavengerHuntService.donateToAddress({
        destinationAddress: destAddress,
        originalAddress: adaAddress,
        signature,
      });

      this.logger.appendData("donation-history", result);

      return result;
    } catch (error: any) {
      throw new Error(
        `Error in donateToScavengerHunt: ${
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
        this.logger.error(
          `getScavengerHuntChallenge: ${
            error instanceof Error ? error.message : error
          }`
        );
        throw new Error(
          `Error in getScavengerHuntChallenge:
        ${error instanceof Error ? error.message : error}`
        );
      }
    };

  public getPhaseConfig = async (): Promise<PhaseConfigResponse> => {
    try {
      return await this.thawsService.getPhaseConfig();
    } catch (error: any) {
      this.logger.error(
        `getPhaseConfig: ${error instanceof Error ? error.message : error}`
      );
      throw new Error(
        `getPhaseConfig:
        ${error instanceof Error ? error.message : error}`
      );
    }
  };

  public getThawSchedule = async (params: {
    vaultAccountId: string;
  }): Promise<ThawScheduleResponse> => {
    try {
      const { vaultAccountId } = params;
      const adaAddress = await this.fireblocksService.getVaultAccountAddress(
        vaultAccountId,
        SupportedAssetIds.ADA
      );

      return await this.thawsService.getThawSchedule(adaAddress);
    } catch (error: any) {
      this.logger.error(
        `getThawSchedule: ${error instanceof Error ? error.message : error}`
      );
      throw new Error(
        `Error in getThawSchedule:
        ${error instanceof Error ? error.message : error}`
      );
    }
  };

  public getThawTransactionStatus = async (params: {
    destAddress: string;
    transactionId: string;
  }): Promise<ThawTransactionStatus> => {
    try {
      const { destAddress, transactionId } = params;
      return await this.thawsService.getTransactionStatus(
        destAddress,
        transactionId
      );
    } catch (error: any) {
      this.logger.error(
        `getThawTransactionStatus: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw new Error(
        `Error in getThawTransactionStatus:
        ${error instanceof Error ? error.message : error}`
      );
    }
  };

  public redeemNight = async (params: {
    vaultAccountId: string;
  }): Promise<ThawTransactionResponse> => {
    try {
      const { vaultAccountId } = params;

      if (!this.blockfrostProjectId) {
        throw new Error("Blockfrost project ID is required for redemption");
      }

      const destAddress = await this.fireblocksService.getVaultAccountAddress(
        vaultAccountId,
        SupportedAssetIds.ADA
      );

      await this.validateRedemptionWindow();
      await this.validateRedeemableThaws(destAddress);

      const utxoHex = await this.fetchAndConvertUtxo(destAddress);
      const txBuildResponse = await this.buildRedemptionTransaction(
        destAddress,
        utxoHex
      );

      const witnessSetHex = await this.signRedemptionTransaction(
        vaultAccountId,
        txBuildResponse.transaction_id
      );

      const submitResponse = await this.submitRedemptionTransaction(
        destAddress,
        txBuildResponse,
        witnessSetHex
      );

      this.logRedemption(destAddress, submitResponse);

      return submitResponse;
    } catch (error: any) {
      this.logger.error(
        `redeemNight: ${error instanceof Error ? error.message : error}`
      );
      throw new Error(
        `Error in redeemNight: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`
      );
    }
  };

  private validateRedemptionWindow = async (): Promise<void> => {
    try {
      const config = await this.thawsService.getPhaseConfig();
      const windowInfo = this.thawsService.getRedemptionWindowTimes(config);

      if (!windowInfo.isOpen) {
        throw new Error(
          `Redemption window is not open. Window: ${windowInfo.startTime.toISOString()} - ${windowInfo.endTime.toISOString()}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to validate redemption window: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw new Error(
        `Failed to validate redemption window: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  private validateRedeemableThaws = async (
    destAddress: string
  ): Promise<void> => {
    try {
      const addressSchedule = await this.thawsService.getThawSchedule(
        destAddress
      );

      const redeemableThaws = addressSchedule.thaws.filter(
        (t) => t.status === ThawStatusSchedule.REDEEMABLE
      );

      if (redeemableThaws.length === 0) {
        throw new Error(
          `No redeemable thaws available for address: ${destAddress}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to validate redeemable thaws: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw new Error(
        `Failed to validate redeemable thaws: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  private fetchAndConvertUtxo = async (
    destAddress: string
  ): Promise<string> => {
    try {
      if (!this.lucid) {
        await this.initializeLucid();
      }

      const utxos = await this.lucid!.utxosAt(destAddress);

      if (!utxos || utxos.length === 0) {
        throw new Error(`No UTXOs found for address: ${destAddress}`);
      }

      const selectedUtxo = this.selectLargestUtxo(utxos);
      return this.convertUtxoToHex(selectedUtxo, destAddress);
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch and convert UTXO: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw new Error(
        `Failed to fetch and convert UTXO: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  private selectLargestUtxo = (utxos: lucid.UTxO[]): lucid.UTxO => {
    return utxos.sort((a, b) => {
      const aLovelace = a.assets.lovelace || 0n;
      const bLovelace = b.assets.lovelace || 0n;
      return Number(bLovelace - aLovelace);
    })[0];
  };

  private convertUtxoToHex = (
    utxo: lucid.UTxO,
    destAddress: string
  ): string => {
    const txHash = lucid.C.TransactionHash.from_hex(utxo.txHash);
    const txIn = lucid.C.TransactionInput.new(
      txHash,
      lucid.C.BigNum.from_str(utxo.outputIndex.toString())
    );
    const address = lucid.C.Address.from_bech32(destAddress);
    const lovelaceAmount = utxo.assets.lovelace || 0n;
    const amount = lucid.C.Value.new(
      lucid.C.BigNum.from_str(lovelaceAmount.toString())
    );
    const txOut = lucid.C.TransactionOutput.new(address, amount);

    const txUnspentOutput = lucid.C.TransactionUnspentOutput.new(txIn, txOut);
    return Buffer.from(txUnspentOutput.to_bytes()).toString("hex");
  };

  private buildRedemptionTransaction = async (
    destAddress: string,
    utxoHex: string
  ): Promise<TransactionBuildResponse> => {
    try {
      const buildRequest: TransactionBuildRequest = {
        change_address: destAddress,
        funding_utxos: [utxoHex],
        collateral_utxos: [],
      };

      const txBuildResponse = await this.thawsService.buildThawTransaction(
        destAddress,
        buildRequest
      );

      this.logger.info(
        `Built thaw transaction: ${txBuildResponse.transaction_id}`
      );

      return txBuildResponse;
    } catch (error: any) {
      this.logger.error(
        `Failed to build redemption transaction: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw new Error(
        `Failed to build redemption transaction: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  private signRedemptionTransaction = async (
    vaultAccountId: string,
    transactionId: string
  ): Promise<string> => {
    try {
      const transactionPayload = {
        assetId: SupportedAssetIds.ADA,
        operation: TransactionOperation.Raw,
        source: {
          type: TransferPeerPathType.VaultAccount,
          id: vaultAccountId,
        },
        note: `Redeem NIGHT tokens`,
        extraParameters: {
          rawMessageData: {
            messages: [{ content: transactionId }],
          },
        },
      };

      const fbResponse = await this.fireblocksService.broadcastTransaction(
        transactionPayload
      );

      if (!fbResponse?.signature || !fbResponse.signature.fullSig) {
        throw new Error("Missing signature from Fireblocks");
      }

      return this.createWitnessSet(
        fbResponse.publicKey!,
        fbResponse.signature.fullSig
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to sign redemption transaction: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw new Error(
        `Failed to sign redemption transaction: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  private createWitnessSet = (
    publicKeyHex: string,
    signatureHex: string
  ): string => {
    const publicKeyBytes = Buffer.from(publicKeyHex, "hex");
    const signatureBytes = Buffer.from(signatureHex, "hex");

    const publicKey = lucid.C.PublicKey.from_bytes(publicKeyBytes);
    const vkey = lucid.C.Vkey.new(publicKey);
    const signature = lucid.C.Ed25519Signature.from_bytes(signatureBytes);
    const vkeyWitness = lucid.C.Vkeywitness.new(vkey, signature);

    const vkeyWitnesses = lucid.C.Vkeywitnesses.new();
    vkeyWitnesses.add(vkeyWitness);

    const witnessSet = lucid.C.TransactionWitnessSet.new();
    witnessSet.set_vkeys(vkeyWitnesses);

    return Buffer.from(witnessSet.to_bytes()).toString("hex");
  };

  private submitRedemptionTransaction = async (
    destAddress: string,
    txBuildResponse: TransactionBuildResponse,
    witnessSetHex: string
  ): Promise<ThawTransactionResponse> => {
    try {
      const submitRequest: TransactionSubmissionRequest = {
        transaction: txBuildResponse.transaction,
        transaction_witness_set: witnessSetHex,
      };

      const submitResponse = await this.thawsService.submitThawTransaction(
        destAddress,
        submitRequest
      );

      this.logger.info(
        `Submitted thaw transaction: ${submitResponse.transaction_id}`
      );

      return submitResponse;
    } catch (error: any) {
      this.logger.error(
        `Failed to submit redemption transaction: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw new Error(
        `Failed to submit redemption transaction: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  };

  private logRedemption = (
    destAddress: string,
    submitResponse: ThawTransactionResponse
  ): void => {
    this.logger.appendData("redemption-history", {
      destAddress,
      transactionId: submitResponse.transaction_id,
      estimatedSubmissionTime: new Date(
        submitResponse.estimated_submission_time * 1000
      ).toISOString(),
      timestamp: new Date().toISOString(),
    });
  };

  private initializeLucid = async (): Promise<void> => {
    if (!this.blockfrostProjectId) {
      throw new Error("Blockfrost project id was not provided.");
    }
    const network = this.blockfrostProjectId.includes("mainnet")
      ? "Mainnet"
      : this.blockfrostProjectId.includes("preprod")
      ? "Preprod"
      : "Preview";
    this.lucid = await lucid.Lucid.new(
      new lucid.Blockfrost(this.blockfrostProjectId, this.blockfrostProjectId),
      network
    );
  };
}
