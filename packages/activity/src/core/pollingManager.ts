import type { ActivityItem } from "../types/activity";
import type { BridgeNotificationEvent } from "../types/events";
import type { ResolvedActivityConfig } from "../config/resolveConfig";
import { mergeActivities } from "./mergeActivities";

export interface PollRequestContext {
  signal?: AbortSignal;
}

export type FetchActivitiesFn = (context?: PollRequestContext) => Promise<ActivityItem[]>;

export interface PollingManagerOptions {
  config: ResolvedActivityConfig;
  fetchBtc?: FetchActivitiesFn;
  fetchPowpeg?: FetchActivitiesFn;
  fetchFlyover?: FetchActivitiesFn;
  onUpdate: (items: ActivityItem[], events: BridgeNotificationEvent[]) => void;
  onError?: (error: unknown, source: "BTC" | "POWPEG" | "FLYOVER" | "MERGE") => void;
  onPollStateChange?: (inFlightCount: number) => void;
}

export interface PollingManager {
  start(): void;
  stop(): void;
  forceRefresh(): void;
}
export function createPollingManager(options: PollingManagerOptions): PollingManager {
  const { config, fetchBtc, fetchPowpeg, fetchFlyover, onUpdate, onError, onPollStateChange } = options;
  const hasBtcSource = Boolean(fetchBtc && config.enableMempoolSniffer);
  const hasPowpegSource = Boolean(fetchPowpeg && config.enablePowpeg);
  const hasFlyoverSource = Boolean(fetchFlyover && config.enableFlyover);

  let running = false;
  let generation = 0;
  let inFlightCount = 0;
  let btcTimer: ReturnType<typeof setTimeout> | undefined;
  let powpegTimer: ReturnType<typeof setTimeout> | undefined;
  let flyoverTimer: ReturnType<typeof setTimeout> | undefined;

  let previousItems: ActivityItem[] = [];
  let lastBtcItems: ActivityItem[] = [];
  let lastPowpegItems: ActivityItem[] = [];
  let lastFlyoverItems: ActivityItem[] = [];
  const activeControllers = new Set<AbortController>();

  const clearTimers = () => {
    if (btcTimer) clearTimeout(btcTimer);
    if (powpegTimer) clearTimeout(powpegTimer);
    if (flyoverTimer) clearTimeout(flyoverTimer);
    btcTimer = powpegTimer = flyoverTimer = undefined;
  };
  const updateInFlight = (delta: number) => {
    inFlightCount = Math.max(0, inFlightCount + delta);
    onPollStateChange?.(inFlightCount);
  };
  const createRunSignal = () => {
    const controller = new AbortController();
    activeControllers.add(controller);
    return controller;
  };
  const releaseRunSignal = (controller: AbortController) => {
    activeControllers.delete(controller);
  };
  const abortAllInFlight = () => {
    for (const controller of activeControllers) {
      controller.abort();
    }
    activeControllers.clear();
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
    const runGeneration = generation;
    const controller = createRunSignal();
    updateInFlight(1);
    try {
      const nextItems = await fetchBtc({ signal: controller.signal });
      if (!running || runGeneration !== generation) return;
      lastBtcItems = nextItems;
      mergeAndEmit();
    } catch (err) {
      if (!running || runGeneration !== generation) return;
      onError?.(err, "BTC");
    } finally {
      releaseRunSignal(controller);
      updateInFlight(-1);
    }
  };

  const pollPowpeg = async () => {
    if (!fetchPowpeg || !config.enablePowpeg) return;
    const runGeneration = generation;
    const controller = createRunSignal();
    updateInFlight(1);
    try {
      const nextItems = await fetchPowpeg({ signal: controller.signal });
      if (!running || runGeneration !== generation) return;
      lastPowpegItems = nextItems;
      mergeAndEmit();
    } catch (err) {
      if (!running || runGeneration !== generation) return;
      onError?.(err, "POWPEG");
    } finally {
      releaseRunSignal(controller);
      updateInFlight(-1);
    }
  };

  const pollFlyover = async () => {
    if (!fetchFlyover || !config.enableFlyover) return;
    const runGeneration = generation;
    const controller = createRunSignal();
    updateInFlight(1);
    try {
      const nextItems = await fetchFlyover({ signal: controller.signal });
      if (!running || runGeneration !== generation) return;
      lastFlyoverItems = nextItems;
      mergeAndEmit();
    } catch (err) {
      if (!running || runGeneration !== generation) return;
      onError?.(err, "FLYOVER");
    } finally {
      releaseRunSignal(controller);
      updateInFlight(-1);
    }
  };

  const start = () => {
    if (running) return;
    if (!hasBtcSource && !hasPowpegSource && !hasFlyoverSource) return;
    running = true;
    generation += 1;
    inFlightCount = 0;
    onPollStateChange?.(inFlightCount);
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
    generation += 1;
    inFlightCount = 0;
    onPollStateChange?.(inFlightCount);
    abortAllInFlight();
    clearTimers();
  };

  const forceRefresh = () => {
    if (!running) return;
    void Promise.all([pollBtc(), pollPowpeg(), pollFlyover()]);
  };

  return { start, stop, forceRefresh };
}

