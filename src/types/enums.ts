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

export enum NoteType {
  DONATE = "donate",
  REGISTER = "register",
  CLAIM = "claim",
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
