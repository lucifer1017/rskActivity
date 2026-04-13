import axios, { type AxiosInstance } from "axios";

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
  raw: unknown;
}

export interface PowpegClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  axiosInstance?: AxiosInstance;
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

  return "PROCESSING";
}
export async function fetchPowpegStatusByBtcTxId(
  btcTxId: string,
  options: PowpegClientOptions
): Promise<PowpegStatus | null> {
  const timeoutMs = options.timeoutMs ?? 10_000;

  const client =
    options.axiosInstance ??
    axios.create({
      baseURL: options.baseUrl.replace(/\/+$/, ""),
      timeout: timeoutMs,
    });
  const url = `/api/v1/pegins/${encodeURIComponent(btcTxId)}`;

  let response;
  try {
    response = await client.get(url);
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

  const raw = response.data as Record<string, unknown>;

  if (!raw || typeof raw !== "object") {
    throw new PowpegClientError(
      "Invalid PowPeg API response: expected JSON object",
      "INVALID_RESPONSE",
      response.status
    );
  }

  const id: string =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw._id === "string" && raw._id) ||
    btcTxId;

  const side: PowpegBridgeSide =
    raw.side === "pegout" || raw.bridgeType === "pegout" ? "pegout" : "pegin";

  const btcHash: string =
    (typeof raw.btcTxId === "string" && raw.btcTxId) ||
    (typeof raw.btcTxHash === "string" && raw.btcTxHash) ||
    btcTxId;

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
    btcTxId: btcHash,
    rskTxId,
    btcAddress,
    rskAddress,
    btcAmountSats,
    rbtcAmountWei,
    confirmations,
    requiredConfirmations,
    highLevelStatus,
    raw,
  };
}

