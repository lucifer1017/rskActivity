import type { ActivityItem } from "../types/activity";
import type { ActivityConfig } from "../types/config";
import type { BridgeNotificationEvent } from "../types/events";

export interface UseBridgeNotificationsOptions {
  btcAddress?: string;
  rskAddress?: string;
  config?: ActivityConfig;
  onEvent?: (event: BridgeNotificationEvent) => void;
}

export interface UseBridgeNotificationsResult {
  items: ActivityItem[];
  isLoading: boolean;
  error: unknown;
  refresh: () => void;
}

/**
 * Placeholder implementation.
 * The full polling and normalization logic will be added in subsequent steps.
 */
export function useBridgeNotifications(
  _options: UseBridgeNotificationsOptions
): UseBridgeNotificationsResult {
  return {
    items: [],
    isLoading: false,
    error: null,
    refresh: () => {
      // no-op for now
    },
  };
}


