import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import { normalizeBtcTxId } from "../utils/validation";

export interface BtcTxStatus {
  txid: string;
  isConfirmed: boolean;
  blockHeight?: number;
  timestamp?: number;
  confirmations?: number;
}

export interface BtcExplorerClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  axiosInstance?: AxiosInstance;
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = "https://mempool.space/api";
const DEFAULT_TIMEOUT_MS = 10_000;

export type BtcExplorerClientErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "SERVER"
  | "INVALID_RESPONSE";

export class BtcExplorerClientError extends Error {
  readonly code: BtcExplorerClientErrorCode;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(message: string, code: BtcExplorerClientErrorCode, statusCode?: number, cause?: unknown) {
    super(message);
    this.name = "BtcExplorerClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

const btcSchema = z.object({
  txid: z.string().optional(),
  confirmations: z.number().optional(),
  status: z
    .object({
      confirmed: z.boolean().optional(),
      block_height: z.number().optional(),
      block_time: z.number().optional(),
      confirmations: z.number().optional(),
    })
    .optional(),
});
export async function fetchBtcTxStatus(
  txid: string,
  options?: BtcExplorerClientOptions
): Promise<BtcTxStatus | null> {
  const normalizedTxid = normalizeBtcTxId(txid);
  if (!normalizedTxid) {
    throw new BtcExplorerClientError("Invalid BTC txid format", "INVALID_RESPONSE");
  }

  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const client =
    options?.axiosInstance ??
    axios.create({
      timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

  const url = `${baseUrl.replace(/\/+$/, "")}/tx/${encodeURIComponent(normalizedTxid)}`;
  let response;
  try {
    response = await client.get(url, { signal: options?.signal });
  } catch (err: unknown) {
    const statusCode = axios.isAxiosError(err) ? err.response?.status : undefined;
    const errorCode = axios.isAxiosError(err) ? err.code : undefined;

    if (statusCode === 404) {
      return null;
    }
    if (errorCode === "ECONNABORTED") {
      throw new BtcExplorerClientError(
        "Timeout while calling BTC explorer API",
        "TIMEOUT",
        statusCode,
        err
      );
    }
    if (statusCode && statusCode >= 500) {
      throw new BtcExplorerClientError(
        "Server error while calling BTC explorer API",
        "SERVER",
        statusCode,
        err
      );
    }
    throw new BtcExplorerClientError(
      "Network error while calling BTC explorer API",
      "NETWORK",
      statusCode,
      err
    );
  }

  const parsed = btcSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new BtcExplorerClientError(
      "Invalid BTC explorer response: expected object",
      "INVALID_RESPONSE",
      response.status
    );
  }
  const data = parsed.data;

  const confirmed = Boolean(data.status?.confirmed);

  return {
    txid: normalizedTxid,
    isConfirmed: confirmed,
    blockHeight: data.status?.block_height,
    timestamp: data.status?.block_time,
    confirmations:
      typeof data.status?.confirmations === "number"
        ? data.status.confirmations
        : typeof data.confirmations === "number"
        ? data.confirmations
        : undefined,
  };
}

