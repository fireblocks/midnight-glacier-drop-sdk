import { SupportedAssetIds, SupportedBlockchains } from "../types/index.js";

const blockchainToAssetIdsMap: Record<SupportedBlockchains, SupportedAssetIds> =
  {
    [SupportedBlockchains.CARDANO]: SupportedAssetIds.ADA,
    [SupportedBlockchains.CARDANO_TESTNET]: SupportedAssetIds.ADA_TEST,
    [SupportedBlockchains.BITCOIN]: SupportedAssetIds.BTC,
    [SupportedBlockchains.ETHEREUM]: SupportedAssetIds.ETH,
    [SupportedBlockchains.BNB]: SupportedAssetIds.BNB,
    [SupportedBlockchains.BAT]: SupportedAssetIds.BAT,
    [SupportedBlockchains.SOLANA]: SupportedAssetIds.SOL,
    [SupportedBlockchains.AVALANCHE]: SupportedAssetIds.AVAX,
    [SupportedBlockchains.XRP]: SupportedAssetIds.XRP,
  };

/**
 * Retrieves the supported asset IDs for a given blockchain.
 *
 * @param {SupportedBlockchains} chain - The blockchain for which to get the asset IDs. Must be of type {@link SupportedBlockchains}.
 * @returns {SupportedAssetIds | null} The supported asset IDs for the specified blockchain as {@link SupportedAssetIds}, or `null` if none are found.
 */
export const getAssetIdsByBlockchain = (
  chain: SupportedBlockchains
): SupportedAssetIds | null => {
  return blockchainToAssetIdsMap[chain] ?? null;
};
