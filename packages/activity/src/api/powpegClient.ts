import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import { normalizeBtcTxId, normalizeOptionalBtcTxId } from "../utils/validation";

export type PowpegBridgeSide = "pegin" | "pegout";

export type PowpegHighLevelStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "REFUNDED"
  | "FAILED";

export interface PowpegStatus {
  id: string;
  side: PowpegBridgeSide;
  btcTxId: string;
  rskTxId?: string;
  btcAddress?: string;
  rskAddress?: string;
  btcAmountSats?: string;
  rbtcAmountWei?: string;
  confirmations?: number;
  requiredConfirmations?: number;
  highLevelStatus: PowpegHighLevelStatus;
  raw: {
    status?: string;
    state?: string;
    btcTxId?: string;
    rskTxId?: string;
    confirmations?: number;
    requiredConfirmations?: number;
    hasRefundHint: boolean;
  };
}

export interface PowpegClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  axiosInstance?: AxiosInstance;
  signal?: AbortSignal;
}

export type PowpegClientErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "SERVER"
  | "INVALID_RESPONSE";

export class PowpegClientError extends Error {
  readonly code: PowpegClientErrorCode;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(message: string, code: PowpegClientErrorCode, statusCode?: number, cause?: unknown) {
    super(message);
    this.name = "PowpegClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

const powpegSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(),
  side: z.string().optional(),
  bridgeType: z.string().optional(),
  btcTxId: z.string().optional(),
  btcTxHash: z.string().optional(),
  rskTxId: z.string().optional(),
  rskTxHash: z.string().optional(),
  btcAddress: z.string().optional(),
  senderBtcAddress: z.string().optional(),
  rskAddress: z.string().optional(),
  destinationRskAddress: z.string().optional(),
  confirmations: z.number().optional(),
  btcConfirmations: z.number().optional(),
  requiredConfirmations: z.number().optional(),
  btcRequiredConfirmations: z.number().optional(),
  status: z.string().optional(),
  state: z.string().optional(),
  refund: z.unknown().optional(),
  refundTxId: z.unknown().optional(),
  refundTxHash: z.unknown().optional(),
  refundBtcAddress: z.unknown().optional(),
  btcAmountSats: z.string().optional(),
  btcAmount: z.number().optional(),
  rbtcAmountWei: z.string().optional(),
  rskAmount: z.number().optional(),
}).passthrough();

