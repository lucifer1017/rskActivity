import type { ActivityConfig, NetworkName } from "../types/config";

export interface ResolvedActivityConfig {
  network: NetworkName;
  powpegApiBaseUrl: string;
  btcExplorerBaseUrl: string;
  pollingIntervalMs: number;
  btcPollingIntervalMs: number;
  powpegPollingIntervalMs: number;
  flyoverPollingIntervalMs: number;
  enableMempoolSniffer: boolean;
  enablePowpeg: boolean;
  enableFlyover: boolean;
}

const DEFAULT_POLLING_MS = 20_000;
const MIN_POLLING_MS = 5_000;
const MAINNET_POWPEG = "https://api.2wp.rootstock.io";
const TESTNET_POWPEG = "https://api.2wp.testnet.rootstock.io";
const MAINNET_BTC = "https://mempool.space/api";
const TESTNET_BTC = "https://mempool.space/testnet4/api";

function defaultPowpegUrl(network: NetworkName): string {
  if (network === "mainnet") return MAINNET_POWPEG;
  if (network === "testnet") return TESTNET_POWPEG;
  throw new Error("powpegApiBaseUrl must be provided for regtest");
}

function defaultBtcUrl(network: NetworkName): string {
  if (network === "mainnet") return MAINNET_BTC;
  if (network === "testnet") return TESTNET_BTC;
  throw new Error("btcExplorerBaseUrl must be provided for regtest");
}

export function resolveConfig(input?: ActivityConfig): ResolvedActivityConfig {
  const network: NetworkName = input?.network ?? "testnet";

  const globalPolling = Math.max(
    MIN_POLLING_MS,
    input?.pollingIntervalMs ?? DEFAULT_POLLING_MS
  );

  const powpegApiBaseUrl =
    (input?.powpegApiBaseUrl ?? defaultPowpegUrl(network)).replace(/\/+$/, "");
  const btcExplorerBaseUrl =
    (input?.btcExplorerBaseUrl ?? defaultBtcUrl(network)).replace(/\/+$/, "");

  return {
    network,
    powpegApiBaseUrl,
    btcExplorerBaseUrl,
    pollingIntervalMs: globalPolling,
    btcPollingIntervalMs: Math.max(
      MIN_POLLING_MS,
      input?.btcPollingIntervalMs ?? globalPolling
    ),
    powpegPollingIntervalMs: Math.max(
      MIN_POLLING_MS,
      input?.powpegPollingIntervalMs ?? globalPolling
    ),
    flyoverPollingIntervalMs: Math.max(
      MIN_POLLING_MS,
      input?.flyoverPollingIntervalMs ?? globalPolling
    ),
    enableMempoolSniffer: input?.enableMempoolSniffer ?? true,
    enablePowpeg: input?.enablePowpeg ?? true,
    enableFlyover: input?.enableFlyover ?? true,
  };
}

