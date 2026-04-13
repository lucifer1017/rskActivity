import type { ActivityItem } from "../types/activity";
import type { FetchActivitiesFn } from "../core/pollingManager";
import {
  fetchPowpegStatusByBtcTxId,
  type PowpegClientOptions,
} from "./powpegClient";
import { normalizePowpegStatusToActivityItem } from "../normalizers/powpegNormalizer";
import {
  fetchBtcTxStatus,
  type BtcExplorerClientOptions,
} from "./btcExplorerClient";
import { normalizeBtcTxStatusToActivityItem } from "../normalizers/btcNormalizer";
import {
  fetchFlyoverPeginStatusByQuoteHash,
  type FlyoverClientOptions,
} from "./flyoverClient";
import { normalizeFlyoverStatusToActivityItem } from "../normalizers/flyoverNormalizer";

// ---------------------------------------------------------------------------
// PowPeg fetcher
// ---------------------------------------------------------------------------

export interface PowpegFetchConfig {
  /**
   * Bitcoin transaction hashes to track via the PowPeg / 2wp-api.
   * These are typically the same txids used for BTC mempool tracking.
   */
  btcTxIds: string[];
  clientOptions: PowpegClientOptions;
}

export function createPowpegFetchActivities(
  config: PowpegFetchConfig
): FetchActivitiesFn {
  const { btcTxIds, clientOptions } = config;

  return async (): Promise<ActivityItem[]> => {
    if (!btcTxIds.length) return [];

    const settled = await Promise.allSettled(
      btcTxIds.map(async (txid) => {
        const status = await fetchPowpegStatusByBtcTxId(txid, clientOptions);
        return status ? normalizePowpegStatusToActivityItem(status) : null;
      })
    );

    return settled.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : []
    );
  };
}

// ---------------------------------------------------------------------------
// BTC mempool sniffer fetcher
// ---------------------------------------------------------------------------

export interface BtcFetchConfig {
  /**
   * Bitcoin transaction hashes to track at the mempool / confirmation level.
   */
  txIds: string[];
  clientOptions?: BtcExplorerClientOptions;
}

export function createBtcFetchActivities(
  config: BtcFetchConfig
): FetchActivitiesFn {
  const { txIds, clientOptions } = config;

  return async (): Promise<ActivityItem[]> => {
    if (!txIds.length) return [];

    const settled = await Promise.allSettled(
      txIds.map((txid) => fetchBtcTxStatus(txid, clientOptions))
    );

    return settled.flatMap((result) =>
      result.status === "fulfilled"
        ? [normalizeBtcTxStatusToActivityItem(result.value)]
        : []
    );
  };
}

// ---------------------------------------------------------------------------
// Flyover fetcher
// ---------------------------------------------------------------------------

export interface FlyoverFetchConfig {
  clientOptions: FlyoverClientOptions;
  /**
   * Quote hashes obtained when the user accepted a Flyover peg-in quote.
   * The consuming application is responsible for persisting these after
   * initiating the Flyover transaction via the SDK or any other method.
   */
  quoteHashes: string[];
}

export function createFlyoverFetchActivities(
  config: FlyoverFetchConfig
): FetchActivitiesFn {
  const { clientOptions, quoteHashes } = config;

  return async (): Promise<ActivityItem[]> => {
    if (!quoteHashes.length) return [];

    const settled = await Promise.allSettled(
      quoteHashes.map((quoteHash) =>
        fetchFlyoverPeginStatusByQuoteHash(quoteHash, clientOptions)
      )
    );

    return settled.flatMap((result) =>
      result.status === "fulfilled" && result.value
        ? [normalizeFlyoverStatusToActivityItem(result.value)]
        : []
    );
  };
}
