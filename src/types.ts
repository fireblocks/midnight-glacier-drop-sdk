import { BasePath } from "@fireblocks/ts-sdk";
import { FireblocksMidnightSDK } from "./FireblocksMidnightSDK.js";

export interface SdkPoolItem {
  sdk: FireblocksMidnightSDK;
  lastUsed: Date;
  isInUse: boolean;
}

export interface PoolConfig {
  maxPoolSize: number;
  idleTimeoutMs: number;
  cleanupIntervalMs: number;
  connectionTimeoutMs: number;
  retryAttempts: number;
}

export interface ApiServiceConfig {
  apiKey: string;
  secretKey: string;
  basePath: BasePath | string;
  poolConfig?: Partial<PoolConfig>;
}

export class MidnightApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorType?: string,
    public errorInfo?: any,
    public service?: string
  ) {
    super(message);
    this.name = "FbMidnightSdkError";
  }
}

export enum TransactionType {
  CHECK_ADDRESS_ALLOCATION = "checkAddressAllocation",
  GET_CLAIMS_HISTORY = "getClaimsHistory",
  MAKE_CLAIMS = "makeClaims",
  TRANSFER_CLAIMS = "transferClaims",
  GET_VAULT_ACCOUNT_ADDRESSES = "getVaultAccountAddresses",
  REGISTER_SCAVENGER_HUNT_ADDRESS = "registerScavengerHuntAddress",
  GET_SCAVENGER_HUNT_CHALLENGE = "getScavengerHuntChallenge",
  SOLVE_SCAVENGER_HUNT_CHALLENGE = "solveScavengerHuntChallenge",
  DONATE_TO_SCAVENGER_HUNT = "donateToScavengerHunt",
  GET_PHASE_CONFIG = "getPhaseConfig",
  GET_THAW_SCHEDULE = "getThawSchedule",
  GET_THAW_STATUS = "getThawStatus",
  REDEEM_NIGHT = "redeemNight",
}

export interface checkAddressAllocationOpts {
  chain: SupportedBlockchains;
}

export interface getClaimsHistoryOpts {
  chain: SupportedBlockchains;
}

export interface makeClaimsOpts {
  chain: SupportedBlockchains;
  destinationAddress: string;
}

export interface trasnsferClaimsOpts {
  recipientAddress: string;
  tokenPolicyId: string;
  requiredTokenAmount: number;
  minRecipientLovelace?: number;
  minChangeLovelace?: number;
}

export interface getVaultAccountAddressesOpts {
  vaultAccountId: string;
}

export interface ExecuteTransactionOpts {
  vaultAccountId: string;
  chain: SupportedBlockchains;
  transactionType: TransactionType;
  params:
    | checkAddressAllocationOpts
    | getClaimsHistoryOpts
    | makeClaimsOpts
    | trasnsferClaimsOpts
    | getVaultAccountAddressesOpts
    | registerScavengerHuntAddressOpts
    | solveScavengerHuntChallengeOpts
    | donateToScavengerHuntOpts
    | thawScheduleOpts
    | thawStatusOpts
    | redeemNightOpts;
}

export interface registerScavengerHuntAddressOpts {
  vaultAccountId: string;
}

export interface solveScavengerHuntChallengeOpts {
  vaultAccountId: string;
}
export interface thawScheduleOpts {
  vaultAccountId: string;
}

export interface thawStatusOpts {
  destAddress: string;
  transactionId: string;
}

export interface donateToScavengerHuntOpts {
  vaultAccountId: string;
  destAddress: string;
}

export interface redeemNightOpts {
  vaultAccountId: string;
  destAddress: string;
}

export interface SdkManagerMetrics {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  instancesByVaultAccount: Record<string, boolean>;
}

export enum SupportedBlockchains {
  AVALANCHE = "avax",
  BAT = "bat",
  BITCOIN = "bitcoin",
  BNB = "bnb",
  CARDANO = "cardano",
  CARDANO_TESTNET = "cardano_testnet",
  ETHEREUM = "ethereum",
  SOLANA = "solana",
  XRP = "xrp",
}

export enum SupportedAssetIds {
  ADA = "ADA",
  ADA_TEST = "ADA_TEST",
  AVAX = "AVAX",
  BAT = "BAT",
  BTC = "BTC",
  BNB = "BNB",
  ETH = "ETH",
  SOL = "SOL",
  XRP = "XRP",
}

