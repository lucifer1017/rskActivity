export type ActivityType = "BITCOIN_MEMPOOL" | "POWPEG" | "FLYOVER";

export type ActivityStatus =
  | "PENDING"
  | "CONFIRMING"
  | "BRIDGING"
  | "COMPLETED"
  | "REFUNDED"
  | "FAILED";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  btcAddress?: string;
  rskAddress?: string;
  btcAmountSats?: string;
  btcFeeSats?: string;
  rbtcAmountWei?: string;
  rbtcFeeWei?: string;
  status: ActivityStatus;
  subStatus?: string;
  confirmations?: number;
  requiredConfirmations?: number;
  etaMinutes?: number | null;
  btcTxId?: string;
  rskTxId?: string;
  btcBlockHeight?: number;
  rskBlockHeight?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  title?: string;
  description?: string;
}


