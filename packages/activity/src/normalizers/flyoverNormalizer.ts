import type { ActivityItem, ActivityStatus } from "../types/activity";
import type { FlyoverPeginStatus } from "../api/flyoverClient";
import { makeActivityId } from "../utils/activityId";
function mapFlyoverStatus(status: FlyoverPeginStatus): ActivityStatus {
  const { rawState, simpleStatus } = status;

  if (rawState === "WaitingForDeposit") return "PENDING";
  if (rawState === "WaitingForDepositConfirmations") return "CONFIRMING";
  if (
    rawState === "CallForUserSucceeded" ||
    rawState === "RegisterPegInSucceeded"
  ) {
    return "COMPLETED";
  }
  if (
    rawState === "TimeForDepositElapsed" ||
    rawState === "CallForUserFailed" ||
    rawState === "RegisterPegInFailed"
  ) {
    return "FAILED";
  }

  if (simpleStatus === "SUCCESS") return "COMPLETED";
  if (simpleStatus === "FAILED" || simpleStatus === "EXPIRED") return "FAILED";
  return "BRIDGING";
}
function estimateEtaMinutes(activityStatus: ActivityStatus): number | null {
  switch (activityStatus) {
    case "PENDING":
      return 20;
    case "CONFIRMING":
      return 15;
    case "BRIDGING":
      return 5;
    default:
      return null;
  }
}

function buildDescription(
  status: FlyoverPeginStatus,
  activityStatus: ActivityStatus
): string {
  switch (activityStatus) {
    case "PENDING":
      return "Waiting for your BTC deposit to the Flyover derivation address";
    case "CONFIRMING":
      return "BTC received — accumulating required confirmations";
    case "BRIDGING":
      return "LP is delivering RBTC to your Rootstock address";
    case "COMPLETED":
      return "RBTC delivered to your Rootstock address via Flyover";
    case "FAILED":
      return status.rawState === "TimeForDepositElapsed"
        ? "Deposit window expired — transfer was not processed"
        : "Flyover transfer failed — contact the Liquidity Provider";
    default:
      return "";
  }
}

export function normalizeFlyoverStatusToActivityItem(
  status: FlyoverPeginStatus
): ActivityItem {
  const nowIso = new Date().toISOString();
  const activityStatus = mapFlyoverStatus(status);
  const id =
    status.btcTxId || status.rskTxId
      ? makeActivityId("FLYOVER", status.btcTxId, status.rskTxId)
      : `bridge:flyover-quote:${status.quoteHash.toLowerCase()}`;

  return {
    id,
    type: "FLYOVER",
    status: activityStatus,
    subStatus: status.rawState || undefined,
    title: "Flyover Peg-In",
    description: buildDescription(status, activityStatus),
    btcTxId: status.btcTxId,
    rskTxId: status.rskTxId,
    btcAddress: status.btcAddress,
    rskAddress: status.rskAddress,
    rbtcAmountWei: status.rbtcAmountWei,
    requiredConfirmations: status.requiredConfirmations,
    etaMinutes: estimateEtaMinutes(activityStatus),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
