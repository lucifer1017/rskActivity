import type { ActivityItem, ActivityStatus } from "../types/activity";
import type { PowpegStatus } from "../api/powpegClient";
import { makeActivityId } from "../utils/activityId";
const BTC_BLOCK_MIN = 10;

function mapHighLevelToActivityStatus(
  highLevel: PowpegStatus["highLevelStatus"]
): ActivityStatus {
  switch (highLevel) {
    case "PENDING":
      return "PENDING";
    case "PROCESSING":
      return "BRIDGING";
    case "COMPLETED":
      return "COMPLETED";
    case "REFUNDED":
      return "REFUNDED";
    case "FAILED":
      return "FAILED";
    default: {
      const _exhaustive: never = highLevel;
      return _exhaustive;
    }
  }
}
function estimateEtaMinutes(
  status: ActivityStatus,
  confirmations?: number,
  requiredConfirmations?: number
): number | null {
  if (status === "COMPLETED" || status === "FAILED" || status === "REFUNDED") {
    return null;
  }

  if (
    (status === "PENDING" || status === "CONFIRMING" || status === "BRIDGING") &&
    confirmations !== undefined &&
    requiredConfirmations !== undefined &&
    requiredConfirmations > 0
  ) {
    const remaining = Math.max(0, requiredConfirmations - confirmations);
    return remaining * BTC_BLOCK_MIN + 5;
  }

  if (status === "PENDING") return 15;
  if (status === "CONFIRMING") return 30;
  if (status === "BRIDGING") return 10;

  return null;
}

function buildDescription(
  status: ActivityStatus,
  confirmations?: number,
  requiredConfirmations?: number
): string {
  switch (status) {
    case "PENDING":
      return "Waiting for Bitcoin confirmation before the bridge can process";
    case "CONFIRMING":
    case "BRIDGING": {
      if (confirmations !== undefined && requiredConfirmations !== undefined) {
        return `${confirmations} / ${requiredConfirmations} Bitcoin confirmations`;
      }
      return status === "CONFIRMING"
        ? "Accumulating Bitcoin confirmations"
        : "PowPeg is processing the bridge transfer";
    }
    case "COMPLETED":
      return "RBTC has been delivered to your Rootstock address";
    case "REFUNDED":
      return "Transfer was refunded to your Bitcoin address";
    case "FAILED":
      return "Transfer failed — please contact PowPeg support";
    default:
      return "";
  }
}

export function normalizePowpegStatusToActivityItem(
  status: PowpegStatus
): ActivityItem {
  const nowIso = new Date().toISOString();
  const activityStatus = mapHighLevelToActivityStatus(status.highLevelStatus);
  const id = makeActivityId("POWPEG", status.btcTxId, status.rskTxId);

  return {
    id,
    type: "POWPEG",
    status: activityStatus,
    title: "PowPeg Peg-In",
    description: buildDescription(
      activityStatus,
      status.confirmations,
      status.requiredConfirmations
    ),
    btcTxId: status.btcTxId,
    rskTxId: status.rskTxId,
    btcAddress: status.btcAddress,
    rskAddress: status.rskAddress,
    btcAmountSats: status.btcAmountSats,
    rbtcAmountWei: status.rbtcAmountWei,
    confirmations: status.confirmations,
    requiredConfirmations: status.requiredConfirmations,
    etaMinutes: estimateEtaMinutes(
      activityStatus,
      status.confirmations,
      status.requiredConfirmations
    ),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