function normalizeHighLevelStatus(input?: string | null, hasRefund?: boolean): PowpegHighLevelStatus {
  const value = (input ?? "").toLowerCase();

  if (hasRefund) {
    if (value === "completed" || value === "success") {
      return "COMPLETED";
    }
    return "REFUNDED";
  }

  if (value === "completed" || value === "success" || value === "done") {
    return "COMPLETED";
  }

  if (value === "failed" || value === "error") {
    return "FAILED";
  }

  if (value === "processing" || value === "bridge" || value === "in_progress") {
    return "PROCESSING";
  }

  if (value === "pending" || value === "waiting" || value === "new") {
    return "PENDING";
  }

  return "PENDING";
}
export async function fetchPowpegStatusByBtcTxId(
  btcTxId: string,
  options: PowpegClientOptions
): Promise<PowpegStatus | null> {
  const normalizedInputTxId = normalizeBtcTxId(btcTxId);
  if (!normalizedInputTxId) {
    throw new PowpegClientError("Invalid btcTxId format", "INVALID_RESPONSE");
  }

  const timeoutMs = options.timeoutMs ?? 10_000;

  const client =
    options.axiosInstance ??
    axios.create({
      baseURL: options.baseUrl.replace(/\/+$/, ""),
      timeout: timeoutMs,
    });
  const url = `/api/v1/pegins/${encodeURIComponent(normalizedInputTxId)}`;

  let response;
  try {
    response = await client.get(url, { signal: options.signal });
  } catch (err: unknown) {
    const statusCode = axios.isAxiosError(err) ? err.response?.status : undefined;
    const errorCode = axios.isAxiosError(err) ? err.code : undefined;

    if (statusCode === 404) {
      return null;
    }

    if (errorCode === "ECONNABORTED") {
      throw new PowpegClientError(
        "Timeout while calling PowPeg API",
        "TIMEOUT",
        statusCode,
        err
      );
    }

    if (statusCode && statusCode >= 500) {
      throw new PowpegClientError(
        "Server error while calling PowPeg API",
        "SERVER",
        statusCode,
        err
      );
    }

    throw new PowpegClientError(
      "Network error while calling PowPeg API",
      "NETWORK",
      statusCode,
      err
    );
  }

  const parsed = powpegSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new PowpegClientError(
      "Invalid PowPeg API response: expected JSON object",
      "INVALID_RESPONSE",
      response.status
    );
  }
  const raw = parsed.data;

  const id: string =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw._id === "string" && raw._id) ||
    normalizedInputTxId;

  const side: PowpegBridgeSide =
    raw.side === "pegout" || raw.bridgeType === "pegout" ? "pegout" : "pegin";

  const btcHash: string =
    (typeof raw.btcTxId === "string" && raw.btcTxId) ||
    (typeof raw.btcTxHash === "string" && raw.btcTxHash) ||
    normalizedInputTxId;

  const normalizedBtcHash = normalizeOptionalBtcTxId(btcHash) ?? normalizedInputTxId;

  const rskTxId: string | undefined =
    (typeof raw.rskTxId === "string" && raw.rskTxId) ||
    (typeof raw.rskTxHash === "string" && raw.rskTxHash) ||
    undefined;

  const btcAddress: string | undefined =
    (typeof raw.btcAddress === "string" && raw.btcAddress) ||
    (typeof raw.senderBtcAddress === "string" && raw.senderBtcAddress) ||
    undefined;

  const rskAddress: string | undefined =
    (typeof raw.rskAddress === "string" && raw.rskAddress) ||
    (typeof raw.destinationRskAddress === "string" &&
      raw.destinationRskAddress) ||
    undefined;

  const confirmations: number | undefined =
    typeof raw.confirmations === "number"
      ? raw.confirmations
      : typeof raw.btcConfirmations === "number"
      ? raw.btcConfirmations
      : undefined;

  const requiredConfirmations: number | undefined =
    typeof raw.requiredConfirmations === "number"
      ? raw.requiredConfirmations
      : typeof raw.btcRequiredConfirmations === "number"
      ? raw.btcRequiredConfirmations
      : undefined;

  const statusText: string | undefined =
    (typeof raw.status === "string" && raw.status) ||
    (typeof raw.state === "string" && raw.state) ||
    undefined;

  const hasRefund =
    !!raw.refund ||
    !!raw.refundTxId ||
    !!raw.refundTxHash ||
    !!raw.refundBtcAddress;

  const highLevelStatus = normalizeHighLevelStatus(statusText, hasRefund);

  const btcAmountSats: string | undefined =
    typeof raw.btcAmountSats === "string"
      ? raw.btcAmountSats
      : typeof raw.btcAmount === "number"
      ? String(raw.btcAmount)
      : undefined;

  const rbtcAmountWei: string | undefined =
    typeof raw.rbtcAmountWei === "string"
      ? raw.rbtcAmountWei
      : typeof raw.rskAmount === "number"
      ? String(raw.rskAmount)
      : undefined;

  return {
    id,
    side,
    btcTxId: normalizedBtcHash,
    rskTxId,
    btcAddress,
    rskAddress,
    btcAmountSats,
    rbtcAmountWei,
    confirmations,
    requiredConfirmations,
    highLevelStatus,
    raw: {
      status: statusText,
      state: typeof raw.state === "string" ? raw.state : undefined,
      btcTxId: normalizedBtcHash,
      rskTxId,
      confirmations,
      requiredConfirmations,
      hasRefundHint: hasRefund,
    },
  };
}

