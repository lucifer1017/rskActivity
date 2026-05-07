import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import {
  BtcExplorerClientError,
  fetchBtcTxStatus,
} from "./btcExplorerClient";

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

describe("fetchBtcTxStatus", () => {
  it("returns null for 404 responses", async () => {
    const result = await fetchBtcTxStatus("a".repeat(64), {
      axiosInstance: axiosErrorClient(404),
    });
    expect(result).toBeNull();
  });

  it("throws typed timeout error", async () => {
    await expect(
      fetchBtcTxStatus("a".repeat(64), {
        axiosInstance: axiosErrorClient(408, "ECONNABORTED"),
      })
    ).rejects.toBeInstanceOf(BtcExplorerClientError);
  });

  it("parses confirmations when available", async () => {
    const result = await fetchBtcTxStatus("a".repeat(64), {
      axiosInstance: mockClient({
        status: { confirmed: true, block_height: 10, confirmations: 2 },
      }),
    });
    expect(result?.confirmations).toBe(2);
    expect(result?.isConfirmed).toBe(true);
  });

  it("rejects malformed txid", async () => {
    await expect(fetchBtcTxStatus("invalid-txid")).rejects.toBeInstanceOf(
      BtcExplorerClientError
    );
  });
});
