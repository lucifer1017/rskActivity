import type { ActivityItem, ActivityStatus } from "../types/activity";
import type { BtcTxStatus } from "../api/btcExplorerClient";

export function normalizeBtcTxStatusToActivityItem(
  status: BtcTxStatus
): ActivityItem {
  const nowIso = new Date().toISOString();

  // For the Bitcoin-only view we never treat this as a fully "COMPLETED"
  // bridge operation. A confirmed BTC tx simply means the funding leg is
  // confirmed; the bridge status will be provided by PowPeg / Flyover.
  const activityStatus: ActivityStatus = status.isConfirmed
    ? "CONFIRMING"
    : "PENDING";

  return {
    id: `btc:${status.txid}`,
    type: "BITCOIN_MEMPOOL",
    status: activityStatus,
    btcTxId: status.txid,
    btcBlockHeight: status.blockHeight,
    // We currently don't derive confirmations or ETA from the explorer alone.
    confirmations: undefined,
    requiredConfirmations: undefined,
    etaMinutes: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

