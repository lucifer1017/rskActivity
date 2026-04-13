import axios, { type AxiosInstance } from "axios";
export interface FlyoverLiquidityProvider {
  provider: string;
  apiBaseUrl: string;
}

export type FlyoverSimpleStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface FlyoverClientOptions {
  provider: FlyoverLiquidityProvider;
  timeoutMs?: number;
  axiosInstance?: AxiosInstance;
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
  const baseUrl = options.provider.apiBaseUrl.replace(/\/+$/, "");
  const client =
    options.axiosInstance ??
    axios.create({ timeout: options.timeoutMs ?? 10_000 });

  let response;
  try {
    response = await client.get(`${baseUrl}/pegin/status`, {
      params: { quoteHash },
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404 || status === 400) return null;
    }
    throw err;
  }

  const raw = response.data as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return null;

  const statusDto = raw.status as Record<string, unknown> | undefined;
  const detailDto = raw.detail as Record<string, unknown> | undefined;

  if (!statusDto) return null;

  const rawState = typeof statusDto.state === "string" ? statusDto.state : "";

  const rskTxId =
    (typeof statusDto.callForUserTxHash === "string" &&
      statusDto.callForUserTxHash) ||
    (typeof statusDto.registerPeginTxHash === "string" &&
      statusDto.registerPeginTxHash) ||
    undefined;

  const rbtcAmountWei =
    typeof detailDto?.value === "bigint"
      ? detailDto.value.toString()
      : typeof detailDto?.value === "string"
      ? detailDto.value || undefined
      : undefined;

  return {
    quoteHash:
      (typeof statusDto.quoteHash === "string" && statusDto.quoteHash) ||
      quoteHash,
    rawState,
    simpleStatus: deriveSimpleStatus(rawState),
    btcTxId:
      (typeof statusDto.userBtcTxHash === "string" &&
        statusDto.userBtcTxHash) ||
      undefined,
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
