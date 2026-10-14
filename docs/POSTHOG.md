# PostHog Integration

PostHog is integrated throughout the application for comprehensive analytics tracking.

## Setup

### Environment Variables

Add these to your `.env` file and hosting provider (Vercel):

```env
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-project-api-key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## Automatic Tracking

The following are automatically tracked:

- **Pageviews**: All page navigation
- **User identification**: When wallets are connected
- **Session replay**: User interactions (enabled in PostHog dashboard)

## Custom Events

### Bet Placement
```typescript
posthog.capture('bet_placed', {
  direction: 'UP' | 'DOWN',
  amount: string,
  multiplier: number,
  duration: number,
  asset: string,
  network: string,
  currency: string
})
```

### Bet Failure
```typescript
posthog.capture('bet_failed', {
  direction: 'UP' | 'DOWN',
  amount: string,
  error: string,
  network: string
})
```

### Blitz Entry
```typescript
// Started
posthog.capture('blitz_entry_started', {
  network: string,
  entryFee: number,
  address: string
})

// Success
posthog.capture('blitz_entry_success', {
  network: string,
  entryFee: number,
  address: string
})

// Failed
posthog.capture('blitz_entry_failed', {
  network: string,
  error: string,
  address: string
})
```

## Usage in Components

### Client-side
```typescript
import posthog from 'posthog-js'

posthog.capture('custom_event', {
  property1: 'value1',
  property2: 'value2'
})
```

### Server-side (API Routes/Server Actions)
```typescript
import { captureServerEvent } from '@/lib/posthog/server'

await captureServerEvent(
  'user_id_or_wallet_address',
  'event_name',
  { property1: 'value1' }
)
```

## Files

- `instrumentation-client.ts` - Client-side PostHog initialization
- `lib/posthog/PostHogProvider.tsx` - React provider with pageview tracking
- `lib/posthog/server.ts` - Server-side utilities
- `components/game/GameBoard.tsx` - Example implementation with bet & blitz tracking

## Dashboard

Access your PostHog dashboard at: https://us.i.posthog.com

Key metrics to monitor:
- Total bets placed by network
- Blitz entry conversion rate
- User session duration
- Most popular trading pairs
- Network distribution of users
