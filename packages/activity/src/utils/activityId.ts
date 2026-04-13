export type ActivitySource = "BTC" | "POWPEG" | "FLYOVER";

/**
 * Creates a stable ID for a bridge-related activity.
 * All normalizers (BTC, PowPeg, Flyover) should use this helper so that
 * different views of the same transfer collapse into a single ActivityItem.
 */
export function makeActivityId(
  source: ActivitySource,
  btcTxId?: string,
  rskTxId?: string
): string {
  const normalizedBtc = (btcTxId ?? "").trim().toLowerCase();
  const normalizedRsk = (rskTxId ?? "").trim().toLowerCase();

  // Canonical transfer identity: prefer BTC funding transaction so multiple
  // source views (mempool, PowPeg, Flyover) resolve to the same item.
  if (normalizedBtc) {
    return `bridge:btc:${normalizedBtc}`;
  }

  // Fallback for flows where BTC txid is unavailable but RSK txid exists.
  if (normalizedRsk) {
    return `bridge:rsk:${normalizedRsk}`;
  }

  // Last resort fallback. Preserve source and any available hints to avoid
  // collisions between unrelated items missing tx identifiers.
  return `bridge:source:${source.toLowerCase()}:unknown`;
}

