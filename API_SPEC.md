## Rsk Activity-Feed – Public API Spec (v0.2)

This document defines the **public contracts** of `@rootstock-kits/activity`.

All implementation must conform to this spec; changes here are considered breaking unless versioned accordingly.

---

## 1. Core Types

### 1.1 `ActivityType`

```ts
type ActivityType = "BITCOIN_MEMPOOL" | "POWPEG" | "FLYOVER";
```

- **`BITCOIN_MEMPOOL`**: Mempool / confirmation status from a Bitcoin explorer for a *known bridge transaction*.
- **`POWPEG`**: Peg-in status from the PowPeg / 2wp-api backend.
- **`FLYOVER`**: Peg-in status from a Flyover Liquidity Provider Server (LPS) REST API.

### 1.2 `ActivityStatus`

```ts
type ActivityStatus =
  | "PENDING"
  | "CONFIRMING"
  | "BRIDGING"
  | "COMPLETED"
  | "REFUNDED"
  | "FAILED";
```

- **`PENDING`**: Detected but not yet confirmed / in progress.
- **`CONFIRMING`**: Funding BTC transaction is gaining confirmations; bridge has not yet acted.
- **`BRIDGING`**: The bridge (PowPeg / Flyover LP) is actively processing funds.
- **`COMPLETED`**: Funds have arrived at the destination chain/address.
- **`REFUNDED`**: Funds were returned to the user.
- **`FAILED`**: Operation irrecoverably failed.

### 1.3 `ActivityItem`

```ts
interface ActivityItem {
  // Core identity
  id: string;
  type: ActivityType;

  // User context
  btcAddress?: string;
  rskAddress?: string;

  // Amounts (base units, as strings to avoid float precision issues)
  btcAmountSats?: string;   // satoshis
  btcFeeSats?: string;
  rbtcAmountWei?: string;   // wei
  rbtcFeeWei?: string;

  // Status and progress
  status: ActivityStatus;
  subStatus?: string;              // protocol-specific detail (e.g. LPS raw state)
  confirmations?: number;
  requiredConfirmations?: number;
  etaMinutes?: number | null;      // estimated minutes remaining (null = unknown)

  // Chain data
  btcTxId?: string;
  rskTxId?: string;
  btcBlockHeight?: number;
  rskBlockHeight?: number;

  // Timestamps (ISO 8601)
  createdAt: string;
  updatedAt: string;
  completedAt?: string;

  // Display helpers
  title?: string;
  description?: string;
}
```

**Notes:**
- `id`, `type`, `status`, `createdAt`, `updatedAt` are always present.
- Amounts are always **base units as strings** (no floating-point).
- `COMPLETED` / `REFUNDED` / `FAILED` are only produced by PowPeg or Flyover sources, never by the BTC explorer alone.

---

## 2. Configuration

### 2.1 `NetworkName`

```ts
type NetworkName = "regtest" | "testnet" | "mainnet";
```

### 2.2 `ActivityConfig`

```ts
interface ActivityConfig {
  network?: NetworkName;          // defaults to "testnet"
  powpegApiBaseUrl?: string;      // overrides default 2wp-api URL
  btcExplorerBaseUrl?: string;    // overrides default BTC explorer URL

  pollingIntervalMs?: number;        // global default (ms); default 20 000
  btcPollingIntervalMs?: number;     // per-source override
  powpegPollingIntervalMs?: number;
  flyoverPollingIntervalMs?: number;

  enableMempoolSniffer?: boolean;    // default true
  enablePowpeg?: boolean;            // default true
  enableFlyover?: boolean;           // default true
}
```

**Validation and safety rules:**
- `pollingIntervalMs`, `btcPollingIntervalMs`, `powpegPollingIntervalMs`, and `flyoverPollingIntervalMs` are clamped to a minimum of `5000` ms.
- `btcTxIds` and `powpegBtcTxIds` are normalized to lowercase and validated as 64-char hex txids.
- Flyover `provider.apiBaseUrl` must be an absolute `http` or `https` URL.

**Default endpoints by network:**

| Network   | 2wp-api (PowPeg)                          | BTC Explorer                           |
|-----------|-------------------------------------------|----------------------------------------|
| `mainnet` | `https://api.2wp.rootstock.io`            | `https://mempool.space/api`            |
| `testnet` | `https://api.2wp.testnet.rootstock.io`    | `https://mempool.space/testnet4/api`   |
| `regtest` | *(must be provided by consumer)*          | *(must be provided by consumer)*       |

---

## 3. Events & Notifications

### 3.1 `BridgeNotificationEvent`

```ts
type BridgeNotificationEvent =
  | { type: "itemCreated";    item: ActivityItem }
  | { type: "statusChanged";  item: ActivityItem; previousStatus: ActivityStatus }
  | { type: "completed";      item: ActivityItem }
  | { type: "failed";         item: ActivityItem }
  | { type: "refunded";       item: ActivityItem };
```

