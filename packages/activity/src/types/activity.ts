export type ActivityKind = "BITCOIN_MEMPOOL" | "POWPEG" | "FLYOVER";

export type ActivityStatus =
  | "PENDING"
  | "CONFIRMING"
  | "BRIDGING"
  | "COMPLETED"
  | "REFUNDED"
  | "FAILED";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;

  btcAddress?: string;
  rskAddress?: string;

  amountBtc?: string;
  amountRbtc?: string;
  feeBtc?: string;
  feeRbtc?: string;

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

