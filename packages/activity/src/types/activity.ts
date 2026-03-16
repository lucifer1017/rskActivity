export type ActivityType = "BITCOIN_MEMPOOL" | "POWPEG" | "FLYOVER";

export type ActivityStatus =
  | "PENDING"
  | "CONFIRMING"
  | "BRIDGING"
  | "COMPLETED"
  | "REFUNDED"
  | "FAILED";

export interface ActivityItem {
  // Core identity
  id: string;
  type: ActivityType;

  // User context
  btcAddress?: string;
  rskAddress?: string;

  // Amounts (base units, represented as strings)
  btcAmountSats?: string;
  btcFeeSats?: string;
  rbtcAmountWei?: string;
  rbtcFeeWei?: string;

  // Status and progress
  status: ActivityStatus;
  subStatus?: string;
  confirmations?: number;
  requiredConfirmations?: number;
  etaMinutes?: number | null;

  // Chain-specific data
  btcTxId?: string;
  rskTxId?: string;
  btcBlockHeight?: number;
  rskBlockHeight?: number;

  // Timestamps (ISO strings)
  createdAt: string;
  updatedAt: string;
  completedAt?: string;

  // Display helpers
  title?: string;
  description?: string;
}


