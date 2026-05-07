import { describe, it, expect, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { fetchPowpegStatusByBtcTxId, PowpegClientError } from "./powpegClient";

function mockClient(data: unknown, status = 200): AxiosInstance {
  return {
    get: vi.fn().mockResolvedValue({ data, status }),
  } as unknown as AxiosInstance;
}

function axiosErrorClient(httpStatus: number, code?: string): AxiosInstance {
  const err = Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    code,
    response: { status: httpStatus },
  });
  return {
    get: vi.fn().mockRejectedValue(err),
  } as unknown as AxiosInstance;
}

const CLIENT_OPTS = {
  baseUrl: "https://api.2wp.testnet.rootstock.io",
};
const TXID = "a".repeat(64);

const MINIMAL_RESPONSE = {
  btcTxId: TXID,
  status: "completed",
};

describe("fetchPowpegStatusByBtcTxId", () => {
  it("returns null for 404 response", async () => {
    const client = axiosErrorClient(404);
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result).toBeNull();
  });

  it("throws PowpegClientError with TIMEOUT code on ECONNABORTED", async () => {
    const client = axiosErrorClient(408, "ECONNABORTED");
    await expect(
      fetchPowpegStatusByBtcTxId(TXID, {
        ...CLIENT_OPTS,
        axiosInstance: client,
      })
    ).rejects.toBeInstanceOf(PowpegClientError);

    try {
      await fetchPowpegStatusByBtcTxId(TXID, {
        ...CLIENT_OPTS,
        axiosInstance: client,
      });
    } catch (err) {
      expect((err as PowpegClientError).code).toBe("TIMEOUT");
    }
  });

  it("throws PowpegClientError with SERVER code on 5xx", async () => {
    const client = axiosErrorClient(503);
    try {
      await fetchPowpegStatusByBtcTxId(TXID, {
        ...CLIENT_OPTS,
        axiosInstance: client,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PowpegClientError);
      expect((err as PowpegClientError).code).toBe("SERVER");
    }
  });

  it("maps 'completed' status string to COMPLETED", async () => {
    const client = mockClient({ btcTxId: TXID, status: "completed" });
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result).not.toBeNull();
    expect(result?.highLevelStatus).toBe("COMPLETED");
    expect(result?.btcTxId).toBe(TXID);
  });

  it("maps 'processing' status string to PROCESSING", async () => {
    const client = mockClient({ btcTxId: TXID, status: "processing" });
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.highLevelStatus).toBe("PROCESSING");
  });

  it("maps unknown status to PENDING fail-safe", async () => {
    const client = mockClient({ btcTxId: TXID, status: "new-api-state" });
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });
    expect(result?.highLevelStatus).toBe("PENDING");
  });

  it("maps 'failed' status string to FAILED", async () => {
    const client = mockClient({ btcTxId: TXID, status: "failed" });
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.highLevelStatus).toBe("FAILED");
  });

  it("maps refund object presence to REFUNDED status", async () => {
    const client = mockClient({
      btcTxId: TXID,
      status: "pending",
      refund: { txHash: "refundtx" },
    });
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.highLevelStatus).toBe("REFUNDED");
  });

  it("extracts confirmations and requiredConfirmations", async () => {
    const client = mockClient({
      btcTxId: TXID,
      status: "processing",
      confirmations: 5,
      requiredConfirmations: 100,
    });
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.confirmations).toBe(5);
    expect(result?.requiredConfirmations).toBe(100);
  });

  it("accepts btcTxHash field name as alias for btcTxId", async () => {
    const client = mockClient({ btcTxHash: TXID, status: "pending" });
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.btcTxId).toBe(TXID);
  });

  it("preserves raw response on result", async () => {
    const rawData = { btcTxId: TXID, status: "completed", extra: 42 };
    const client = mockClient(rawData);
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.raw.status).toBe("completed");
    expect(result?.raw.btcTxId).toBe(TXID);
    expect(result?.raw.hasRefundHint).toBe(false);
  });

  it("throws PowpegClientError for non-object responses", async () => {
    const client = mockClient("not an object");
    await expect(
      fetchPowpegStatusByBtcTxId(TXID, {
        ...CLIENT_OPTS,
        axiosInstance: client,
      })
    ).rejects.toBeInstanceOf(PowpegClientError);
  });

  it("uses btcTxId from options as fallback id when not in response", async () => {
    const client = mockClient(MINIMAL_RESPONSE);
    const result = await fetchPowpegStatusByBtcTxId(TXID, {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.id).toBe(TXID);
  });
});
