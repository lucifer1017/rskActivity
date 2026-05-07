const BTC_TXID_RE = /^[0-9a-f]{64}$/;
const EVM_TXID_RE = /^0x[0-9a-f]{64}$/;

export function normalizeBtcTxId(input: string): string | null {
  const value = input.trim().toLowerCase();
  return BTC_TXID_RE.test(value) ? value : null;
}

export function normalizeOptionalBtcTxId(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  return normalizeBtcTxId(input) ?? undefined;
}

export function isSafeTxHashForExplorer(input: string): boolean {
  const value = input.trim().toLowerCase();
  return BTC_TXID_RE.test(value) || EVM_TXID_RE.test(value);
}

export function assertHttpUrl(input: string, fieldName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error(`${fieldName} must be a valid absolute URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${fieldName} must use http or https`);
  }

  return parsed.toString().replace(/\/+$/, "");
}
