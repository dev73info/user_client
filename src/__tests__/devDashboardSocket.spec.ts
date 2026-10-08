import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DASHBOARD_STALE_MS,
  dashboardReconnectDelay,
  useDevDashboardSocket,
} from '@/composables/useDevDashboardSocket'

/** 假的 WebSocket：只记录实例，由用例手动派发 open / message / close。 */
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

  /** 服务端断开：连接已关，再派发 close 事件。 */
  emitClose() {
    this.closed = true
    this.onclose?.({} as CloseEvent)
  }
}

function latest(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1]
  if (!socket) throw new Error('还没有建立任何连接')
  return socket
}

const snapshot = (todayIncome: number) => ({
  type: 'snapshot',
  data: { wallet: { today_income_cny: todayIncome }, generated_at: '2026-10-09 06:09:16' },
})

describe('dashboardReconnectDelay', () => {
  it('从 1s 起逐次翻倍，封顶 30s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(dashboardReconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ])
  })
})

describe('useDevDashboardSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('首次建连 connecting → 握手成功 open → 收到快照记下数据与更新时间', () => {
    const onSnapshot = vi.fn()
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws', onSnapshot })

    socket.connect()
    expect(socket.status.value).toBe('connecting')
    expect(FakeSocket.instances).toHaveLength(1)

    latest().emitOpen()
    expect(socket.status.value).toBe('open')

    latest().emitMessage(snapshot(12))
    expect(socket.snapshot.value?.wallet.today_income_cny).toBe(12)
    expect(socket.lastUpdatedAt.value).toBe(Date.now())
    expect(onSnapshot).toHaveBeenCalledTimes(1)

    socket.disconnect()
  })

  it('心跳只刷新心跳时间，不动快照与最后更新时间', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()
    latest().emitOpen()
    latest().emitMessage(snapshot(1))
    const updatedAt = socket.lastUpdatedAt.value

    vi.advanceTimersByTime(25_000)
    latest().emitMessage({ type: 'ping', at: '2026-10-09 06:07:28' })
    expect(socket.lastUpdatedAt.value).toBe(updatedAt)
    expect(socket.lastMessageAt.value).toBe(Date.now())
    expect(socket.snapshot.value?.wallet.today_income_cny).toBe(1)

    socket.disconnect()
  })

  it('一直连不上时按 1s、2s、4s… 退避，封顶 30s，期间状态是 reconnecting', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()

    const gaps: number[] = []
    let last = Date.now()
    for (let round = 0; round < 7; round += 1) {
      const before = FakeSocket.instances.length
      latest().emitClose()
      expect(socket.status.value).toBe('reconnecting')
      while (FakeSocket.instances.length === before) {
        vi.advanceTimersByTime(100)
      }
      gaps.push(Date.now() - last)
      last = Date.now()
    }

    expect(gaps).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
    socket.disconnect()
  })

  it('收到过消息再断开，退避回落到 1s；重连期间保留上一份快照', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()
    latest().emitClose()
    vi.advanceTimersByTime(1000)
    latest().emitClose()
    vi.advanceTimersByTime(2000)

    latest().emitOpen()
    latest().emitMessage(snapshot(88))
    latest().emitClose()

    expect(socket.status.value).toBe('reconnecting')
    expect(socket.snapshot.value?.wallet.today_income_cny).toBe(88)

    const before = FakeSocket.instances.length
    vi.advanceTimersByTime(999)
    expect(FakeSocket.instances).toHaveLength(before)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.instances).toHaveLength(before + 1)

    socket.disconnect()
  })

  it('只握手成功、没收到消息就断开，不复位退避', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()
    latest().emitClose()
    vi.advanceTimersByTime(1000)
    latest().emitOpen()
    latest().emitClose()

    const before = FakeSocket.instances.length
    vi.advanceTimersByTime(1999)
    expect(FakeSocket.instances).toHaveLength(before)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.instances).toHaveLength(before + 1)

    socket.disconnect()
  })

  it('超过 60 秒没有任何消息视为断线：关掉旧连接并重连', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()
    const first = latest()
    first.emitOpen()
    first.emitMessage(snapshot(5))

    vi.advanceTimersByTime(DASHBOARD_STALE_MS - 1)
    expect(socket.status.value).toBe('open')
    vi.advanceTimersByTime(1)
    expect(first.closed).toBe(true)
    expect(socket.status.value).toBe('reconnecting')
    expect(socket.snapshot.value?.wallet.today_income_cny).toBe(5)

    vi.advanceTimersByTime(1000)
    expect(FakeSocket.instances).toHaveLength(2)

    socket.disconnect()
  })

  it('重连前先关掉旧连接，任何时刻只有一条活着的连接', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()
    latest().emitOpen()
    latest().emitMessage(snapshot(1))
    vi.advanceTimersByTime(DASHBOARD_STALE_MS + 1000)

    const alive = FakeSocket.instances.filter((item) => !item.closed)
    expect(FakeSocket.instances).toHaveLength(2)
    expect(alive).toHaveLength(1)

    socket.disconnect()
  })

  it('disconnect 关闭连接、取消待重连，旧连接的 close 不再触发重连', () => {
    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()
    const first = latest()
    first.emitOpen()

    socket.disconnect()
    expect(socket.status.value).toBe('closed')
    expect(first.closed).toBe(true)

    first.emitClose()
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(socket.status.value).toBe('closed')
  })

  it('回到前台时若已断开，不等退避立刻重连；连着时不动', () => {
    let visibility: DocumentVisibilityState = 'hidden'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)

    const socket = useDevDashboardSocket({ url: () => 'ws://test/ws' })
    socket.connect()
    latest().emitOpen()
    latest().emitMessage(snapshot(1))

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(FakeSocket.instances).toHaveLength(1)

    visibility = 'hidden'
    latest().emitClose()
    for (let index = 0; index < 4; index += 1) {
      vi.advanceTimersByTime(dashboardReconnectDelay(index))
      latest().emitClose()
    }
    const before = FakeSocket.instances.length

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(FakeSocket.instances).toHaveLength(before + 1)

    socket.disconnect()
  })
})
