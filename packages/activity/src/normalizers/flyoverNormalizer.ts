import type { ActivityItem, ActivityStatus } from "../types/activity";
import type { FlyoverPeginStatus } from "../api/flyoverClient";
import { makeActivityId } from "../utils/activityId";

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Map the LPS raw state string to our internal ActivityStatus.
 *
 * LPS states (from Flyover LPS OpenAPI spec / RetainedPeginQuoteDTO):
 *  - WaitingForDeposit               → user has not sent BTC yet
 *  - WaitingForDepositConfirmations  → BTC sent, accumulating confirmations
 *  - CallForUserSucceeded            → LP delivered RBTC (fast path)
 *  - RegisterPegInSucceeded          → LP registered peg-in (slow path)
 *  - TimeForDepositElapsed           → deposit window expired
 *  - CallForUserFailed               → LP call failed
 *  - RegisterPegInFailed             → register failed
 */
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

  // Fallback: derive from simpleStatus for unknown/future raw states.
  if (simpleStatus === "SUCCESS") return "COMPLETED";
  if (simpleStatus === "FAILED" || simpleStatus === "EXPIRED") return "FAILED";

  // BTC was likely sent and LP is processing — treat as BRIDGING.
  return "BRIDGING";
}

// ---------------------------------------------------------------------------
// ETA estimation
// ---------------------------------------------------------------------------

/**
 * Flyover typically requires 2 BTC confirmations before the LP acts, making it
 * faster than PowPeg (which may require 100 on mainnet). We use conservative
 * estimates here since exact timing depends on LP configuration.
 */
function estimateEtaMinutes(activityStatus: ActivityStatus): number | null {
  switch (activityStatus) {
    case "PENDING":
      return 20; // waiting for user BTC send + first confirmation
    case "CONFIRMING":
      return 15; // 2 BTC confirmations ≈ ~20 min, minus elapsed
    case "BRIDGING":
      return 5;  // LP is processing, nearly done
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

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export function normalizeFlyoverStatusToActivityItem(
  status: FlyoverPeginStatus
): ActivityItem {
  const nowIso = new Date().toISOString();
  const activityStatus = mapFlyoverStatus(status);

  // Use canonical BTC/RSK txid-based ID so this item merges with any BTC
  // mempool entry for the same transfer.
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
