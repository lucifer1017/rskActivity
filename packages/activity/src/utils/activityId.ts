export type ActivitySource = "BTC" | "POWPEG" | "FLYOVER";
export function makeActivityId(
  source: ActivitySource,
  btcTxId?: string,
  rskTxId?: string
): string {
  const normalizedBtc = (btcTxId ?? "").trim().toLowerCase();
  const normalizedRsk = (rskTxId ?? "").trim().toLowerCase();

  if (normalizedBtc) {
    return `bridge:btc:${normalizedBtc}`;
  }

  if (normalizedRsk) {
    return `bridge:rsk:${normalizedRsk}`;
  }

  return `bridge:source:${source.toLowerCase()}:unknown`;
}

