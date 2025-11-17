import { SupportedBlockchains } from "./enums.js";

export interface VaultAccountOpts {
  vaultAccountId: string;
}

export interface VaultDestinationOpts extends VaultAccountOpts {
  destAddress: string;
}

export interface VaultIndexOpts extends VaultAccountOpts {
  index: number;
}

export interface ChainOpts {
  chain: SupportedBlockchains;
}

export interface ChainDestinationOpts extends ChainOpts {
  destinationAddress: string;
}

export interface TransactionStatusOpts {
  destAddress: string;
  transactionId: string;
}

export type UTCTime = string; // Format: "yyyy-mm-ddThh:MM:ssZ"
export type HexEncoded = string; // Hexadecimal encoded bytes

export interface Utxo {
  address: string;
  tx_hash: string;
  tx_index: number;
  output_index: number;
  amount: { unit: string; quantity: string }[];
  block: string;
  data_hash: string | null;
  inline_datum: string | null;
  reference_script_hash: string | null;
}
