## RSK Activity Feed

Monorepo for a production-ready BTC -> Rootstock activity tracker:

- `@rootstock-kits/activity`: reusable library that polls BTC explorer, PowPeg API, and Flyover LPS status endpoints.
- `apps/dashboard-demo`: reference React dashboard for tx/quote tracking and notifications.

### Quick Start

```bash
npm install
npm run dev:dashboard
```

### Workspace Scripts

- `npm run lint`
- `npm run test`
- `npm run build`

### Package Focus

The `@rootstock-kits/activity` library exposes `useBridgeNotifications()` and merged `ActivityItem[]` statuses with bridge lifecycle events. It is designed to keep consumers safe by validating inputs and hardening API client boundaries.