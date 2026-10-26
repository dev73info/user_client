import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DevDashboardSnapshot } from '@/api/devDashboard'
import {
  DASHBOARD_STALE_MS,
  dashboardReconnectDelay,
  useDevDashboardSocket,
} from '@/composables/useDevDashboardSocket'

class FakeSocket {
  static instances: FakeSocket[] = []
  url: string
  closed = false
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emitOpen() {
    this.onopen?.(new Event('open'))
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }

  emitClose() {
    this.closed = true
    this.onclose?.({} as CloseEvent)
  }
}

function latest() {
  const socket = FakeSocket.instances.at(-1)
  if (!socket) throw new Error('还没有建立连接')
  return socket
}

function snapshot(incomeFen: number) {
  return {
    wallet: { today_income_fen: incomeFen },
    generated_at: '2026-10-27 04:00:00',
  } as unknown as DevDashboardSnapshot
}

describe('开发者看板实时连接', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('退避从 1 秒翻倍并封顶 30 秒', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(dashboardReconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ])
  })

  it('收到快照后更新数据和连接状态', () => {
    const onSnapshot = vi.fn()
    const socket = useDevDashboardSocket({ url: () => 'ws://test/dashboard', onSnapshot })
    socket.connect()
    latest().emitOpen()
    latest().emitMessage({ type: 'snapshot', data: snapshot(1234) })

    expect(socket.status.value).toBe('open')
    expect(socket.snapshot.value?.wallet.today_income_fen).toBe(1234)
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    socket.disconnect()
  })

  it('超过 60 秒没有任何消息会关闭旧连接并重连', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/dashboard' })
    socket.connect()
    const first = latest()
    first.emitOpen()
    first.emitMessage({ type: 'snapshot', data: snapshot(9) })
    vi.advanceTimersByTime(DASHBOARD_STALE_MS)

    expect(first.closed).toBe(true)
    expect(socket.status.value).toBe('reconnecting')
    expect(socket.snapshot.value?.wallet.today_income_fen).toBe(9)
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.instances).toHaveLength(2)
    socket.disconnect()
  })

  it('主动断开后旧连接事件不再触发重连', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/dashboard' })
    socket.connect()
    const first = latest()
    first.emitOpen()
    socket.disconnect()
    first.emitClose()
    vi.advanceTimersByTime(60_000)

    expect(socket.status.value).toBe('closed')
    expect(FakeSocket.instances).toHaveLength(1)
  })
})
