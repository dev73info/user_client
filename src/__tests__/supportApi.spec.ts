import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSupportConversation,
  getSupportConversationDetail,
  listMySupportConversations,
  listPublicSupportChannels,
  sendSupportMessage,
  supportConversationWsUrl,
} from '@/api/support'

const mocks = vi.hoisted(() => ({ requestJson: vi.fn() }))

vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/http')>()),
  requestJson: mocks.requestJson,
}))

describe('在线客服 2.0 接口', () => {
  beforeEach(() => {
    mocks.requestJson.mockReset()
  })

  it('读取本人会话、详情和公开渠道', async () => {
    await listMySupportConversations('token')
    await getSupportConversationDetail('token', 12)
    await listPublicSupportChannels()

    expect(mocks.requestJson.mock.calls.map((call) => call[0])).toEqual([
      '/support/conversations/mine',
      '/support/conversations/12',
      '/support/channels/public',
    ])
    expect(mocks.requestJson.mock.calls[0]?.[1].headers.get('Authorization')).toBe('Bearer token')
  })

  it('首次创建与后续发送分别走创建和消息端点', async () => {
    await createSupportConversation('token', '需要协助')
    await sendSupportMessage('token', 12, '补充说明')

    expect(mocks.requestJson.mock.calls.map((call) => [call[0], call[1].method])).toEqual([
      ['/support/conversations', 'POST'],
      ['/support/conversations/12/messages', 'POST'],
    ])
    expect(mocks.requestJson.mock.calls[0]?.[1].body).toBe(JSON.stringify({ content: '需要协助' }))
    expect(mocks.requestJson.mock.calls[1]?.[1].body).toBe(JSON.stringify({ content: '补充说明' }))
  })

  it('实时地址使用 2.0 WebSocket 并编码令牌', () => {
    expect(supportConversationWsUrl('a b')).toBe(
      'ws://localhost:3000/api/support/conversations/ws?token=a%20b',
    )
  })
})
