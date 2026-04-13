# @rootstock-kits/activity

> A "FedEx Tracker" for BTC → Rootstock bridge transactions.

Provides a React hook that polls the **Bitcoin mempool**, **PowPeg 2wp-api**, and **Flyover Liquidity Provider Server** REST APIs, merges results into a single unified `ActivityItem` stream, and fires notification events when status changes.

---

## Installation

```bash
npm install @rootstock-kits/activity
```

**Peer dependencies:** `react ^18`

**No** `@rsksmart/flyover-sdk` required at runtime. The SDK is only needed if your app *initiates* Flyover transactions; this package handles status *tracking* only.

---

## Quick start

```tsx
import { useBridgeNotifications } from "@rootstock-kits/activity";

function BridgeTracker({ btcTxId }: { btcTxId: string }) {
  const { items, isLoading, error, refresh } = useBridgeNotifications({
    btcTxIds: [btcTxId],
    powpegBtcTxIds: [btcTxId],
    config: { network: "testnet" },
    onEvent: (event) => {
      if (event.type === "completed") {
        toast.success("RBTC arrived!");
      }
    },
  });

  if (isLoading) return <p>Loading…</p>;
  if (error)     return <p>Error fetching bridge status.</p>;

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          [{item.type}] {item.status}
          {item.etaMinutes != null && ` — ~${item.etaMinutes} min`}
          {item.confirmations != null &&
            ` (${item.confirmations}/${item.requiredConfirmations} confs)`}
        </li>
      ))}
    </ul>
  );
}
```

---

## API

### `useBridgeNotifications(options)`

**Options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `btcTxIds` | `string[]` | `[]` | BTC txids to poll via Bitcoin explorer |
| `powpegBtcTxIds` | `string[]` | *(= btcTxIds)* | BTC txids to poll via PowPeg 2wp-api |
| `config` | `ActivityConfig` | see below | Network / API / polling config |
| `pollingIntervalMs` | `number` | `20000` | Global polling interval override |
| `onEvent` | `(e: BridgeNotificationEvent) => void` | – | Status change callbacks |
| `flyover.provider` | `FlyoverLiquidityProvider` | – | LP descriptor (apiBaseUrl + provider) |
| `flyover.quoteHashes` | `string[]` | `[]` | Accepted quote hashes to track |

**Returns:** `{ items, isLoading, error, refresh }`

---

### `ActivityConfig`

```ts
interface ActivityConfig {
  network?: "testnet" | "mainnet" | "regtest"; // default "testnet"
  powpegApiBaseUrl?: string;     // default: 2wp-api for the selected network
  btcExplorerBaseUrl?: string;   // default: mempool.space for the selected network
  pollingIntervalMs?: number;    // default 20 000 ms
  btcPollingIntervalMs?: number;
  powpegPollingIntervalMs?: number;
  flyoverPollingIntervalMs?: number;
  enableMempoolSniffer?: boolean; // default true
  enablePowpeg?: boolean;         // default true
  enableFlyover?: boolean;        // default true
}
```

**Default endpoints:**

| Network | PowPeg (2wp-api) | BTC Explorer |
|---------|-------------------|--------------|
| `testnet` | `https://api.2wp.testnet.rootstock.io` | `https://mempool.space/testnet4/api` |
| `mainnet` | `https://api.2wp.rootstock.io` | `https://mempool.space/api` |
| `regtest` | *(must be provided)* | *(must be provided)* |

---

### `ActivityItem`

```ts
interface ActivityItem {
  id: string;
  type: "BITCOIN_MEMPOOL" | "POWPEG" | "FLYOVER";
  status: "PENDING" | "CONFIRMING" | "BRIDGING" | "COMPLETED" | "REFUNDED" | "FAILED";
  subStatus?: string;           // protocol-level raw state
  confirmations?: number;
  requiredConfirmations?: number;
  etaMinutes?: number | null;   // estimated minutes remaining
  btcTxId?: string;
  rskTxId?: string;
  btcAmountSats?: string;       // satoshis as string
  rbtcAmountWei?: string;       // wei as string
  btcAddress?: string;
  rskAddress?: string;
  title?: string;
  description?: string;
  createdAt: string;            // ISO 8601
  updatedAt: string;
  completedAt?: string;
}
```

---

### `BridgeNotificationEvent`

```ts
type BridgeNotificationEvent =
  | { type: "itemCreated";   item: ActivityItem }
  | { type: "statusChanged"; item: ActivityItem; previousStatus: ActivityStatus }
  | { type: "completed";     item: ActivityItem }
  | { type: "failed";        item: ActivityItem }
  | { type: "refunded";      item: ActivityItem };
```

---

## Flyover tracking

The library calls the LP server REST API directly:

```
GET {apiBaseUrl}/pegin/status?quoteHash={hash}
```

If you use `@rsksmart/flyover-sdk` to *initiate* the transaction, you can pass the SDK's `LiquidityProvider` object directly — the types are structurally compatible:

```ts
const [lp] = await flyover.getAvailableLiquidityProviders();
const [quote] = await flyover.getPeginQuotes(request);
const { quoteHash } = await flyover.acceptPeginQuote(quote);

// lp is directly compatible — no wrapping needed
useBridgeNotifications({
  flyover: { provider: lp, quoteHashes: [quoteHash] },
});
```

---

## Merge behaviour

When BTC, PowPeg, and Flyover sources all observe the same transfer, the library merges them into a single `ActivityItem` using a canonical ID derived from the BTC txid (`bridge:btc:<txid>`). Status precedence (highest wins):

```
COMPLETED > REFUNDED > FAILED > BRIDGING > CONFIRMING > PENDING
```

Only PowPeg and Flyover sources can produce terminal states (`COMPLETED`, `REFUNDED`, `FAILED`).

---

## License

MIT
