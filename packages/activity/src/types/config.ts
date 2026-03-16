export type NetworkName = "regtest" | "testnet" | "mainnet";

export interface ActivityPollingConfig {
  pollingIntervalMs?: number;
  btcPollingIntervalMs?: number;
  powpegPollingIntervalMs?: number;
  flyoverPollingIntervalMs?: number;
}

export interface ActivityFeatureFlags {
  enableMempoolSniffer?: boolean;
  enablePowpeg?: boolean;
  enableFlyover?: boolean;
}

export interface NetworkConfig {
  network: NetworkName;
  powpegApiBaseUrl?: string;
  btcExplorerBaseUrl?: string;
}

export interface ActivityConfig extends ActivityPollingConfig, ActivityFeatureFlags {
  network: NetworkConfig["network"];
  powpegApiBaseUrl?: string;
  btcExplorerBaseUrl?: string;
}

