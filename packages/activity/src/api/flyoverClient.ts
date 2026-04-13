import axios, { type AxiosInstance } from "axios";

/**
 * Minimal LP descriptor compatible with @rsksmart/flyover-sdk's LiquidityProvider.
 *
 * The SDK's full LiquidityProvider includes `provider` (LP RSK address) and
 * `apiBaseUrl` (LP REST server URL). We only need `apiBaseUrl` to call the
 * status endpoint, but we accept the full SDK object via structural typing —
 * callers can pass a raw LiquidityProvider without any wrapping.
 */
export interface FlyoverLiquidityProvider {
  /** RSK address of the Liquidity Provider. */
  provider: string;
  /** Base URL of the LP REST API (e.g. https://lps.testnet.rootstock.io). */
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
  /** Raw LPS state string, e.g. "WaitingForDeposit", "CallForUserSucceeded". */
  rawState: string;
  simpleStatus: FlyoverSimpleStatus;
  /** User's BTC funding transaction hash. */
  btcTxId?: string;
  /** RSK transaction hash where the LP delivered RBTC to the user. */
  rskTxId?: string;
  btcAddress?: string;
  rskAddress?: string;
  /** Transfer value in wei (as string). */
  rbtcAmountWei?: string;
  /** Number of BTC confirmations required before the LP acts. */
  requiredConfirmations?: number;
}

/**
 * Derive a simplified status from the LPS raw state string.
 *
 * States per the Flyover LPS OpenAPI spec (RetainedPeginQuoteDTO.state):
 *  - WaitingForDeposit              → PENDING  (waiting for user BTC deposit)
 *  - WaitingForDepositConfirmations → PENDING  (BTC sent, accumulating confs)
 *  - CallForUserSucceeded           → SUCCESS  (RBTC delivered to user)
 *  - RegisterPegInSucceeded         → SUCCESS  (peg-in registered)
 *  - TimeForDepositElapsed          → EXPIRED  (deposit window closed)
 *  - CallForUserFailed              → FAILED   (LP call failed)
 *  - RegisterPegInFailed            → FAILED   (registration failed)
 */
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

/**
 * Fetch peg-in status for a given quote hash from the LP server REST API.
 *
 * Calls: GET {apiBaseUrl}/pegin/status?quoteHash={hash}
 * Response shape follows the LPS OpenAPI PeginQuoteStatusDTO:
 *   { status: RetainedPeginQuoteDTO, detail: PeginQuoteDTO, creationData: ... }
 *
 * This function has zero dependency on @rsksmart/flyover-sdk — only axios.
 * The SDK is designed for initiating transactions; for status polling a
 * direct REST call is simpler and avoids all heavy cryptographic dependencies.
 */
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
      // 404 = quote not found / not accepted yet; 400 = bad request — both are
      // treated as "no data yet" rather than a hard error.
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
