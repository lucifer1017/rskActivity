import type { ActivityItem, ActivityStatus } from "../types/activity";
import type { BtcTxStatus } from "../api/btcExplorerClient";
import { makeActivityId } from "../utils/activityId";
import { estimateEtaFromConfirmations } from "./eta";
export function normalizeBtcTxStatusToActivityItem(
  status: BtcTxStatus
): ActivityItem {
  const nowIso = new Date().toISOString();

  const activityStatus: ActivityStatus = status.isConfirmed
    ? "CONFIRMING"
    : "PENDING";

  const description =
    activityStatus === "PENDING"
      ? "BTC transaction detected in mempool — waiting for first confirmation"
      : "BTC transaction confirmed — bridge is watching for required confirmations";

  return {
    id: makeActivityId("BTC", status.txid),
    type: "BITCOIN_MEMPOOL",
    status: activityStatus,
    title: "BTC → RSK Bridge",
    description,
    btcTxId: status.txid,
    btcBlockHeight: status.blockHeight,
    confirmations: status.confirmations,
    requiredConfirmations: status.confirmations != null ? 1 : undefined,
    etaMinutes:
      status.confirmations != null
        ? estimateEtaFromConfirmations(
            activityStatus,
            status.confirmations,
            1
          )
        : null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
