import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import { assertHttpUrl, normalizeOptionalBtcTxId } from "../utils/validation";
export interface FlyoverLiquidityProvider {
  provider: string;
  apiBaseUrl: string;
}

export type FlyoverSimpleStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface FlyoverClientOptions {
  provider: FlyoverLiquidityProvider;
  timeoutMs?: number;
  axiosInstance?: AxiosInstance;
  signal?: AbortSignal;
}

export interface FlyoverPeginStatus {
  quoteHash: string;
  rawState: string;
  simpleStatus: FlyoverSimpleStatus;
  btcTxId?: string;
  rskTxId?: string;
  btcAddress?: string;
  rskAddress?: string;
  rbtcAmountWei?: string;
  requiredConfirmations?: number;
}

export type FlyoverClientErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "SERVER"
  | "INVALID_RESPONSE";

export class FlyoverClientError extends Error {
  readonly code: FlyoverClientErrorCode;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(message: string, code: FlyoverClientErrorCode, statusCode?: number, cause?: unknown) {
    super(message);
    this.name = "FlyoverClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

const flyoverSchema = z.object({
  status: z
    .object({
      quoteHash: z.string().optional(),
      state: z.string().optional(),
      userBtcTxHash: z.string().optional(),
      callForUserTxHash: z.string().optional(),
      registerPeginTxHash: z.string().optional(),
    })
    .optional(),
  detail: z
    .object({
      btcRefundAddr: z.string().optional(),
      rskRefundAddr: z.string().optional(),
      value: z.union([z.string(), z.bigint()]).optional(),
      confirmations: z.number().optional(),
    })
    .optional(),
});
function deriveSimpleStatus(state: string): FlyoverSimpleStatus {
  if (state === "CallForUserSucceeded" || state === "RegisterPegInSucceeded") {
    return "SUCCESS";
  }
  if (state === "TimeForDepositElapsed") {
    return "EXPIRED";
  }
  if (state === "CallForUserFailed" || state === "RegisterPegInFailed") {
    return "FAILED";
  }
  return "PENDING";
}

export async function fetchFlyoverPeginStatusByQuoteHash(
  quoteHash: string,
  options: FlyoverClientOptions
): Promise<FlyoverPeginStatus | null> {
  const baseUrl = assertHttpUrl(options.provider.apiBaseUrl, "provider.apiBaseUrl");
  const client =
    options.axiosInstance ??
    axios.create({ timeout: options.timeoutMs ?? 10_000 });

  let response;
  try {
    response = await client.get(`${baseUrl}/pegin/status`, {
      params: { quoteHash },
      signal: options.signal,
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404 || status === 400) return null;
      if (err.code === "ECONNABORTED") {
        throw new FlyoverClientError(
          "Timeout while calling Flyover LP API",
          "TIMEOUT",
          status,
          err
        );
      }
      if (status && status >= 500) {
        throw new FlyoverClientError(
          "Server error while calling Flyover LP API",
          "SERVER",
          status,
          err
        );
      }
      throw new FlyoverClientError(
        "Network error while calling Flyover LP API",
        "NETWORK",
        status,
        err
      );
    }
    throw new FlyoverClientError(
      "Unexpected error while calling Flyover LP API",
      "NETWORK",
      undefined,
      err
    );
  }

  const parsed = flyoverSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new FlyoverClientError(
      "Invalid Flyover API response: expected object",
      "INVALID_RESPONSE",
      response.status
    );
  }
  const raw = parsed.data;

  const statusDto = raw.status;
  const detailDto = raw.detail;

  if (!statusDto) {
    throw new FlyoverClientError(
      "Invalid Flyover API response: missing status object",
      "INVALID_RESPONSE",
      response.status
    );
  }

  const rawState = statusDto.state ?? "";

  const rskTxId =
    (typeof statusDto.callForUserTxHash === "string" &&
      statusDto.callForUserTxHash) ||
    (typeof statusDto.registerPeginTxHash === "string" &&
      statusDto.registerPeginTxHash) ||
    undefined;
  const normalizedBtcTxId = normalizeOptionalBtcTxId(statusDto.userBtcTxHash);

  const rbtcAmountWei =
    typeof detailDto?.value === "bigint"
      ? detailDto.value.toString()
      : typeof detailDto?.value === "string"
      ? detailDto.value || undefined
      : undefined;

  return {
    quoteHash:
      statusDto.quoteHash ||
      quoteHash,
    rawState,
    simpleStatus: deriveSimpleStatus(rawState),
    btcTxId: normalizedBtcTxId,
    rskTxId,
    btcAddress:
      (typeof detailDto?.btcRefundAddr === "string" &&
        detailDto.btcRefundAddr) ||
      undefined,
    rskAddress:
      (typeof detailDto?.rskRefundAddr === "string" &&
        detailDto.rskRefundAddr) ||
      undefined,
    rbtcAmountWei,
    requiredConfirmations:
      typeof detailDto?.confirmations === "number"
        ? detailDto.confirmations
        : undefined,
  };
}
