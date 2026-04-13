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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeTxIds(txIds?: string[]): string[] {
  if (!txIds || txIds.length === 0) return [];
  return Array.from(
    new Set(txIds.map((v) => v.trim()).filter((v) => v.length > 0))
  );
}

function txIdsKey(txIds?: string[]): string {
  return normalizeTxIds(txIds).join("|");
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UseBridgeNotificationsOptions {
  /**
   * Known Bitcoin transaction hashes to track at the BTC mempool / confirmation
   * level via a public block explorer (mempool.space compatible).
   *
   * Populate this list when the user initiates a bridge operation — you will
   * have the funding BTC txid at that point.
   */
  btcTxIds?: string[];

  /**
   * Bitcoin transaction hashes whose PowPeg bridge status should be polled.
   * Defaults to the same list as `btcTxIds` when omitted.
   */
  powpegBtcTxIds?: string[];

  /**
   * Optional configuration (network, API base URLs, polling intervals,
   * feature flags). All fields have sensible defaults.
   */
  config?: ActivityConfig;

  /**
   * Global polling interval override in milliseconds.
   * Takes precedence over `config.pollingIntervalMs` when provided.
   */
  pollingIntervalMs?: number;

  /**
   * Callback invoked for every bridge notification event emitted by the
   * polling manager. Wire this to browser toasts / notification APIs.
   */
  onEvent?: (event: BridgeNotificationEvent) => void;

  /**
   * Flyover peg-in tracking options.
   * Provide a Flyover LP descriptor and the quote hashes obtained when the
   * user accepted a Flyover quote to enable Flyover status polling.
   */
  flyover?: {
    /**
     * LP descriptor — compatible with the `LiquidityProvider` type from
     * @rsksmart/flyover-sdk. The SDK returns this object after calling
     * `Flyover.getAvailableLiquidityProviders()`.
     */
    provider: FlyoverLiquidityProvider;
    /**
     * Quote hashes from accepted Flyover peg-in quotes.
     * Persist these after calling `Flyover.acceptPeginQuote()`.
     */
    quoteHashes?: string[];
  };
}

export interface UseBridgeNotificationsResult {
  items: ActivityItem[];
  isLoading: boolean;
  error: unknown;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBridgeNotifications(
  options: UseBridgeNotificationsOptions
): UseBridgeNotificationsResult {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<unknown>(null);

  const managerRef = useRef<PollingManager | null>(null);
  const onEventRef = useRef<UseBridgeNotificationsOptions["onEvent"]>();

  // Keep onEvent ref current without causing polling manager re-creation.
  useEffect(() => {
    onEventRef.current = options.onEvent;
  }, [options.onEvent]);

  // ---------------------------------------------------------------------------
  // Resolved config — memoized on primitive config fields to stay stable.
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Stable txid arrays — serialised to string keys so the main effect only
  // re-runs when the actual set of txids changes, not on every render.
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Polling manager — re-created only when sources or resolved config change.
  // ---------------------------------------------------------------------------
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
    // Use the LP URL string (primitive) as the dependency, not the provider
    // object reference, which would trigger a new manager on every render even
    // when the URL has not changed.
    options.flyover?.provider?.apiBaseUrl,
  ]);

  const refresh = () => {
    if (!managerRef.current) return;
    setIsLoading(true);
    managerRef.current.forceRefresh();
  };

  return { items, isLoading, error, refresh };
}
