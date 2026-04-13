import type { ActivityItem, ActivityStatus } from "../types/activity";
import type { BtcTxStatus } from "../api/btcExplorerClient";
import { makeActivityId } from "../utils/activityId";

/**
 * From the BTC-explorer-only perspective a transaction can only be PENDING
 * (unconfirmed in mempool) or CONFIRMING (at least one block confirmation).
 *
 * The bridge-level terminal states (BRIDGING, COMPLETED, REFUNDED, FAILED)
 * are always provided by the PowPeg or Flyover sources, never by this normalizer.
 */
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
    // Confirmation counts are not derivable from the explorer response alone
    // (we only know confirmed vs unconfirmed). PowPeg / Flyover normalizers
    // enrich this field when they hold the same transfer.
    confirmations: undefined,
    requiredConfirmations: undefined,
    // ETA cannot be reliably estimated from explorer data alone.
    etaMinutes: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
