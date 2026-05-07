import { describe, expect, it, vi } from "vitest";
import { createPollingManager } from "./pollingManager";
import type { ActivityItem } from "../types/activity";

function config() {
  return {
    network: "testnet" as const,
    powpegApiBaseUrl: "https://api.2wp.testnet.rootstock.io",
    btcExplorerBaseUrl: "https://mempool.space/testnet4/api",
    pollingIntervalMs: 20_000,
    btcPollingIntervalMs: 20_000,
    powpegPollingIntervalMs: 20_000,
    flyoverPollingIntervalMs: 20_000,
    enableMempoolSniffer: true,
    enablePowpeg: false,
    enableFlyover: false,
  };
}

describe("pollingManager lifecycle safety", () => {
  it("does not emit updates from in-flight request after stop", async () => {
    let resolveFetch: (items: ActivityItem[]) => void = () => {};
    const fetchBtc = vi.fn(
      () =>
        new Promise<ActivityItem[]>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const onUpdate = vi.fn();

    const manager = createPollingManager({
      config: config(),
      fetchBtc,
      onUpdate,
    });

    manager.start();
    manager.stop();
    resolveFetch([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("aborts in-flight requests on stop", async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchBtc = vi.fn(async (ctx?: { signal?: AbortSignal }) => {
      seenSignal = ctx?.signal;
      return new Promise<ActivityItem[]>((resolve) => {
        setTimeout(() => resolve([]), 50);
      });
    });

    const manager = createPollingManager({
      config: config(),
      fetchBtc,
      onUpdate: vi.fn(),
    });

    manager.start();
    manager.stop();
    await Promise.resolve();

    expect(seenSignal).toBeDefined();
    expect(seenSignal?.aborted).toBe(true);
  });
});
