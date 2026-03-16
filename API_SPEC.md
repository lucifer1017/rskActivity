## Rsk Activity-Feed – Public API Spec (v0.1)

This document defines the **public contracts** of `@rootstock-kits/activity`.

All implementation must conform to this spec; changes here are considered breaking unless versioned accordingly.

---

## 1. Core Types

### 1.1 `ActivityType`

```ts
type ActivityType = "BITCOIN_MEMPOOL" | "POWPEG" | "FLYOVER";
```

- **`BITCOIN_MEMPOOL`**: Information derived from a Bitcoin explorer (mempool / confirmation status for a *known bridge transaction*).
- **`POWPEG`**: Status information for native PowPeg peg-ins/peg-outs, from the PowPeg/2wp-api backend.
- **`FLYOVER`**: Status information for Flyover-accelerated peg operations, from the Flyover SDK / LP APIs.

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

- **`PENDING`**: Operation detected but not yet confirmed / in progress.
- **`CONFIRMING`**: Funding transaction is gaining confirmations, but the bridge hasn’t finished.
- **`BRIDGING`**: The bridge (PowPeg/Flyover) is processing funds (e.g. federation, LP advance).
- **`COMPLETED`**: Funds have arrived at the destination chain/address.
- **`REFUNDED`**: Funds were refunded to the user (e.g. peg-in error).
- **`FAILED`**: Operation irrecoverably failed and was not completed or refunded.

### 1.3 `ActivityItem`

```ts
interface ActivityItem {
  // Core identity
  id: string;
  type: ActivityType;

  // User context
  btcAddress?: string;
  rskAddress?: string;

  // Amounts (base units, represented as strings)
  btcAmountSats?: string;  // total BTC value related to this activity (satoshis)
  btcFeeSats?: string;     // BTC fee (satoshis)
  rbtcAmountWei?: string;  // total rBTC value related to this activity (wei)
  rbtcFeeWei?: string;     // rBTC fee (wei)

  // Status and progress
  status: ActivityStatus;
  subStatus?: string;            // optional protocol-specific detail (e.g. "waitingForUserDeposit")
  confirmations?: number;        // current confirmations (if known)
  requiredConfirmations?: number;// confirmations required before bridge proceeds
  etaMinutes?: number | null;    // estimated minutes remaining (derived, optional)

  // Chain-specific data
  btcTxId?: string;
  rskTxId?: string;
  btcBlockHeight?: number;
  rskBlockHeight?: number;

  // Timestamps (ISO 8601 strings)
  createdAt: string;   // when this activity was first detected
  updatedAt: string;   // last time this activity was updated
  completedAt?: string;// when status first became COMPLETED / REFUNDED / FAILED

  // Display helpers
  title?: string;       // short label for UI
  description?: string; // human-readable summary
}
```

**Notes:**
- Amounts are always **base units as strings** (no floats).
- At minimum, `id`, `type`, `status`, `createdAt`, and `updatedAt` must be set.
- `COMPLETED` / `REFUNDED` / `FAILED` are only set based on **PowPeg/Flyover** sources, never from BTC explorer alone.

---

## 2. Configuration

### 2.1 `NetworkName`

```ts
type NetworkName = "regtest" | "testnet" | "mainnet";
```

### 2.2 `ActivityConfig`

```ts
interface ActivityConfig {
  // Network / endpoints
  network: NetworkName;
  powpegApiBaseUrl?: string;    // overrides default PowPeg API URL for the selected network
  btcExplorerBaseUrl?: string;  // overrides default Bitcoin explorer URL for the selected network

  // Polling intervals (ms)
  pollingIntervalMs?: number;       // global default interval
  btcPollingIntervalMs?: number;    // overrides for BTC explorer
  powpegPollingIntervalMs?: number; // overrides for PowPeg
  flyoverPollingIntervalMs?: number;// overrides for Flyover

  // Feature flags
  enableMempoolSniffer?: boolean; // enable BTC mempool/confirms tracking
  enablePowpeg?: boolean;         // enable PowPeg integration
  enableFlyover?: boolean;        // enable Flyover integration
}
```

**Default behavior:**
- If a per-source interval is **not** provided, it falls back to `pollingIntervalMs`.
- If neither per-source nor global interval is provided, library defaults will be used (e.g. 20–30 seconds; concrete values are documented in code comments).
- Default endpoints per `network`:
  - `mainnet`:
    - PowPeg: `https://powpeg.rootstock.io/`
    - BTC explorer: `https://mempool.space/api`
  - `testnet`:
    - PowPeg: `https://powpeg.testnet.rootstock.io/`
    - BTC explorer: `https://mempool.space/testnet/api` (or configured)
  - `regtest`:
    - All URLs must be provided by the consumer.

