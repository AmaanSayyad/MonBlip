import { PostHog } from 'posthog-node'

// Server-side PostHog client
export function getServerPostHog() {
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST
  })
}

// Helper function to capture server-side events
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, any>
) {
  const posthog = getServerPostHog()
  
  try {
    posthog.capture({
      distinctId,
      event,
      properties
    })
  } finally {
    await posthog.shutdown()
  }
}
