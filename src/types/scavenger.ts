import {
  VaultIndexDestinationOpts,
  VaultIndexOpts,
} from "./base.js";

export type solveScavengerHuntChallengeOpts = VaultIndexOpts;
export type donateToScavengerHuntOpts = VaultIndexDestinationOpts;
export type registerScavengerHuntAddressOpts = VaultIndexOpts;

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
