# Rsk Activity-Feed – Integration Research Reference

This document centralizes the key details needed to implement the **Rsk Activity-Feed** (the “FedEx tracker” for BTC → Rootstock bridge transactions).

It focuses on:
- **Flyover SDK** (fast bridge layer)
- **PowPeg / 2wp-api** (native peg and status backend)
- **BTC explorer integration** for mempool/confirmation tracking

Use this as the primary reference while implementing `@rootstock-kits/activity` and the demo dashboard.

---

## 1. Flyover Protocol – Conceptual Overview

Sources:  
- Flyover SDK Integration – `https://dev.rootstock.io/developers/integrate/flyover/sdk`  
- Flyover Protocol Overview – `https://dev.rootstock.io/rsk/architecture/flyover`  
- Flyover Glossary – `https://dev.rootstock.io/developers/integrate/flyover/glossary`

**What Flyover does**
- Provides **fast peg-in / peg-out** between BTC ↔ rBTC.
- Uses **Liquidity Providers (LPs)** that advance funds while the native **PowPeg** bridge completes in the background.
- Critical security point: **user BTC is always sent to a PowPeg-controlled address**, not to the LP.

**Timelines (approximate, for UX messaging)**
- **Native PowPeg peg-in**: ~100 Bitcoin blocks ≈ 16–17 hours.
- **Native PowPeg peg-out**: ~4000 Rootstock blocks ≈ 33–34 hours.
- **Flyover peg-in**: ~2 Bitcoin confirmations ≈ 20 minutes (LP-dependent).
- **Flyover peg-out**: ~10 Rootstock confirmations ≈ 5 minutes (LP-dependent).

These values are useful for **ETA estimates** and progress messaging in the activity feed.

---

## 2. Flyover SDK – Practical Integration

Source: `https://dev.rootstock.io/developers/integrate/flyover/sdk`

### 2.1. Installation

```bash
npm install @rsksmart/flyover-sdk
```

### 2.2. Basic Initialization

Key ideas:
- Supports **Regtest**, **Testnet**, and **Mainnet**.
- Requires a **`captchaTokenResolver`** function because some LPs enforce human-generated quotes.
- Can be configured with a **custom URL** (e.g. for local/regtest).

Example (from docs, simplified):

```ts
import { Flyover } from '@rsksmart/flyover-sdk';

const flyover = new Flyover({
  network: 'Regtest', // or 'Testnet', 'Mainnet'
  captchaTokenResolver: async () => Promise.resolve(''),
  customRegtestUrl: 'http://localhost:8080', // optional, for custom envs
  allowInsecureConnections: true,            // for non-HTTPS dev envs
});
```

### 2.3. Core Concepts for Our Use Case

- **Liquidity Provider (LP)**
  - Entity providing both BTC and rBTC liquidity.
  - Interacts with the on-chain **Liquidity Bridge Contract (LBC)** on Rootstock.

- **Quote**
  - An LP’s **offer** for a specific transaction (amount, rate, fees, expiry, etc.).
  - **Every request returns a new quote**, even with the same parameters.
  - For peg-in, a quote usually yields:
    - A **Bitcoin deposit address** (PowPeg-controlled).
    - Expected rBTC to be received.
    - Fees and validity period.

- **Liquidity Bridge Contract (LBC)**
  - Smart contract on Rootstock that LPs interact with.
  - Addresses (from docs):
    - **Mainnet**: `0xaa9caf1e3967600578727f975f283446a3da6612`
    - **Testnet**: `0xc2a630c053d12d63d32b025082f6ba268db18300`

### 2.4. What We Need from the SDK (for Activity Feed)

Public docs are concept-focused; precise method names are not fully laid out. For implementation we will:
- Inspect `@rsksmart/flyover-sdk` directly (code / typings) to identify:
  - How to **list or identify quotes** relevant to a user.
  - How to **query quote status** (e.g. pending, fulfilled, expired, failed).
  - Any existing methods for **tracking progress** of a Flyover transaction.

The activity feed will treat **Flyover-side info** as:
- **Type**: `Flyover`
- **Status**: “Waiting for user deposit”, “BTC received by LP/PowPeg”, “Advancing rBTC”, “Completed”, “Expired/Failed”.

These statuses will be **normalized** into our unified `ActivityItem` model (see Section 5).

---

## 3. PowPeg / 2wp-api – Peg-in Status Backend

