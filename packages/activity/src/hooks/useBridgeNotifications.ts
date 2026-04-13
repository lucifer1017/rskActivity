import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityItem } from "../types/activity";
import type { ActivityConfig } from "../types/config";
import type { BridgeNotificationEvent } from "../types/events";
import { resolveConfig } from "../config/resolveConfig";
import {
  createPollingManager,
  type PollingManager,
} from "../core/pollingManager";
import {
  createBtcFetchActivities,
  createFlyoverFetchActivities,
  createPowpegFetchActivities,
} from "../api/activityFetchers";
import type { FlyoverLiquidityProvider } from "../api/flyoverClient";

function normalizeTxIds(txIds?: string[]): string[] {
  if (!txIds || txIds.length === 0) return [];
  return Array.from(
    new Set(txIds.map((v) => v.trim()).filter((v) => v.length > 0))
  );
}

function txIdsKey(txIds?: string[]): string {
  return normalizeTxIds(txIds).join("|");
}

export interface UseBridgeNotificationsOptions {
  btcTxIds?: string[];
  powpegBtcTxIds?: string[];
  config?: ActivityConfig;
  pollingIntervalMs?: number;
  onEvent?: (event: BridgeNotificationEvent) => void;
  flyover?: {
    provider: FlyoverLiquidityProvider;
    quoteHashes?: string[];
  };
}

export interface UseBridgeNotificationsResult {
  items: ActivityItem[];
  isLoading: boolean;
  error: unknown;
  refresh: () => void;
}

export function useBridgeNotifications(
  options: UseBridgeNotificationsOptions
): UseBridgeNotificationsResult {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<unknown>(null);

  const managerRef = useRef<PollingManager | null>(null);
  const onEventRef = useRef<UseBridgeNotificationsOptions["onEvent"]>();

  useEffect(() => {
    onEventRef.current = options.onEvent;
  }, [options.onEvent]);

  const resolvedConfig = useMemo(() => {
    const base = options.config ?? {};
    const merged =
      options.pollingIntervalMs != null
        ? { ...base, pollingIntervalMs: options.pollingIntervalMs }
        : base;
    return resolveConfig(merged);
  }, [
    options.config?.network,
    options.config?.powpegApiBaseUrl,
    options.config?.btcExplorerBaseUrl,
    options.config?.pollingIntervalMs,
    options.config?.btcPollingIntervalMs,
    options.config?.powpegPollingIntervalMs,
    options.config?.flyoverPollingIntervalMs,
    options.config?.enableMempoolSniffer,
    options.config?.enablePowpeg,
    options.config?.enableFlyover,
    options.pollingIntervalMs,
  ]);

  const btcTxIdsKey = txIdsKey(options.btcTxIds);
  const powpegTxIdsKey = txIdsKey(
    options.powpegBtcTxIds ?? options.btcTxIds
  );
  const flyoverHashesKey = txIdsKey(options.flyover?.quoteHashes);

  const btcTxIds = useMemo(
    () => normalizeTxIds(options.btcTxIds),
    [btcTxIdsKey]
  );
  const powpegBtcTxIds = useMemo(
    () => normalizeTxIds(options.powpegBtcTxIds ?? options.btcTxIds),
    [powpegTxIdsKey]
  );
  const flyoverQuoteHashes = useMemo(
    () => normalizeTxIds(options.flyover?.quoteHashes),
    [flyoverHashesKey]
  );

  useEffect(() => {
    const fetchBtc =
      resolvedConfig.enableMempoolSniffer && btcTxIds.length > 0
        ? createBtcFetchActivities({
            txIds: btcTxIds,
            clientOptions: { baseUrl: resolvedConfig.btcExplorerBaseUrl },
          })
        : undefined;

    const fetchPowpeg =
      resolvedConfig.enablePowpeg && powpegBtcTxIds.length > 0
        ? createPowpegFetchActivities({
            btcTxIds: powpegBtcTxIds,
            clientOptions: { baseUrl: resolvedConfig.powpegApiBaseUrl },
          })
        : undefined;

    const fetchFlyover =
      resolvedConfig.enableFlyover &&
      options.flyover?.provider &&
      flyoverQuoteHashes.length > 0
        ? createFlyoverFetchActivities({
            clientOptions: { provider: options.flyover.provider },
            quoteHashes: flyoverQuoteHashes,
          })
        : undefined;

    if (!fetchBtc && !fetchPowpeg && !fetchFlyover) {
      setItems([]);
      setIsLoading(false);
      managerRef.current = null;
      return;
    }

    const manager = createPollingManager({
      config: resolvedConfig,
      fetchBtc,
      fetchPowpeg,
      fetchFlyover,
      onUpdate(nextItems, events) {
        setItems(nextItems);
        setError(null);
        setIsLoading(false);
        const handler = onEventRef.current;
        if (handler) {
          for (const event of events) {
            handler(event);
          }
        }
      },
      onError(err) {
        setError(err);
        setIsLoading(false);
      },
    });

    managerRef.current = manager;
    setIsLoading(true);
    manager.start();

    return () => {
      manager.stop();
      managerRef.current = null;
    };
  }, [
    btcTxIdsKey,
    powpegTxIdsKey,
    flyoverHashesKey,
    resolvedConfig.btcExplorerBaseUrl,
    resolvedConfig.powpegApiBaseUrl,
    resolvedConfig.enableMempoolSniffer,
    resolvedConfig.enablePowpeg,
    resolvedConfig.enableFlyover,
    resolvedConfig.btcPollingIntervalMs,
    resolvedConfig.powpegPollingIntervalMs,
    resolvedConfig.flyoverPollingIntervalMs,
    options.flyover?.provider?.apiBaseUrl,
  ]);

  const refresh = () => {
    if (!managerRef.current) return;
    setIsLoading(true);
    managerRef.current.forceRefresh();
  };

  return { items, isLoading, error, refresh };
}
