import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  supportReconnectDelay,
  useSupportChatRealtime,
} from '@/components/support/useSupportChatRealtime'

import {
  FakeSupportSocket,
  latestSupportSocket,
  supportDetail,
} from './helpers/supportConversation'

describe('在线客服实时连接', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSupportSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSupportSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('退避递增并封顶', () => {
    expect([0, 1, 2, 3, 4].map(supportReconnectDelay)).toEqual([3000, 6000, 12000, 15000, 15000])
  })

  it('连接后接收合法会话详情，忽略畸形推送', () => {
    const onOpen = vi.fn()
    const onDetail = vi.fn()
    const realtime = useSupportChatRealtime({ url: () => 'ws://test/support', onOpen, onDetail })
    realtime.connect()
    latestSupportSocket().emitOpen()
    const detail = supportDetail(1, [])
    latestSupportSocket().emitMessage(detail)
    latestSupportSocket().emitMessage({ unexpected: true })

    expect(realtime.connected.value).toBe(true)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onDetail).toHaveBeenCalledExactlyOnceWith(detail)
    realtime.disconnect()
  })

  it('断线后按退避重连', () => {
    const realtime = useSupportChatRealtime({ url: () => 'ws://test/support', onDetail: vi.fn() })
    realtime.connect()
    latestSupportSocket().emitClose()
    vi.advanceTimersByTime(2999)
    expect(FakeSupportSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSupportSocket.instances).toHaveLength(2)
    realtime.disconnect()
  })

  it('主动断开后不重连，旧连接事件也不再生效', () => {
    const onDetail = vi.fn()
    const realtime = useSupportChatRealtime({ url: () => 'ws://test/support', onDetail })
    realtime.connect()
    const first = latestSupportSocket()
    first.emitOpen()
    realtime.disconnect()
    first.emitClose()
    first.emitMessage(supportDetail(1, []))
    vi.advanceTimersByTime(60_000)

    expect(realtime.connected.value).toBe(false)
    expect(first.closed).toBe(true)
    expect(onDetail).not.toHaveBeenCalled()
    expect(FakeSupportSocket.instances).toHaveLength(1)
  })

  it('没有登录令牌时不创建连接', () => {
    const realtime = useSupportChatRealtime({ url: () => null, onDetail: vi.fn() })
    realtime.connect()
    expect(FakeSupportSocket.instances).toHaveLength(0)
    expect(realtime.connected.value).toBe(false)
    realtime.disconnect()
  })
})
