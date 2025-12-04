import { SupportedBlockchains, SupportedAssetIds, NoteType } from "./enums.js";
import { ChainOpts, ChainDestinationOpts, VaultAccountOpts } from "./base.js";

export type checkAddressAllocationOpts = ChainOpts;
export type getClaimsHistoryOpts = ChainOpts;
export type makeClaimsOpts = ChainDestinationOpts;

export interface trasnsferClaimsOpts {
  recipientAddress: string;
  tokenPolicyId: string;
  requiredTokenAmount: number;
  minRecipientLovelace?: number;
  minChangeLovelace?: number;
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

export type getVaultAccountAddressesOpts = VaultAccountOpts;
