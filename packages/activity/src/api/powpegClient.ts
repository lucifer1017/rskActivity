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
  /**
   * Base URL of the 2wp-api / PowPeg backend.
   * Example: https://api.2wp.rootstock.io
   */
  baseUrl: string;
  /**
   * Optional timeout (in ms) for PowPeg HTTP requests.
   * Defaults to 10000ms.
   */
  timeoutMs?: number;
  /**
   * Optional custom Axios instance, primarily for testing.
   */
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

/**
 * Best-effort mapping from a raw PowPeg / 2wp-api status string and flags
 * into a stable PowpegHighLevelStatus value.
 *
 * This function is intentionally defensive: unknown / unexpected values are
 * coerced into a safe generic state instead of throwing.
 */
function normalizeHighLevelStatus(input?: string | null, hasRefund?: boolean): PowpegHighLevelStatus {
  const value = (input ?? "").toLowerCase();

  if (hasRefund) {
    // If a refund object is present we bias towards REFUNDED unless the
    // backend explicitly marks the transfer as completed.
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

  // Fallback when we cannot confidently distinguish between PENDING and
  // PROCESSING: default to PROCESSING to avoid implying the user must still
  // wait for initial confirmations.
  return "PROCESSING";
}

/**
 * Fetch PowPeg / 2wp-api status information for a peg-in transaction given
 * its funding Bitcoin transaction hash.
 *
 * Notes:
 * - A 404 / "not found" response is treated as "no PowPeg record yet" and
 *   results in `null`.
 * - Network / server errors are surfaced as PowpegClientError.
 *
 * The exact response shape of 2wp-api may evolve over time. This function
 * is written to be resilient: it only relies on a small set of fields and
 * preserves the full raw JSON for debugging and future-proofing.
 */
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

  // Endpoint path is based on the public 2wp-api deployment, where peg-in
  // lookups are exposed under /api/v1/pegins/{btcTxId}. If a different
  // deployment uses a different path, callers can provide a custom
  // Axios instance configured with the appropriate baseURL + interceptors.
  const url = `/api/v1/pegins/${encodeURIComponent(btcTxId)}`;

  let response;
  try {
    response = await client.get(url);
  } catch (err: unknown) {
    // Axios wraps errors with isAxiosError and may expose response / code.
    const statusCode = axios.isAxiosError(err) ? err.response?.status : undefined;
    const errorCode = axios.isAxiosError(err) ? err.code : undefined;

    if (statusCode === 404) {
      // No PowPeg record yet for this transaction.
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

  // The concrete 2wp-api schema may vary slightly across deployments.
  // We attempt to extract a minimal but useful subset here.
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