Sources:  
- PowPeg App Overview – `https://dev.rootstock.io/resources/guides/powpeg-app/overview`  
- Viewing Transaction Status – `https://dev.rootstock.io/resources/guides/powpeg-app/pegin/status`  
- 2wp-app GitHub – `https://github.com/rsksmart/2wp-app`  
- 2wp-api GitHub – `https://github.com/rsksmart/2wp-api`

### 3.1. Architecture

- **2wp-api** is the backend used by the PowPeg web app.
- Components:
  - A **daemon process** that listens to Bitcoin and Rootstock blockchains.
  - A **REST API** exposing peg-in/peg-out status data.
  - **MongoDB** as a persistence layer.
- Public apps:
  - **Mainnet PowPeg app**: `https://powpeg.rootstock.io/`
  - **Testnet PowPeg app**: `https://powpeg.testnet.rootstock.io/`

For the activity feed, we’ll treat the 2wp-api as the **source of truth** for the **bridge-side status** of a peg-in.

### 3.2. Status Information (Peg-in)

From the PowPeg status page, a peg-in exposes both Bitcoin and Rootstock sides:

- **Bitcoin side:**
  - Sender address.
  - Bitcoin transaction ID (hash).
  - Network fee.
  - Amount sent.
  - Confirmations towards required threshold.

- **Rootstock side:**
  - Recipient (Rootstock) address.
  - Rootstock transaction ID (hash).
  - Network fee.
  - Amount received.
  - Confirmations / finality status.

- **Refund information (if applicable):**
  - Refund BTC address.
  - Status of refund transaction (if an error occurs).

Top-level states (conceptual, deduced from docs / app behavior):
- `Pending` (waiting for enough BTC confirmations).
- `Processing` (bridge / federation handling).
- `Completed` (rBTC delivered to destination address).
- `Refunded / Failed` (error path).

### 3.3. 2wp-api Endpoints (To Be Confirmed from Source)

The docs describe behavior but not exact routes; the 2wp-api repo contains:
- Endpoints to query peg-in status by:
  - **Bitcoin transaction hash**.
  - Possibly by **user address** (BTC / RSK) or an internal ID.

For our library we will:
- Read 2wp-api source to identify:
  - Status query endpoints (e.g. `/pegin/status/:txHash`, etc.).
  - Response JSON shapes (fields, nested structure).
- Wrap those in a small **PowPeg client module** so callers don’t need to know raw endpoints.

In the unified feed, PowPeg data will appear as:
- **Type**: `PowPeg`
- **Status**: “Waiting for confirmations”, “Bridge processing”, “Completed”, “Refunded/Failed”.

---

## 4. Bitcoin Explorer / Mempool Integration

Goal: **Track BTC transactions from the moment they hit the mempool**, even before PowPeg or Flyover fully recognize them.

Typical capabilities we need:
- Look up a BTC transaction by **txid**.
- See:
  - Whether it’s in the **mempool** (0 confirmations).
  - Current **number of confirmations**.
  - Total required confirmations (we will assume or configure this per protocol).

Candidate APIs (all popular and suitable):
- **Blockstream / mempool.space API** – `https://mempool.space/docs/api/rest`
- **BlockCypher API** – `https://www.blockcypher.com/dev/bitcoin/` (often referenced in Rootstock ecosystem docs).
- **Blockchair API** – `https://blockchair.com/api/docs`

Implementation strategy:
- Choose a **default provider** (e.g. Blockstream or BlockCypher).
- Design a small **explorer client interface** that:
  - Takes a `txid`.
  - Returns:
    - `confirmations` (number).
    - `isInMempool` (boolean).
    - Optional `blockHeight`, `time` if available.
- Make the implementation **pluggable** so integrators can swap providers.

In the unified feed, these early-stage items will appear as:
- **Type**: `Bitcoin` (or a sub-type of `PowPeg` / `Flyover`).
- **Status**: “Mempool (0/x confirmations)”, “Confirming (n/x confirmations)”.

---

## 5. Unified ActivityItem Model (Design Target)

This is **not code**, just the conceptual shape that will guide implementation.

### 5.1. Core Fields

Each `ActivityItem` should capture:

- **Identity**
  - `id`: unique identifier (could be derived from txid + type).
  - `type`: one of `Bitcoin`, `Flyover`, `PowPeg` (or a discriminated union).

- **User / Address Context**
  - `btcAddress?: string`
  - `rskAddress?: string`

- **Amounts**
  - `amountBtc?: string` (or bigint, but store as string in JSON).
  - `amountRbtc?: string`
  - `feeBtc?: string`
  - `feeRbtc?: string`

