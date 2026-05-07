import type { ActivityStatus } from "../types/activity";

const BTC_BLOCK_MINUTES = 10;

export function estimateEtaFromConfirmations(
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
    return remaining * BTC_BLOCK_MINUTES + 5;
  }

  if (status === "PENDING") return 20;
  if (status === "CONFIRMING") return 15;
  if (status === "BRIDGING") return 10;
  return null;
}
