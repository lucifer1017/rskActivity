import type { ActivityItem, ActivityStatus } from "./activity";

export type BridgeNotificationEvent =
  | {
      type: "itemCreated";
      item: ActivityItem;
    }
  | {
      type: "statusChanged";
      item: ActivityItem;
      previousStatus: ActivityStatus;
    }
  | {
      type: "completed";
      item: ActivityItem;
    }
  | {
      type: "failed";
      item: ActivityItem;
    }
  | {
      type: "refunded";
      item: ActivityItem;
    };

