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

const MINIMAL_RESPONSE = {
  btcTxId: "abc123",
  status: "completed",
};

describe("fetchPowpegStatusByBtcTxId", () => {
  it("returns null for 404 response", async () => {
    const client = axiosErrorClient(404);
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result).toBeNull();
  });

  it("throws PowpegClientError with TIMEOUT code on ECONNABORTED", async () => {
    const client = axiosErrorClient(408, "ECONNABORTED");
    await expect(
      fetchPowpegStatusByBtcTxId("abc123", {
        ...CLIENT_OPTS,
        axiosInstance: client,
      })
    ).rejects.toBeInstanceOf(PowpegClientError);

    try {
      await fetchPowpegStatusByBtcTxId("abc123", {
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
      await fetchPowpegStatusByBtcTxId("abc123", {
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
    const client = mockClient({ btcTxId: "abc123", status: "completed" });
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result).not.toBeNull();
    expect(result?.highLevelStatus).toBe("COMPLETED");
    expect(result?.btcTxId).toBe("abc123");
  });

  it("maps 'processing' status string to PROCESSING", async () => {
    const client = mockClient({ btcTxId: "abc123", status: "processing" });
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.highLevelStatus).toBe("PROCESSING");
  });

  it("maps 'failed' status string to FAILED", async () => {
    const client = mockClient({ btcTxId: "abc123", status: "failed" });
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.highLevelStatus).toBe("FAILED");
  });

  it("maps refund object presence to REFUNDED status", async () => {
    const client = mockClient({
      btcTxId: "abc123",
      status: "pending",
      refund: { txHash: "refundtx" },
    });
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.highLevelStatus).toBe("REFUNDED");
  });

  it("extracts confirmations and requiredConfirmations", async () => {
    const client = mockClient({
      btcTxId: "abc123",
      status: "processing",
      confirmations: 5,
      requiredConfirmations: 100,
    });
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.confirmations).toBe(5);
    expect(result?.requiredConfirmations).toBe(100);
  });

  it("accepts btcTxHash field name as alias for btcTxId", async () => {
    const client = mockClient({ btcTxHash: "tx-from-hash-field", status: "pending" });
    const result = await fetchPowpegStatusByBtcTxId("tx-from-hash-field", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.btcTxId).toBe("tx-from-hash-field");
  });

  it("preserves raw response on result", async () => {
    const rawData = { btcTxId: "abc123", status: "completed", extra: 42 };
    const client = mockClient(rawData);
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.raw).toEqual(rawData);
  });

  it("throws PowpegClientError for non-object responses", async () => {
    const client = mockClient("not an object");
    await expect(
      fetchPowpegStatusByBtcTxId("abc123", {
        ...CLIENT_OPTS,
        axiosInstance: client,
      })
    ).rejects.toBeInstanceOf(PowpegClientError);
  });

  it("uses btcTxId from options as fallback id when not in response", async () => {
    const client = mockClient(MINIMAL_RESPONSE);
    const result = await fetchPowpegStatusByBtcTxId("abc123", {
      ...CLIENT_OPTS,
      axiosInstance: client,
    });

    expect(result?.id).toBe("abc123");
  });
});