- **Status & Progress**
  - `status` (normalized enum), e.g.:
    - `PENDING`
    - `CONFIRMING`
    - `BRIDGING`
    - `COMPLETED`
    - `REFUNDED`
    - `FAILED`
  - `subStatus?`: protocol-specific detail (e.g. “waitingForUserDeposit”, “insufficientConfirmations”, “lpAdvanceInProgress”).
  - `confirmations?: number`
  - `requiredConfirmations?: number`
  - `etaMinutes?: number | null` (derived from protocol timings + confirmations).

- **Chain Data**
  - `btcTxId?: string`
  - `rskTxId?: string`
  - `btcBlockHeight?: number`
  - `rskBlockHeight?: number`

- **Timing**
  - `createdAt: string` (ISO).
  - `updatedAt: string` (ISO).
  - `completedAt?: string` (ISO).

- **Display**
  - `title?: string` – Short label for UI (e.g. “BTC → rBTC via Flyover”).
  - `description?: string` – Human-readable sentence (e.g. “0.5 BTC detected on Bitcoin (1/3 confirmations) → Arriving on Rootstock in ~10 mins.”).

### 5.2. Normalization Sources

- **From Flyover SDK**
  - Quote status, LP info, expected amounts, expiry.
  - Map to early/fast path statuses (especially peg-in via Flyover).

- **From PowPeg (2wp-api)**
  - Peg-in/peg-out status based on Bitcoin / Rootstock tx information.
  - Represents authoritative bridge progress.

- **From BTC Explorer**
  - Very early stage: mempool + confirmation count.
  - Fills the gap *before* PowPeg / Flyover have a fully-registered peg-in.

The core library will merge these into a **single ordered list** per user/address.

---

## 6. Notification Hook – `useBridgeNotifications` (Design Target)

Conceptual behavior:
- A **React hook** that:
  - Polls Flyover SDK, PowPeg API, and BTC explorer at a configurable interval.
  - Maintains an internal list of `ActivityItem`s.
  - Detects **status changes** between polls.
  - Exposes:
    - The list of current activity items.
    - A stream or callbacks for significant events (for browser toasts).

### 6.1. Example API Shape (concept)

```ts
type BridgeNotificationEvent =
  | { type: 'statusChanged'; item: ActivityItem; previousStatus: ActivityStatus }
  | { type: 'itemCompleted'; item: ActivityItem }
  | { type: 'itemFailed'; item: ActivityItem };

// Conceptual hook signature:
useBridgeNotifications({
  btcAddress?: string;
  rskAddress?: string;
  pollingIntervalMs?: number; // default e.g. 15000
  onEvent?: (event: BridgeNotificationEvent) => void;
});
```

In the demo dashboard we’ll connect `onEvent` to a toast library (or to the Browser Notification API).

---

## 7. Environment & Testing Notes

From Rootstock docs:
- **Networks**
  - `Regtest` – local testing with full control.
  - `Testnet` – public test environment.
  - `Mainnet` – production.

- **Faucets & Tools**
  - BTC Testnet: `https://coinfaucet.eu/en/btc-testnet/`
  - rBTC Testnet: `https://faucet.rootstock.io/`
  - Wallet: Electrum (BTC testnet) and any Rootstock-compatible web3 wallet for rBTC.

For our project:
- The demo dashboard will likely default to **Testnet** but be switchable to Mainnet.
- The core library will accept a **network/environment config** and pass it through to:
  - Flyover SDK.
  - PowPeg API base URLs.
  - BTC explorer base URLs.

---

## 8. Open Questions / Assumptions to Verify Later

These don’t block initial implementation but should be checked when possible:

1. **Exact Flyover SDK methods** for:
   - Listing / identifying **pending quotes** scoped to a user.
   - Querying **status** of a given quote / transaction.

2. **Exact 2wp-api endpoints and schemas** for:
   - Getting **peg-in status by txid**.
   - (Optional) Getting **all bridge transactions for an address**.

3. **Chosen BTC explorer provider**:
   - Default choice (likely Blockstream/mempool.space or BlockCypher).
   - Rate limits → used to tune `pollingIntervalMs`.

4. **Frontend stack preferences**:
   - For now we will target **React + TypeScript** (Vite-based dashboard).
   - If Next.js or another framework is preferred, the core library remains framework-agnostic.

---

This file should be enough to:
- Design the **unified Activity model**.
- Implement **Flyover / PowPeg / BTC clients**.
- Build the **polling manager + notification hook**.
- Implement a **minimal but polished dashboard** to demonstrate the “Where is my money?” journey.

