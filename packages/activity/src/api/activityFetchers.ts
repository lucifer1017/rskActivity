import type { ActivityItem } from "../types/activity";
import type { FetchActivitiesFn, PollRequestContext } from "../core/pollingManager";
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
import { fetchFlyoverPeginStatusByQuoteHash, type FlyoverClientOptions } from "./flyoverClient";
import { normalizeFlyoverStatusToActivityItem } from "../normalizers/flyoverNormalizer";

export interface PowpegFetchConfig {
  btcTxIds: string[];
  clientOptions: PowpegClientOptions;
}

export function createPowpegFetchActivities(
  config: PowpegFetchConfig
): FetchActivitiesFn {
  const { btcTxIds, clientOptions } = config;

  return async (context?: PollRequestContext): Promise<ActivityItem[]> => {
    if (!btcTxIds.length) return [];

    const settled = await Promise.allSettled(
      btcTxIds.map(async (txid) => {
        const status = await fetchPowpegStatusByBtcTxId(txid, {
          ...clientOptions,
          signal: context?.signal,
        });
        return status ? normalizePowpegStatusToActivityItem(status) : null;
      })
    );

    return settled.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : []
    );
  };
}

export interface BtcFetchConfig {
  txIds: string[];
  clientOptions?: BtcExplorerClientOptions;
}

export function createBtcFetchActivities(
  config: BtcFetchConfig
): FetchActivitiesFn {
  const { txIds, clientOptions } = config;

  return async (context?: PollRequestContext): Promise<ActivityItem[]> => {
    if (!txIds.length) return [];

    const settled = await Promise.allSettled(
      txIds.map((txid) =>
        fetchBtcTxStatus(txid, { ...clientOptions, signal: context?.signal })
      )
    );

    return settled.flatMap((result) => {
      if (result.status !== "fulfilled" || !result.value) return [];
      return [normalizeBtcTxStatusToActivityItem(result.value)];
    });
  };
}

export interface FlyoverFetchConfig {
  clientOptions: FlyoverClientOptions;
  quoteHashes: string[];
}

export function createFlyoverFetchActivities(
  config: FlyoverFetchConfig
): FetchActivitiesFn {
  const { clientOptions, quoteHashes } = config;

  return async (context?: PollRequestContext): Promise<ActivityItem[]> => {
    if (!quoteHashes.length) return [];

    const settled = await Promise.allSettled(
      quoteHashes.map((quoteHash) =>
        fetchFlyoverPeginStatusByQuoteHash(quoteHash, {
          ...clientOptions,
          signal: context?.signal,
        })
      )
    );

    return settled.flatMap((result) =>
      result.status === "fulfilled" && result.value
        ? [normalizeFlyoverStatusToActivityItem(result.value)]
        : []
    );
  };
}