**Guarantees:**
- No duplicate `itemCreated` events for the same `id`.
- `completed` / `failed` / `refunded` fire only on the **first** transition to that terminal state.
- Terminal events are transition-only and are **not** emitted for first-seen items that are already terminal.
- At most one `statusChanged` event per item per polling cycle (net change only).

---

## 4. React Hook: `useBridgeNotifications`

### 4.1 Options

```ts
interface UseBridgeNotificationsOptions {
  /**
   * BTC transaction hashes to track at the mempool / confirmation level.
   * Populate when the user initiates a bridge — you will have the funding txid.
   */
  btcTxIds?: string[];

  /**
   * BTC transaction hashes to track via the PowPeg / 2wp-api.
   * Defaults to btcTxIds when omitted.
   */
  powpegBtcTxIds?: string[];

  config?: ActivityConfig;

  /** Global polling interval override (ms). */
  pollingIntervalMs?: number;

  /** Callback for every bridge event. Wire to toast / notification system. */
  onEvent?: (event: BridgeNotificationEvent) => void;

  /**
   * Flyover peg-in tracking.
   * Provide the LP descriptor and quote hashes obtained after accepting a quote.
   */
  flyover?: {
    /**
     * LP descriptor. Compatible with LiquidityProvider from @rsksmart/flyover-sdk —
     * you can pass the SDK object directly.
     * Only apiBaseUrl is used internally; the SDK is NOT required as a dependency.
     */
    provider: FlyoverLiquidityProvider;
    /** Accepted quote hashes to poll for status. */
    quoteHashes?: string[];
  };
}

interface FlyoverLiquidityProvider {
  provider: string;    // LP RSK address (from SDK LiquidityProvider)
  apiBaseUrl: string;  // LP REST server base URL
}
```

### 4.2 Result

```ts
interface UseBridgeNotificationsResult {
  items: ActivityItem[];  // merged, sorted by recency (newest first)
  isLoading: boolean;
  error: unknown;
  refresh: () => void;
}
```

**Semantics:**
- Polling starts on mount, stops on unmount.
- Manager is recreated when `btcTxIds`, `powpegBtcTxIds`, `flyover.quoteHashes`, or resolved config changes.
- `isLoading` is `true` during initial fetch and any in-flight poll.
- `error` holds the last polling error; subsequent successful polls clear it.
- `refresh()` triggers an immediate poll without altering the scheduled interval.
- In-flight polling requests are cancelled on manager teardown/recreation via `AbortController`.

---

## 5. Flyover Integration

### How it works

Unlike the BTC and PowPeg sources — which only need a txid — Flyover tracking requires:

1. The **Liquidity Provider Server (LPS) URL** (`apiBaseUrl`).
2. The **quote hash** obtained when the user accepted a Flyover peg-in quote.

The library calls the LPS REST API directly:

```
GET {apiBaseUrl}/pegin/status?quoteHash={hash}
```

**No `@rsksmart/flyover-sdk` dependency is required** for tracking. The SDK is useful for *initiating* Flyover transactions (getting quotes, accepting, signing); the consuming app handles that separately and then passes the resulting `quoteHash` to the activity feed.

If you are using the SDK:

```ts
// 1. Initiate via SDK (your app code)
const [lp] = await flyover.getAvailableLiquidityProviders();
const [quote] = await flyover.getPeginQuotes(request);
const { quoteHash } = await flyover.acceptPeginQuote(quote);

// 2. Pass to activity feed (no SDK needed)
useBridgeNotifications({
  flyover: {
    provider: lp,          // SDK LiquidityProvider is directly compatible
    quoteHashes: [quoteHash],
  },
});
```

---

## 6. Status Ownership & Merge Rules

Multiple sources can observe the same underlying bridge transfer. The library merges them into a single `ActivityItem` per transfer.

1. **Stable identity**: Items from different sources sharing the same BTC txid collapse into one item via `id = bridge:btc:{btcTxId}`. RSK txid is used as fallback.

2. **Status precedence** (highest wins):
   ```
   COMPLETED > REFUNDED > FAILED > BRIDGING > CONFIRMING > PENDING
   ```

3. **Terminal state authority**: Only PowPeg / Flyover sources can set `COMPLETED`, `REFUNDED`, or `FAILED`. The BTC explorer never advances beyond `CONFIRMING`.

4. **Field merging**: The highest-precedence item's fields win, enriched by lower-precedence fields where the winner has `undefined`.

5. **Sort order**: `items` is sorted by `updatedAt` descending, then `createdAt` descending, then `id` for stability.

6. **Flyover expiry mapping**: `TimeForDepositElapsed` is normalized to `REFUNDED`.

---

## 7. V1 Success Criteria

- Support peg-ins on **testnet and mainnet** via BTC explorer + PowPeg + Flyover.
- Expose `useBridgeNotifications` with configurable polling, merged `ActivityItem[]`, and `BridgeNotificationEvent` callbacks.
- All endpoints, timeouts, and URLs are configurable; sensible defaults are provided.
- No `@rsksmart/flyover-sdk` required as a peer/runtime dependency.
- Published as `@rootstock-kits/activity` with CJS + ESM + `.d.ts` outputs.
