import type { ActivityItem, ActivityStatus } from "../types/activity";
import type { BridgeNotificationEvent } from "../types/events";
const STATUS_PRECEDENCE: ActivityStatus[] = [
  "PENDING",
  "CONFIRMING",
  "BRIDGING",
  "FAILED",
  "REFUNDED",
  "COMPLETED",
];

function compareStatus(a: ActivityStatus, b: ActivityStatus): ActivityStatus {
  const ia = STATUS_PRECEDENCE.indexOf(a);
  const ib = STATUS_PRECEDENCE.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia >= ib ? a : b;
}

function toTime(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortByRecency(a: ActivityItem, b: ActivityItem): number {
  const updatedDiff = toTime(b.updatedAt) - toTime(a.updatedAt);
  if (updatedDiff !== 0) return updatedDiff;

  const createdDiff = toTime(b.createdAt) - toTime(a.createdAt);
  if (createdDiff !== 0) return createdDiff;

  return a.id.localeCompare(b.id);
}

export interface MergeResult {
  items: ActivityItem[];
  events: BridgeNotificationEvent[];
}
export function mergeActivities(
  previous: ActivityItem[],
  incomingGroups: ActivityItem[][]
): MergeResult {
  const previousById = new Map<string, ActivityItem>();
  for (const item of previous) {
    previousById.set(item.id, item);
  }

  const mergedById = new Map<string, ActivityItem>();
  const events: BridgeNotificationEvent[] = [];

  const nowIso = new Date().toISOString();

  const processIncoming = (item: ActivityItem) => {
    const alreadyMerged = mergedById.get(item.id);
    const previousSnapshot = previousById.get(item.id);
    const baseline = alreadyMerged ?? previousSnapshot;

    if (!baseline) {
      mergedById.set(item.id, {
        ...item,
        createdAt: item.createdAt ?? nowIso,
        updatedAt: nowIso,
        completedAt: isTerminalStatus(item.status)
          ? item.completedAt ?? nowIso
          : item.completedAt,
      });
      return;
    }

    const nextStatus = compareStatus(baseline.status, item.status);
    mergedById.set(item.id, {
      ...baseline,
      ...item,
      status: nextStatus,
      createdAt: baseline.createdAt,
      updatedAt: nowIso,
      completedAt:
        baseline.completedAt ??
        (isTerminalStatus(nextStatus) ? item.completedAt ?? nowIso : undefined),
    });
  };

  for (const group of incomingGroups) {
    for (const item of group) {
      processIncoming(item);
    }
  }

  for (const [id, nextItem] of mergedById.entries()) {
    const prevItem = previousById.get(id);

    if (!prevItem) {
      events.push({ type: "itemCreated", item: nextItem });
      if (nextItem.status === "COMPLETED") {
        events.push({ type: "completed", item: nextItem });
      } else if (nextItem.status === "FAILED") {
        events.push({ type: "failed", item: nextItem });
      } else if (nextItem.status === "REFUNDED") {
        events.push({ type: "refunded", item: nextItem });
      }
      continue;
    }

    if (prevItem.status !== nextItem.status) {
      events.push({
        type: "statusChanged",
        item: nextItem,
        previousStatus: prevItem.status,
      });

      if (nextItem.status === "COMPLETED") {
        events.push({ type: "completed", item: nextItem });
      } else if (nextItem.status === "FAILED") {
        events.push({ type: "failed", item: nextItem });
      } else if (nextItem.status === "REFUNDED") {
        events.push({ type: "refunded", item: nextItem });
      }
    }
  }

  return {
    items: Array.from(mergedById.values()).sort(sortByRecency),
    events,
  };
}

function isTerminalStatus(status: ActivityStatus): boolean {
  return (
    status === "COMPLETED" || status === "FAILED" || status === "REFUNDED"
  );
}

