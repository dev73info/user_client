export type AppChannel = 'web_user' | 'web_dev'

export type DeviceType = 'desktop' | 'tablet' | 'mobile'

export type TelemetryEventType = 'page_enter' | 'page_heartbeat' | 'page_leave'

export type TelemetryEvent = {
  event_id: string
  event_type: TelemetryEventType
  route_pattern: string
  referrer_pattern?: string
  active_ms: number
  total_ms: number
  scroll_depth_pct?: number
  client_ts: string
}

export type QueueEntry = {
  session_id: string
  visitor_id: string
  app_channel: AppChannel
  device_type: DeviceType
  viewport_width: number
  event: TelemetryEvent
}

export type IngestBatch = Omit<QueueEntry, 'event'> & {
  events: TelemetryEvent[]
}
