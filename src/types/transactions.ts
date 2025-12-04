import { TransactionType } from "./enums.js";
import { SupportedBlockchains } from "./enums.js";
import {
  checkAddressAllocationOpts,
  getClaimsHistoryOpts,
  getVaultAccountAddressesOpts,
  makeClaimsOpts,
  trasnsferClaimsOpts,
} from "./claims.js";
import {
  registerScavengerHuntAddressOpts,
  solveScavengerHuntChallengeOpts,
  donateToScavengerHuntOpts,
} from "./scavenger.js";
import { thawScheduleOpts, thawStatusOpts, redeemNightOpts } from "./thaws.js";

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
