import { ThawStatusSchedule } from "./enums.js";
import {
  UTCTime,
  HexEncoded,
  VaultIndexOpts,
  TransactionStatusOpts,
} from "./base.js";

export type thawScheduleOpts = VaultIndexOpts;
export type thawStatusOpts = TransactionStatusOpts;
export type redeemNightOpts = VaultIndexOpts;

export interface PhaseConfigResponse {
  genesis_timestamp: number;
  jitter_strata_count: number;
  redemption_increment_period: number;
  redemption_increments: number;
  redemption_initial_delay: number;
}

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
  transaction: HexEncoded;
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

export type ThawTransactionStatusType = Extract<
  ThawStatusSchedule,
  | ThawStatusSchedule.QUEUED
  | ThawStatusSchedule.CONFIRMED
  | ThawStatusSchedule.FAILED
  | ThawStatusSchedule.CONFIRMING
  | ThawStatusSchedule.SUBMITTED
>;

export interface ThawTransactionStatus {
  redeemed_amount: number;
  status: ThawTransactionStatusType; // ✅ Fixed
  transaction_id: HexEncoded;
}
