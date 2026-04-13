export type NetworkName = "regtest" | "testnet" | "mainnet";

export interface ActivityConfig {
  network?: NetworkName;
  powpegApiBaseUrl?: string;
  btcExplorerBaseUrl?: string;
  pollingIntervalMs?: number;
  btcPollingIntervalMs?: number;
  powpegPollingIntervalMs?: number;
  flyoverPollingIntervalMs?: number;
  enableMempoolSniffer?: boolean;
  enablePowpeg?: boolean;
  enableFlyover?: boolean;
}


