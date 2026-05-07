import { describe, it, expect, vi } from "vitest";
import type { AxiosInstance } from "axios";
import {
  fetchFlyoverPeginStatusByQuoteHash,
  FlyoverClientError,
} from "./flyoverClient";

const PROVIDER = {
  provider: "0xLiquidityProviderRskAddress",
  apiBaseUrl: "https://lps.testnet.example.com",
};
const BTC_TXID = "a".repeat(64);

function mockClient(data: unknown, status = 200): AxiosInstance {
  return {
    get: vi.fn().mockResolvedValue({ data, status }),
  } as unknown as AxiosInstance;
}

function axiosErrorClient(httpStatus: number): AxiosInstance {
  const err = Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status: httpStatus },
  });
  return {
    get: vi.fn().mockRejectedValue(err),
  } as unknown as AxiosInstance;
}

function networkErrorClient(): AxiosInstance {
  const err = Object.assign(new Error("Network Error"), {
    isAxiosError: true,
    response: undefined,
  });
  return {
    get: vi.fn().mockRejectedValue(err),
  } as unknown as AxiosInstance;
}

const baseStatusDto = {
  quoteHash: "0xdeadbeef",
  state: "WaitingForDeposit",
  userBtcTxHash: "",
  callForUserTxHash: "",
  registerPeginTxHash: "",
  depositAddress: "bc1qdeposit",
  signature: "0xsig",
};

const baseDetailDto = {
  btcRefundAddr: "bc1qrefund",
  rskRefundAddr: "0xrskrefund",
  value: "500000000000000000",
  confirmations: 2,
};

describe("fetchFlyoverPeginStatusByQuoteHash", () => {
  it("maps WaitingForDeposit → PENDING simpleStatus", async () => {
    const client = mockClient({ status: baseStatusDto, detail: baseDetailDto });
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xdeadbeef", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result).not.toBeNull();
    expect(result?.simpleStatus).toBe("PENDING");
    expect(result?.rawState).toBe("WaitingForDeposit");
    expect(result?.quoteHash).toBe("0xdeadbeef");
  });

  it("maps WaitingForDepositConfirmations → PENDING simpleStatus", async () => {
    const client = mockClient({
      status: { ...baseStatusDto, state: "WaitingForDepositConfirmations" },
      detail: baseDetailDto,
    });
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result?.simpleStatus).toBe("PENDING");
    expect(result?.rawState).toBe("WaitingForDepositConfirmations");
  });

  it("maps CallForUserSucceeded → SUCCESS simpleStatus", async () => {
    const client = mockClient({
      status: {
        ...baseStatusDto,
        state: "CallForUserSucceeded",
        callForUserTxHash: "0xcall4user",
        userBtcTxHash: BTC_TXID,
      },
      detail: baseDetailDto,
    });
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result?.simpleStatus).toBe("SUCCESS");
    expect(result?.rskTxId).toBe("0xcall4user");
    expect(result?.btcTxId).toBe(BTC_TXID);
  });

  it("maps RegisterPegInSucceeded → SUCCESS simpleStatus", async () => {
    const client = mockClient({
      status: {
        ...baseStatusDto,
        state: "RegisterPegInSucceeded",
        registerPeginTxHash: "0xregister",
      },
      detail: baseDetailDto,
    });
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result?.simpleStatus).toBe("SUCCESS");
    expect(result?.rskTxId).toBe("0xregister");
  });

  it("maps TimeForDepositElapsed → EXPIRED simpleStatus (deposit window closed)", async () => {
    const client = mockClient({
      status: { ...baseStatusDto, state: "TimeForDepositElapsed" },
      detail: baseDetailDto,
    });
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result?.simpleStatus).toBe("EXPIRED");
  });

  it("maps CallForUserFailed → FAILED simpleStatus", async () => {
    const client = mockClient({
      status: { ...baseStatusDto, state: "CallForUserFailed" },
      detail: baseDetailDto,
    });
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result?.simpleStatus).toBe("FAILED");
  });

  it("extracts btcAddress and rskAddress from detail DTO", async () => {
    const client = mockClient({ status: baseStatusDto, detail: baseDetailDto });
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result?.btcAddress).toBe("bc1qrefund");
    expect(result?.rskAddress).toBe("0xrskrefund");
    expect(result?.requiredConfirmations).toBe(2);
    expect(result?.rbtcAmountWei).toBe("500000000000000000");
  });

  it("returns null for 404 response", async () => {
    const client = axiosErrorClient(404);
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result).toBeNull();
  });

  it("returns null for 400 response", async () => {
    const client = axiosErrorClient(400);
    const result = await fetchFlyoverPeginStatusByQuoteHash("0xhash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result).toBeNull();
  });

  it("rethrows non-404/400 errors", async () => {
    const client = axiosErrorClient(500);
    await expect(
      fetchFlyoverPeginStatusByQuoteHash("0xhash", {
        provider: PROVIDER,
        axiosInstance: client,
      })
    ).rejects.toBeInstanceOf(FlyoverClientError);
  });

  it("rethrows network errors", async () => {
    const client = networkErrorClient();
    await expect(
      fetchFlyoverPeginStatusByQuoteHash("0xhash", {
        provider: PROVIDER,
        axiosInstance: client,
      })
    ).rejects.toBeInstanceOf(FlyoverClientError);
  });

  it("throws for invalid response when status is missing", async () => {
    const client = mockClient({ detail: baseDetailDto });
    await expect(
      fetchFlyoverPeginStatusByQuoteHash("0xhash", {
        provider: PROVIDER,
        axiosInstance: client,
      })
    ).rejects.toBeInstanceOf(FlyoverClientError);
  });

  it("falls back to input quoteHash if not in response", async () => {
    const client = mockClient({
      status: { ...baseStatusDto, quoteHash: "" },
      detail: baseDetailDto,
    });
    const result = await fetchFlyoverPeginStatusByQuoteHash("fallback-hash", {
      provider: PROVIDER,
      axiosInstance: client,
    });

    expect(result?.quoteHash).toBe("fallback-hash");
  });

  it("rejects non-http provider URLs", async () => {
    await expect(
      fetchFlyoverPeginStatusByQuoteHash("0xhash", {
        provider: { ...PROVIDER, apiBaseUrl: "javascript:alert(1)" },
      })
    ).rejects.toThrow("provider.apiBaseUrl");
  });
});
