export type NetworkName = "regtest" | "testnet" | "mainnet";

export interface ActivityConfig {
  // Network / endpoints
  network?: NetworkName;
  powpegApiBaseUrl?: string;
  btcExplorerBaseUrl?: string;

  // Polling intervals (ms)
  pollingIntervalMs?: number;
  btcPollingIntervalMs?: number;
  powpegPollingIntervalMs?: number;
  flyoverPollingIntervalMs?: number;

  // Feature flags
  enableMempoolSniffer?: boolean;
  enablePowpeg?: boolean;
  enableFlyover?: boolean;
}


