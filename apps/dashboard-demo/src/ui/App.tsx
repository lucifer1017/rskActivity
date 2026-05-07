import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useBridgeNotifications,
  type ActivityItem,
  type ActivityStatus,
  type BridgeNotificationEvent,
  type FlyoverLiquidityProvider,
} from "@rootstock-kits/activity";

const NETWORK = "testnet" as const;

const EXPLORER_BTC =
  NETWORK === "testnet"
    ? "https://mempool.space/testnet4/tx"
    : "https://mempool.space/tx";

const EXPLORER_RSK =
  NETWORK === "testnet"
    ? "https://explorer.testnet.rsk.co/tx"
    : "https://explorer.rsk.co/tx";

const BTC_TXID_RE = /^[0-9a-fA-F]{64}$/;
const RSK_TXID_RE = /^0x[0-9a-fA-F]{64}$/;
const TOAST_AUTO_DISMISS_MS = 6000;

function shortenTxId(txid: string): string {
  if (txid.length <= 16) return txid;
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
}

function formatSats(sats: string): string {
  const n = Number(sats);
  if (Number.isNaN(n)) return sats;
  return (n / 1e8).toFixed(6).replace(/\.?0+$/, "");
}

function formatWei(wei: string): string {
  try {
    const value = BigInt(wei);
    const negative = value < 0n;
    const abs = negative ? value * -1n : value;
    const whole = abs / 10n ** 18n;
    const fraction = abs % 10n ** 18n;
    const fractionFixed = fraction
      .toString()
      .padStart(18, "0")
      .slice(0, 6)
      .replace(/0+$/, "");
    const formatted = fractionFixed ? `${whole.toString()}.${fractionFixed}` : whole.toString();
    return negative ? `-${formatted}` : formatted;
  } catch {
    return "Invalid amount";
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


type Step = { label: string };

const STEPS: Step[] = [
  { label: "Mempool" },
  { label: "Confirming" },
  { label: "Bridging" },
  { label: "Arrived" },
];

function stepIndexForStatus(status: ActivityStatus): number {
  if (status === "COMPLETED") return 3;
  if (status === "BRIDGING") return 2;
  if (status === "CONFIRMING") return 1;
  return 0;
}


function ProgressStepper({ status }: { status: ActivityStatus }) {
  const isTerminal = status === "FAILED" || status === "REFUNDED";
  const currentStep = stepIndexForStatus(status);

  if (isTerminal) {
    return (
      <div className="stepper">
        <span className={`stepper-terminal stepper-terminal--${status.toLowerCase()}`}>
          {status === "REFUNDED" ? "Refunded" : "Failed"}
        </span>
      </div>
    );
  }

  return (
    <div className="stepper">
      {STEPS.map((step, idx) => {
        const done = idx < currentStep;
        const active = idx === currentStep;
        return (
          <div key={step.label} className="stepper-item">
            <div
              className={`stepper-dot${done ? " stepper-dot--done" : ""}${active ? " stepper-dot--active" : ""}`}
            />
            <span
              className={`stepper-label${active ? " stepper-label--active" : ""}${done ? " stepper-label--done" : ""}`}
            >
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={`stepper-line${done ? " stepper-line--done" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfirmationBar({ confirmations, required }: { confirmations: number; required: number }) {
  const pct = required > 0 ? Math.min(100, (confirmations / required) * 100) : 0;
  return (
    <div
      className="conf-bar-wrap"
      role="progressbar"
      aria-label="Bitcoin confirmations"
      aria-valuemin={0}
      aria-valuemax={required}
      aria-valuenow={Math.min(required, confirmations)}
    >
      <div className="conf-bar-track">
        <div className="conf-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="conf-bar-label">
        {confirmations} / {required} confirmations
      </span>
    </div>
  );
}

function TypeTag({ type }: { type: ActivityItem["type"] }) {
  const labels: Record<ActivityItem["type"], string> = {
    POWPEG: "PowPeg",
    FLYOVER: "Flyover",
    BITCOIN_MEMPOOL: "Bitcoin",
  };
  return (
    <span
      className={`type-tag type-tag--${type.toLowerCase().replace("_", "-")}`}
      aria-label={`Source type: ${labels[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  const labelMap: Record<ActivityStatus, string> = {
    PENDING: "Pending",
    CONFIRMING: "Confirming",
    BRIDGING: "Bridging",
    COMPLETED: "Completed",
    REFUNDED: "Refunded",
    FAILED: "Failed",
  };
  return (
    <span className={`badge badge-${status.toLowerCase()}`} aria-label={`Status: ${labelMap[status]}`}>
      {status}
    </span>
  );
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const hasAmount = item.btcAmountSats || item.rbtcAmountWei;

  const isSafeBtcTxLink = Boolean(item.btcTxId && BTC_TXID_RE.test(item.btcTxId));
  const isSafeRskTxLink = Boolean(item.rskTxId && RSK_TXID_RE.test(item.rskTxId));

  return (
    <div className={`activity-card activity-card--${item.status.toLowerCase()}`}>
      <div className="card-header">
        <div className="card-header-left">
          <TypeTag type={item.type} />
          <StatusBadge status={item.status} />
        </div>
        {item.etaMinutes != null && (
          <span className="eta-badge">
            {item.status === "COMPLETED" ? "✓ Arrived" : `~${item.etaMinutes} min`}
          </span>
        )}
      </div>

      {hasAmount && (
        <div className="amount-row">
          {item.btcAmountSats && (
            <span className="amount-btc">{formatSats(item.btcAmountSats)} BTC</span>
          )}
          {item.btcAmountSats && item.rbtcAmountWei && (
            <span className="amount-arrow">→</span>
          )}
          {item.rbtcAmountWei && (
            <span className="amount-rbtc">{formatWei(item.rbtcAmountWei)} RBTC</span>
          )}
        </div>
      )}

      <ProgressStepper status={item.status} />

      {item.confirmations !== undefined && item.requiredConfirmations !== undefined && (
        <ConfirmationBar
          confirmations={item.confirmations}
          required={item.requiredConfirmations}
        />
      )}

      {item.description && (
        <p className="card-description">{item.description}</p>
      )}

      <div className="tx-links">
        {isSafeBtcTxLink && item.btcTxId && (
          <a
            className="tx-link tx-link--btc"
            href={`${EXPLORER_BTC}/${item.btcTxId}`}
            target="_blank"
            rel="noreferrer"
          >
            BTC: {shortenTxId(item.btcTxId)} ↗
          </a>
        )}
        {isSafeRskTxLink && item.rskTxId && (
          <a
            className="tx-link tx-link--rsk"
            href={`${EXPLORER_RSK}/${item.rskTxId}`}
            target="_blank"
            rel="noreferrer"
          >
            RSK: {shortenTxId(item.rskTxId)} ↗
          </a>
        )}
      </div>

      <div className="card-footer">Updated {formatTime(item.updatedAt)}</div>
    </div>
  );
}

function getErrorMessage(error: unknown): React.ReactNode {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Failed to fetch bridge status — check network connectivity and whether the PowPeg / explorer APIs are reachable.";
}

interface Toast {
  id: string;
  message: string;
  kind: "info" | "success" | "warning" | "error";
}

function eventToToast(event: BridgeNotificationEvent, id: string): Toast {
  switch (event.type) {
    case "itemCreated":
      return { id, kind: "info", message: `New bridge activity detected (${event.item.type})` };
    case "statusChanged":
      return {
        id,
        kind: "info",
        message: `Status: ${event.previousStatus} → ${event.item.status}`,
      };
    case "completed":
      return { id, kind: "success", message: "Bridge complete — RBTC arrived." };
    case "refunded":
      return { id, kind: "warning", message: "Transfer was refunded." };
    case "failed":
      return { id, kind: "error", message: "Bridge transfer failed." };
  }
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span>{t.message}</span>
          <button className="toast-dismiss" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}


export function App() {
  const [txIdInput, setTxIdInput] = useState("");
  const [txIdError, setTxIdError] = useState("");
  const [trackedTxIds, setTrackedTxIds] = useState<string[]>([]);
  const [flyoverOpen, setFlyoverOpen] = useState(false);
  const [lpsUrl, setLpsUrl] = useState("");
  const [quoteHashInput, setQuoteHashInput] = useState("");
  const [trackedQuoteHashes, setTrackedQuoteHashes] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const toastSeqRef = useRef(0);
  const [feedAnnouncement, setFeedAnnouncement] = useState("");

  const nextToastId = useCallback(() => {
    toastSeqRef.current += 1;
    return String(toastSeqRef.current);
  }, []);

  const addToast = useCallback((toast: Toast) => {
    setToasts((prev) => [...prev, toast]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      dismissTimers.current.delete(toast.id);
    }, TOAST_AUTO_DISMISS_MS);
    dismissTimers.current.set(toast.id, timer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = dismissTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const timers = dismissTimers.current;
    return () => { timers.forEach((t) => clearTimeout(t)); };
  }, []);

  const handleEvent = useCallback(
    (event: BridgeNotificationEvent) => { addToast(eventToToast(event, nextToastId())); },
    [addToast, nextToastId]
  );

  const hasFlyoverQuotes = trackedQuoteHashes.length > 0;
  const flyoverProvider = useMemo<FlyoverLiquidityProvider | undefined>(() => {
    const url = lpsUrl.trim();
    if (!url || !hasFlyoverQuotes) return undefined;
    return { provider: "", apiBaseUrl: url };
  }, [lpsUrl, hasFlyoverQuotes]);

  const { items, isLoading, error, refresh } = useBridgeNotifications({
    btcTxIds: trackedTxIds,
    powpegBtcTxIds: trackedTxIds,
    config: { network: NETWORK },
    pollingIntervalMs: 20_000,
    onEvent: handleEvent,
    flyover: flyoverProvider
      ? { provider: flyoverProvider, quoteHashes: trackedQuoteHashes }
      : undefined,
  });

  const handleAddTxId = () => {
    const trimmed = txIdInput.trim();
    if (!trimmed) return;
    if (!BTC_TXID_RE.test(trimmed)) {
      setTxIdError("A BTC txid must be exactly 64 hexadecimal characters.");
      return;
    }
    if (trackedTxIds.includes(trimmed.toLowerCase())) {
      setTxIdError("This txid is already tracked.");
      return;
    }
    setTxIdError("");
    setTrackedTxIds((prev) => [...prev, trimmed.toLowerCase()]);
    setTxIdInput("");
  };

  const handleTxIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAddTxId();
  };

  const handleRemoveTxId = (txid: string) =>
    setTrackedTxIds((prev) => prev.filter((t) => t !== txid));

  const handleAddQuoteHash = () => {
    const trimmed = quoteHashInput.trim();
    if (!trimmed || trackedQuoteHashes.includes(trimmed)) return;
    setTrackedQuoteHashes((prev) => [...prev, trimmed]);
    setQuoteHashInput("");
  };

  const handleQuoteHashKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAddQuoteHash();
  };

  const handleRemoveQuoteHash = (hash: string) =>
    setTrackedQuoteHashes((prev) => prev.filter((h) => h !== hash));

  const hasAnySources = trackedTxIds.length > 0 || trackedQuoteHashes.length > 0;

  useEffect(() => {
    const count = items.length;
    document.title =
      count > 0 ? `(${count}) Rsk Activity Feed – Dashboard Demo` : "Rsk Activity Feed – Dashboard Demo";
    if (count > 0) {
      setFeedAnnouncement(`${count} incoming fund item${count > 1 ? "s" : ""} in the feed.`);
    }
  }, [items.length]);

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <div>
            <h1 className="header-title">
              <span className="header-logo" aria-hidden="true">⛓</span> RSK Activity Feed
            </h1>
            <p className="header-subtitle">
              "Where is my money?" — real-time BTC → Rootstock bridge tracker
            </p>
          </div>
          <div className="header-status">
            {isLoading && <span className="pulse-dot" />}
            <span className="header-network">{NETWORK}</span>
          </div>
        </div>
      </header>

      <main className="content">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        <section className="card">
          <h2 className="card-title">Track via PowPeg</h2>
          <p className="card-helper">
            Paste a BTC transaction hash used to initiate a PowPeg peg-in. The feed polls both
            the Bitcoin mempool (for confirmation progress) and the PowPeg 2wp-api (for bridge
            status) every 20 s.
          </p>

          <div className="input-row">
            <label htmlFor="btc-txid-input" className="sr-only">Bitcoin transaction id</label>
            <input
              id="btc-txid-input"
              className={`tx-input${txIdError ? " tx-input--error" : ""}`}
              placeholder="BTC txid — 64 hex characters…"
              value={txIdInput}
              onChange={(e) => { setTxIdInput(e.target.value); setTxIdError(""); }}
              onKeyDown={handleTxIdKeyDown}
            />
            <button className="btn btn-primary" onClick={handleAddTxId}>
              Track
            </button>
            <button
              className="btn btn-secondary"
              onClick={refresh}
              disabled={isLoading || !hasAnySources}
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {txIdError && <p className="input-error">{txIdError}</p>}

          {trackedTxIds.length > 0 && (
            <div className="chip-row">
              {trackedTxIds.map((txid) => (
                <span key={txid} className="chip">
                  {shortenTxId(txid)}
                  <button
                    className="chip-remove"
                    onClick={() => handleRemoveTxId(txid)}
                    aria-label={`Remove tracked txid ${shortenTxId(txid)}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <button
            className="collapsible-header"
            onClick={() => setFlyoverOpen((v) => !v)}
            aria-expanded={flyoverOpen}
            aria-controls="flyover-panel"
          >
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>Track via Flyover</h2>
              <p className="card-helper" style={{ margin: "0.15rem 0 0" }}>
                Track accepted Flyover peg-in quotes by quoteHash and LP server URL.
              </p>
            </div>
            <span className="collapsible-chevron">{flyoverOpen ? "▲" : "▼"}</span>
          </button>

          <div className="collapsible-body" id="flyover-panel" hidden={!flyoverOpen}>
              <div className="input-row" style={{ marginTop: "0.75rem" }}>
                <label htmlFor="flyover-lp-url-input" className="sr-only">Flyover LP API URL</label>
                <input
                  id="flyover-lp-url-input"
                  className="tx-input"
                  placeholder="LP API URL (e.g. https://lps.testnet.rootstock.io)"
                  value={lpsUrl}
                  onChange={(e) => setLpsUrl(e.target.value)}
                />
              </div>
              <div className="input-row">
                <label htmlFor="flyover-quote-hash-input" className="sr-only">Flyover quote hash</label>
                <input
                  id="flyover-quote-hash-input"
                  className="tx-input"
                  placeholder="Quote hash (0x…)"
                  value={quoteHashInput}
                  onChange={(e) => setQuoteHashInput(e.target.value)}
                  onKeyDown={handleQuoteHashKeyDown}
                />
                <button className="btn btn-primary" onClick={handleAddQuoteHash}>
                  Add
                </button>
              </div>

              {!lpsUrl.trim() && trackedQuoteHashes.length > 0 && (
                <p className="input-error">Enter the LP API URL to enable Flyover polling.</p>
              )}

              {trackedQuoteHashes.length > 0 && (
                <div className="chip-row">
                  {trackedQuoteHashes.map((hash) => (
                    <span key={hash} className="chip">
                      {shortenTxId(hash)}
                      <button
                        className="chip-remove"
                        onClick={() => handleRemoveQuoteHash(hash)}
                        aria-label={`Remove tracked quote hash ${shortenTxId(hash)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <p className="card-helper" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                The LP API URL and quote hash are available after calling{" "}
                <code>flyover.acceptPeginQuote()</code> in the Flyover SDK. The SDK is{" "}
                <strong>not</strong> required at runtime — only the LP URL and hash are needed.
              </p>
            </div>
        </section>

        <section>
          <div className="sr-only" aria-live="polite">{feedAnnouncement}</div>
          <div className="feed-header">
            <h2 className="card-title feed-title">Incoming Funds</h2>
            {items.length > 0 && (
              <span className="feed-count">
                {items.length} item{items.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {error ? (
            <div className="alert alert-error">
              {String(getErrorMessage(error))}
            </div>
          ) : null}

          {!hasAnySources && (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">📭</div>
              <p>Add a BTC txid or Flyover quote hash above to start tracking.</p>
              <p className="empty-hint">
                The feed polls the Bitcoin mempool, PowPeg 2wp-api, and Flyover LP server and
                shows a unified "Incoming Funds" list with estimated arrival time.
              </p>
            </div>
          )}

          {hasAnySources && items.length === 0 && !isLoading && !error && (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">🔍</div>
              <p>No bridge activity found yet.</p>
              <p className="empty-hint">
                The transaction may not be in the PowPeg queue yet, or the txid may be
                incorrect. Polling every 20 s.
              </p>
            </div>
          )}

          {items.length > 0 && (
            <div className="activity-grid">
              {items.map((item) => (
                <ActivityCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
