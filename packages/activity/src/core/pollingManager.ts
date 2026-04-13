import type { ActivityItem } from "../types/activity";
import type { BridgeNotificationEvent } from "../types/events";
import type { ResolvedActivityConfig } from "../config/resolveConfig";
import { mergeActivities } from "./mergeActivities";

export type FetchActivitiesFn = () => Promise<ActivityItem[]>;

export interface PollingManagerOptions {
  config: ResolvedActivityConfig;
  fetchBtc?: FetchActivitiesFn;
  fetchPowpeg?: FetchActivitiesFn;
  fetchFlyover?: FetchActivitiesFn;
  onUpdate: (items: ActivityItem[], events: BridgeNotificationEvent[]) => void;
  onError?: (error: unknown, source: "BTC" | "POWPEG" | "FLYOVER" | "MERGE") => void;
}

export interface PollingManager {
  start(): void;
  stop(): void;
  forceRefresh(): void;
}

/**
 * Polling manager orchestrates per-source polling (BTC, PowPeg, Flyover),
 * merges results into a single activity list, and emits notification events.
 *
 * It is framework-agnostic and side-effect free beyond the callbacks.
 */
export function createPollingManager(options: PollingManagerOptions): PollingManager {
  const { config, fetchBtc, fetchPowpeg, fetchFlyover, onUpdate, onError } = options;
  const hasBtcSource = Boolean(fetchBtc && config.enableMempoolSniffer);
  const hasPowpegSource = Boolean(fetchPowpeg && config.enablePowpeg);
  const hasFlyoverSource = Boolean(fetchFlyover && config.enableFlyover);

  let running = false;
  let btcTimer: ReturnType<typeof setTimeout> | undefined;
  let powpegTimer: ReturnType<typeof setTimeout> | undefined;
  let flyoverTimer: ReturnType<typeof setTimeout> | undefined;

  let previousItems: ActivityItem[] = [];

  // Last known per-source snapshots
  let lastBtcItems: ActivityItem[] = [];
  let lastPowpegItems: ActivityItem[] = [];
  let lastFlyoverItems: ActivityItem[] = [];

  const clearTimers = () => {
    if (btcTimer) clearTimeout(btcTimer);
    if (powpegTimer) clearTimeout(powpegTimer);
    if (flyoverTimer) clearTimeout(flyoverTimer);
    btcTimer = powpegTimer = flyoverTimer = undefined;
  };

  const schedule = (
    source: "BTC" | "POWPEG" | "FLYOVER",
    delayMs: number,
    fn: () => Promise<void>
  ) => {
    const timer = setTimeout(async () => {
      if (!running) return;
      try {
        await fn();
      } finally {
        if (!running) return;
        // Reschedule
        schedule(source, delayMs, fn);
      }
    }, delayMs);

    if (source === "BTC") btcTimer = timer;
    if (source === "POWPEG") powpegTimer = timer;
    if (source === "FLYOVER") flyoverTimer = timer;
  };

  const mergeAndEmit = () => {
    try {
      const groups: ActivityItem[][] = [];
      if (hasBtcSource) groups.push(lastBtcItems);
      if (hasPowpegSource) groups.push(lastPowpegItems);
      if (hasFlyoverSource) groups.push(lastFlyoverItems);

      if (!groups.length) return;

      const { items, events } = mergeActivities(previousItems, groups);
      previousItems = items;
      onUpdate(items, events);
    } catch (err) {
      onError?.(err, "MERGE");
    }
  };

  const pollBtc = async () => {
    if (!fetchBtc || !config.enableMempoolSniffer) return;
    try {
      lastBtcItems = await fetchBtc();
      mergeAndEmit();
    } catch (err) {
      onError?.(err, "BTC");
    }
  };

  const pollPowpeg = async () => {
    if (!fetchPowpeg || !config.enablePowpeg) return;
    try {
      lastPowpegItems = await fetchPowpeg();
      mergeAndEmit();
    } catch (err) {
      onError?.(err, "POWPEG");
    }
  };

  const pollFlyover = async () => {
    if (!fetchFlyover || !config.enableFlyover) return;
    try {
      lastFlyoverItems = await fetchFlyover();
      mergeAndEmit();
    } catch (err) {
      onError?.(err, "FLYOVER");
    }
  };

  const start = () => {
    if (running) return;
    if (!hasBtcSource && !hasPowpegSource && !hasFlyoverSource) return;
    running = true;

    // Initial immediate polls (fire-and-forget)
    void pollBtc();
    void pollPowpeg();
    void pollFlyover();

    if (hasBtcSource) {
      schedule("BTC", config.btcPollingIntervalMs, pollBtc);
    }
    if (hasPowpegSource) {
      schedule("POWPEG", config.powpegPollingIntervalMs, pollPowpeg);
    }
    if (hasFlyoverSource) {
      schedule("FLYOVER", config.flyoverPollingIntervalMs, pollFlyover);
    }
  };

  const stop = () => {
    if (!running) return;
    running = false;
    clearTimers();
  };

  const forceRefresh = () => {
    if (!running) return;
    void Promise.all([pollBtc(), pollPowpeg(), pollFlyover()]);
  };

  return { start, stop, forceRefresh };
}

