import { describe, expect, it } from "vitest";
import { mergeActivities } from "./mergeActivities";
import { makeActivityId } from "../utils/activityId";
import type { ActivityItem, ActivityStatus, ActivityType } from "../types/activity";

function makeItem(
  id: string,
  status: ActivityStatus,
  type: ActivityType,
  createdAt: string,
  updatedAt: string
): ActivityItem {
  return {
    id,
    type,
    status,
    createdAt,
    updatedAt,
  };
}

describe("mergeActivities", () => {
  it("collapses same transfer from multiple sources into one item", () => {
    const id = makeActivityId("BTC", "abc123");

    const btcView = makeItem(
      id,
      "PENDING",
      "BITCOIN_MEMPOOL",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );
    const powpegView = makeItem(
      id,
      "COMPLETED",
      "POWPEG",
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:01.000Z"
    );

    const result = mergeActivities([], [[btcView], [powpegView]]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(id);
    expect(result.items[0].status).toBe("COMPLETED");
    expect(result.items[0].type).toBe("POWPEG");
    expect(result.events.map((event) => event.type)).toEqual([
      "itemCreated",
      "completed",
    ]);
  });

  it("emits a single net status change per cycle", () => {
    const id = makeActivityId("BTC", "tx-net-change");
    const previous = [
      makeItem(
        id,
        "PENDING",
        "BITCOIN_MEMPOOL",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      ),
    ];

    const result = mergeActivities(previous, [
      [
        makeItem(
          id,
          "CONFIRMING",
          "BITCOIN_MEMPOOL",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:02.000Z"
        ),
        makeItem(
          id,
          "BRIDGING",
          "POWPEG",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:03.000Z"
        ),
      ],
    ]);

    const statusChangedEvents = result.events.filter(
      (event) => event.type === "statusChanged"
    );

    expect(statusChangedEvents).toHaveLength(1);
    expect(result.items[0].status).toBe("BRIDGING");
    expect(result.events.map((event) => event.type)).not.toContain("completed");
  });

  it("emits terminal event for final status only", () => {
    const id = makeActivityId("BTC", "tx-terminal");
    const previous = [
      makeItem(
        id,
        "CONFIRMING",
        "BITCOIN_MEMPOOL",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      ),
    ];

    const result = mergeActivities(previous, [
      [
        makeItem(
          id,
          "FAILED",
          "POWPEG",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:02.000Z"
        ),
        makeItem(
          id,
          "REFUNDED",
          "POWPEG",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:03.000Z"
        ),
      ],
    ]);

    expect(result.items[0].status).toBe("REFUNDED");
    expect(result.events.map((event) => event.type)).toEqual([
      "statusChanged",
      "refunded",
    ]);
  });

  it("sorts items by recency (updatedAt then createdAt)", () => {
    const older = makeItem(
      makeActivityId("BTC", "old"),
      "PENDING",
      "BITCOIN_MEMPOOL",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );
    const newer = makeItem(
      makeActivityId("BTC", "new"),
      "PENDING",
      "BITCOIN_MEMPOOL",
      "2026-01-01T00:10:00.000Z",
      "2026-01-01T00:10:00.000Z"
    );

    const result = mergeActivities([], [[older, newer]]);
    expect(result.items.map((item) => item.id)).toEqual([newer.id, older.id]);
  });
});

