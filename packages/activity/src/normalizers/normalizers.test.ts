import { describe, it, expect } from "vitest";
import { normalizeBtcTxStatusToActivityItem } from "./btcNormalizer";
import { normalizePowpegStatusToActivityItem } from "./powpegNormalizer";
import { normalizeFlyoverStatusToActivityItem } from "./flyoverNormalizer";
import type { BtcTxStatus } from "../api/btcExplorerClient";
import type { PowpegStatus } from "../api/powpegClient";
import type { FlyoverPeginStatus } from "../api/flyoverClient";
import { makeActivityId } from "../utils/activityId";

describe("normalizeBtcTxStatusToActivityItem", () => {
  const base: BtcTxStatus = {
    txid: "btctx1",
    isConfirmed: false,
  };

  it("unconfirmed tx → PENDING status", () => {
    const item = normalizeBtcTxStatusToActivityItem({ ...base, isConfirmed: false });
    expect(item.status).toBe("PENDING");
    expect(item.type).toBe("BITCOIN_MEMPOOL");
  });

  it("confirmed tx → CONFIRMING status", () => {
    const item = normalizeBtcTxStatusToActivityItem({
      ...base,
      isConfirmed: true,
      blockHeight: 800_000,
    });
    expect(item.status).toBe("CONFIRMING");
    expect(item.btcBlockHeight).toBe(800_000);
  });

  it("uses canonical bridge:btc: id from makeActivityId", () => {
    const item = normalizeBtcTxStatusToActivityItem(base);
    expect(item.id).toBe(makeActivityId("BTC", "btctx1"));
    expect(item.id).toBe("bridge:btc:btctx1");
  });

  it("sets btcTxId from txid", () => {
    const item = normalizeBtcTxStatusToActivityItem(base);
    expect(item.btcTxId).toBe("btctx1");
  });

  it("sets title and description", () => {
    const item = normalizeBtcTxStatusToActivityItem(base);
    expect(item.title).toBeTruthy();
    expect(item.description).toBeTruthy();
  });

  it("etaMinutes is null (no confirmation data from explorer alone)", () => {
    const item = normalizeBtcTxStatusToActivityItem(base);
    expect(item.etaMinutes).toBeNull();
  });
});

describe("normalizePowpegStatusToActivityItem", () => {
  const base: PowpegStatus = {
    id: "powpeg1",
    side: "pegin",
    btcTxId: "btctx1",
    highLevelStatus: "PENDING",
    raw: {},
  };

  it("PENDING highLevel → PENDING status", () => {
    const item = normalizePowpegStatusToActivityItem({ ...base, highLevelStatus: "PENDING" });
    expect(item.status).toBe("PENDING");
  });

  it("PROCESSING highLevel → BRIDGING status", () => {
    const item = normalizePowpegStatusToActivityItem({ ...base, highLevelStatus: "PROCESSING" });
    expect(item.status).toBe("BRIDGING");
  });

  it("COMPLETED highLevel → COMPLETED status", () => {
    const item = normalizePowpegStatusToActivityItem({ ...base, highLevelStatus: "COMPLETED" });
    expect(item.status).toBe("COMPLETED");
  });

  it("REFUNDED highLevel → REFUNDED status", () => {
    const item = normalizePowpegStatusToActivityItem({ ...base, highLevelStatus: "REFUNDED" });
    expect(item.status).toBe("REFUNDED");
  });

  it("FAILED highLevel → FAILED status", () => {
    const item = normalizePowpegStatusToActivityItem({ ...base, highLevelStatus: "FAILED" });
    expect(item.status).toBe("FAILED");
  });

  it("uses canonical bridge:btc: id when btcTxId present", () => {
    const item = normalizePowpegStatusToActivityItem(base);
    expect(item.id).toBe("bridge:btc:btctx1");
  });

  it("calculates ETA from confirmation progress", () => {
    const item = normalizePowpegStatusToActivityItem({
      ...base,
      highLevelStatus: "PROCESSING",
      confirmations: 10,
      requiredConfirmations: 100,
    });
    expect(item.etaMinutes).toBe(905);
  });

  it("ETA is null for COMPLETED status", () => {
    const item = normalizePowpegStatusToActivityItem({
      ...base,
      highLevelStatus: "COMPLETED",
    });
    expect(item.etaMinutes).toBeNull();
  });

  it("description reflects confirmation progress when data available", () => {
    const item = normalizePowpegStatusToActivityItem({
      ...base,
      highLevelStatus: "PROCESSING",
      confirmations: 5,
      requiredConfirmations: 100,
    });
    expect(item.description).toContain("5 / 100");
  });

  it("passes through amount fields", () => {
    const item = normalizePowpegStatusToActivityItem({
      ...base,
      btcAmountSats: "500000",
      rbtcAmountWei: "4990000000000000",
    });
    expect(item.btcAmountSats).toBe("500000");
    expect(item.rbtcAmountWei).toBe("4990000000000000");
  });
});

describe("normalizeFlyoverStatusToActivityItem", () => {
  const base: FlyoverPeginStatus = {
    quoteHash: "0xquote1",
    rawState: "WaitingForDeposit",
    simpleStatus: "PENDING",
  };

  it("WaitingForDeposit → PENDING status", () => {
    const item = normalizeFlyoverStatusToActivityItem({ ...base, rawState: "WaitingForDeposit" });
    expect(item.status).toBe("PENDING");
    expect(item.type).toBe("FLYOVER");
  });

  it("WaitingForDepositConfirmations → CONFIRMING status", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      rawState: "WaitingForDepositConfirmations",
    });
    expect(item.status).toBe("CONFIRMING");
  });

  it("CallForUserSucceeded → COMPLETED status", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      rawState: "CallForUserSucceeded",
      simpleStatus: "SUCCESS",
    });
    expect(item.status).toBe("COMPLETED");
  });

  it("RegisterPegInSucceeded → COMPLETED status", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      rawState: "RegisterPegInSucceeded",
      simpleStatus: "SUCCESS",
    });
    expect(item.status).toBe("COMPLETED");
  });

  it("TimeForDepositElapsed → REFUNDED status", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      rawState: "TimeForDepositElapsed",
      simpleStatus: "FAILED",
    });
    expect(item.status).toBe("REFUNDED");
  });

  it("uses bridge:btc: id when btcTxId present", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      btcTxId: "btctxflyover",
    });
    expect(item.id).toBe("bridge:btc:btctxflyover");
  });

  it("falls back to flyover-quote id when no txids", () => {
    const item = normalizeFlyoverStatusToActivityItem(base);
    expect(item.id).toBe("bridge:flyover-quote:0xquote1");
  });

  it("sets ETA for CONFIRMING status", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      rawState: "WaitingForDepositConfirmations",
    });
    expect(item.etaMinutes).toBeGreaterThan(0);
  });

  it("ETA is null for COMPLETED status", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      rawState: "CallForUserSucceeded",
      simpleStatus: "SUCCESS",
    });
    expect(item.etaMinutes).toBeNull();
  });

  it("sets subStatus from rawState", () => {
    const item = normalizeFlyoverStatusToActivityItem({
      ...base,
      rawState: "WaitingForDeposit",
    });
    expect(item.subStatus).toBe("WaitingForDeposit");
  });

  it("sets title and description", () => {
    const item = normalizeFlyoverStatusToActivityItem(base);
    expect(item.title).toBeTruthy();
    expect(item.description).toBeTruthy();
  });
});
