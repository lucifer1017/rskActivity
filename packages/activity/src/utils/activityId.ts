export type ActivitySource = "BTC" | "POWPEG" | "FLYOVER";

/**
 * Creates a stable ID for a bridge-related activity.
 * All normalizers (BTC, PowPeg, Flyover) should use this helper so that
 * different views of the same transfer collapse into a single ActivityItem.
 */
export function makeActivityId(
  source: ActivitySource,
  btcTxId: string,
  rskTxId?: string
): string {
  const src = source.toLowerCase();
  const r = rskTxId ?? "";
  return `${src}:${btcTxId}:${r}`;
}

