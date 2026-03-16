import axios, { type AxiosInstance } from "axios";

export interface BtcTxStatus {
  txid: string;
  isInMempool: boolean;
  isConfirmed: boolean;
  blockHeight?: number;
  timestamp?: number;
}

export interface BtcExplorerClientOptions {
  baseUrl?: string;
  axiosInstance?: AxiosInstance;
}

const DEFAULT_BASE_URL = "https://mempool.space/api";

/**
 * Fetch basic Bitcoin transaction status information from a mempool.space-compatible API.
 *
 * Note: This client focuses on mempool vs confirmed state and basic metadata.
 * Confirmation counts and value details are intentionally left out and can be
 * complemented by PowPeg / Flyover data.
 */
export async function fetchBtcTxStatus(
  txid: string,
  options?: BtcExplorerClientOptions
): Promise<BtcTxStatus> {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const client = options?.axiosInstance ?? axios;

  const url = `${baseUrl.replace(/\/+$/, "")}/tx/${txid}`;
  const response = await client.get(url);

  const data = response.data as {
    txid?: string;
    status?: {
      confirmed?: boolean;
      block_height?: number;
      block_time?: number;
    };
  };

  const confirmed = Boolean(data.status?.confirmed);

  return {
    txid,
    isInMempool: !confirmed,
    isConfirmed: confirmed,
    blockHeight: data.status?.block_height,
    timestamp: data.status?.block_time,
  };
}