export interface Utxo {
  address: string;
  tx_hash: string;
  tx_index: number;
  output_index: number;
  amount: {
    unit: string;
    quantity: string;
  }[];
  block: string;
  data_hash: string | null;
  inline_datum: string | null;
  reference_script_hash: string | null;
}

export interface TransferClaimsResponse {
  txHash: string;
  senderAddress: string;
  tokenName: SupportedAssetIds;
}

export interface SubmitClaimResponse {
  address: string;
  amount: number;
  claim_id: string;
  dest_address: string;
}

export interface ClaimHistoryResponse {
  address: string;
  amount: number;
  blockchain: SupportedBlockchains;
  claim_id: string;
  confirmation_blocks: any | null;
  failure: any | null;
  leaf_index: number;
  status: string;
  transaction_id: string | number | null;
}

export enum NoteType {
  DONATE = "donate",
  REGISTER = "register",
  CLAIM = "claim",
}

export interface SignMessageParams {
  chain: SupportedBlockchains;
  originVaultAccountId: string;
  destinationAddress: string;
  amount: number;
  vaultName?: string;
  originAddress?: string;
  message?: string;
  noteType?: NoteType;
}

export interface RegistrationReceipt {
  preimage: string;
  signature: string;
  timestamp: string;
}

export interface TermsAndConditions {
  version: string;
  content: string;
  message: string;
}

export interface RegistrationReceipt {
  registrationReceipt: {
    preimage: string;
    signature: string;
    timestamp: string;
  };
}

export interface Challenge {
  challenge_id: string;
  challenge_number: number;
  day: number;
  issued_at: string;
  latest_submission: string;
  difficulty: string;
  no_pre_mine: string;
  no_pre_mine_hour: string;
}

export interface SolutionResponse {
  crypto_receipt: {
    preimage: string;
    timestamp: string;
    signature: string;
  };
}
export interface WorkToStarRate {
  rates: number[];
}

export interface ScavangerHuntChallange {
  challenge_id: string;
  difficulty: string;
  no_pre_mine: string;
  no_pre_mine_hour: string;
  latest_submission: Date;
  challenge_number: number;
  day: number;
  issued_at: Date;
}
export interface ScavangerHuntChallangeResponse {
  code: "before" | "active" | "after";
  challenge: ScavangerHuntChallange;
  mining_period_ends: Date;
  max_day: number;
  total_challenges: number;
  current_day: number;
  next_challenge_starts_at: Date;
}

export interface DonateToScavengerHuntResponse {
  message: string;
  status?: string;
  statusCode?: number;
  donation_id?: string;
  original_address?: string;
  destination_address?: string;
  timestamp?: string;
  solutions_consolidated?: number;
  error?: string;
}

export interface PhaseConfigResponse {
  genesis_timestamp: number;
  jitter_strata_count: number;
  redemption_increment_period: number;
  redemption_increments: number;
  redemption_initial_delay: number;
}
export enum ThawStatusSchedule {
  UPCOMING = "upcoming",
  QUEUED = "queued",
  REDEEMABLE = "redeemable",
  SUBMITTED = "submitted",
  FAILED = "failed",
  CONFIRMING = "confirming",
  CONFIRMED = "confirmed",
  SKIPPED = "skipped",
}

type UTCTime = string; // Format: "yyyy-mm-ddThh:MM:ssZ" (e.g., "2016-07-22T00:00:00Z")

type HexEncoded = string; // Hexadecimal encoded bytes (e.g., "48656C6C6F20576F726C64")

export interface Thaw {
  amount: number;
  queue_position?: number;
  status: ThawStatusSchedule;
  thawing_period_start: UTCTime;
  transaction_id?: HexEncoded;
}
export interface ThawScheduleResponse {
  number_of_claimed_allocations: number;
  thaws: Thaw[];
}

export interface TransactionBuildRequest {
  change_address: string;
  collateral_utxos: HexEncoded[];
  funding_utxos: HexEncoded[];
}

export interface TransactionBuildResponse {
  redeemed_amount: number;
  require_thawing_extra_signature: boolean;
  transaction: HexEncoded; // Unsigned transaction hex
  transaction_id: HexEncoded;
}

export interface TransactionSubmissionRequest {
  transaction: HexEncoded;
  transaction_witness_set: HexEncoded;
}

export interface ThawTransactionResponse {
  estimated_submission_time: number;
  transaction_id: HexEncoded;
}

export interface ThawTransactionStatus {
  redeemed_amount: number;
  status: "queued" | "confirmed" | "failed" | "confirming" | "submitted";
  transaction_id: HexEncoded;
}