---

## 3. Events & Notifications

### 3.1 `BridgeNotificationEvent`

```ts
type BridgeNotificationEvent =
  | { type: "itemCreated"; item: ActivityItem }
  | { type: "statusChanged"; item: ActivityItem; previousStatus: ActivityStatus }
  | { type: "completed"; item: ActivityItem }
  | { type: "failed"; item: ActivityItem }
  | { type: "refunded"; item: ActivityItem };
```

**Semantics:**
- `itemCreated`: A new activity (previously unseen `id`) has been detected.
- `statusChanged`: The `status` of an existing item changed to a new value (including transitions to `COMPLETED` / `FAILED` / `REFUNDED`).
- `completed`: Convenience event specifically when `status` first becomes `COMPLETED`.
- `failed`: When `status` first becomes `FAILED`.
- `refunded`: When `status` first becomes `REFUNDED`.

The library guarantees:
- No duplicate `itemCreated` events for the same `id`.
- `completed` / `failed` / `refunded` events are only fired on the **first** transition to those states.

---

## 4. React Hook: `useBridgeNotifications`

### 4.1 Options

```ts
interface UseBridgeNotificationsOptions {
  btcAddress?: string;
  rskAddress?: string;
  config?: ActivityConfig;
  onEvent?: (event: BridgeNotificationEvent) => void;
}
```

**Notes:**
- At least one of `btcAddress` or `rskAddress` should typically be provided.
- `config` is optional; if omitted, sensible defaults for `network`, endpoints, and polling are used (implementation-defined but documented).
- `onEvent` is called for each `BridgeNotificationEvent` as changes occur.

### 4.2 Result

```ts
interface UseBridgeNotificationsResult {
  items: ActivityItem[];
  isLoading: boolean;
  error: unknown;   // may be replaced by a structured ActivityError in a future version
  refresh: () => void; // triggers an immediate poll, independent of interval
}
```

**Semantics:**
- `items` is the current, merged list of activities for the given addresses and config, sorted by recency (implementation may choose the ordering; typically newest/active first).
- `isLoading` is `true` during initial fetch and whenever a poll is in-flight.
- `error` reflects the **last** polling error (if any); it does not prevent subsequent polling attempts.
- `refresh()` immediately triggers a polling cycle; it does **not** cancel or alter the normal interval schedule.

The hook:
- Starts polling when mounted and stops when unmounted.
- Rebuilds internal polling when options (`btcAddress`, `rskAddress`, `config`) change.

---

## 5. Status Ownership & Merge Rules (Conceptual)

These rules guide how multiple sources (BTC, PowPeg, Flyover) are merged into a single `ActivityItem` per underlying transfer.

1. **Status precedence** (from highest to lowest):
   - `COMPLETED` > `REFUNDED` > `FAILED` > `BRIDGING` > `CONFIRMING` > `PENDING`.
2. **Authority for terminal states**:
   - Only PowPeg/Flyover sources can set `COMPLETED`, `REFUNDED`, or `FAILED`.
   - BTC explorer never advances beyond `CONFIRMING`.
3. **BTC role**:
   - BTC explorer provides mempool / confirmation insight for *known bridge transactions* only.
   - It informs `confirmations`, `requiredConfirmations`, and early `PENDING`/`CONFIRMING` stages, but not final success/failure.
4. **Merging**:
   - When multiple partial views (BTC, PowPeg, Flyover) refer to the same transfer, they are merged into one `ActivityItem` based on:
     - Stable `id` strategy (implementation detail based on txids).
     - Status precedence rules above.
     - Most recent timestamps and chain data.

Implementation must follow these rules when constructing the final `ActivityItem[]` exposed by `useBridgeNotifications`.

---

## 6. V1 Success Criteria (Scope Guard)

For the first public version:

- Support **peg-ins on testnet and mainnet** via:
  - BTC explorer (mempool / confirmations for peg-in tx).
  - PowPeg API (peg-in status and finalization).
  - Flyover SDK for fast peg-ins (if enabled).
- Expose a stable React hook `useBridgeNotifications` that:
  - Polls sources at configurable intervals.
  - Produces a merged stream of `ActivityItem`s.
  - Emits `BridgeNotificationEvent`s on significant changes.
- Keep all endpoints, timeouts, and error handling behind configuration and documented defaults so consumers can adapt to infrastructure changes without code changes.

