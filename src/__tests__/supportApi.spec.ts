import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSupportConversation,
  createSupportGuestSession,
  downloadSupportAttachment,
  getSupportConversationDetail,
  getSupportAvailability,
  listMySupportConversations,
  listPublicSupportChannels,
  rateSupportConversation,
  sendSupportMessage,
  supportConversationWsUrl,
  uploadSupportAttachment,
} from '@/api/support'

const mocks = vi.hoisted(() => ({ requestJson: vi.fn(), requestBlob: vi.fn() }))

vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/http')>()),
  requestJson: mocks.requestJson,
  requestBlob: mocks.requestBlob,
}))

describe('在线客服 2.0 接口', () => {
  beforeEach(() => {
    mocks.requestJson.mockReset()
    mocks.requestBlob.mockReset()
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

  it('访客令牌自动路由到免登录端点', async () => {
    const guest = ['73sg', 'test', 'guest'].join('_')
    mocks.requestJson.mockResolvedValueOnce({ token: guest, display_name: '访客ABC123' })
    await createSupportGuestSession()
    await listMySupportConversations(guest)
    await getSupportConversationDetail(guest, 12)
    await createSupportConversation(guest, '无需登录', [])
    await sendSupportMessage(guest, 12, '继续咨询', [])
    await downloadSupportAttachment(guest, 9)
    await rateSupportConversation(guest, 12, 5, null)

    expect(mocks.requestJson.mock.calls.map((call) => call[0])).toEqual([
      '/support/guest/session',
      '/support/guest/conversations',
      '/support/guest/conversations/12',
      '/support/guest/conversations',
      '/support/guest/conversations/12/messages',
      '/support/guest/conversations/12/satisfaction',
    ])
    expect(mocks.requestBlob.mock.calls[0]?.[0]).toBe('/support/guest/attachments/9')
  })

  it('首次创建与后续发送分别走创建和消息端点', async () => {
    await createSupportConversation('token', '需要协助', [3])
    await sendSupportMessage('token', 12, '补充说明', [4])

    expect(mocks.requestJson.mock.calls.map((call) => [call[0], call[1].method])).toEqual([
      ['/support/conversations', 'POST'],
      ['/support/conversations/12/messages', 'POST'],
    ])
    expect(mocks.requestJson.mock.calls[0]?.[1].body).toBe(
      JSON.stringify({ content: '需要协助', attachment_ids: [3] }),
    )
    expect(mocks.requestJson.mock.calls[1]?.[1].body).toBe(
      JSON.stringify({ content: '补充说明', attachment_ids: [4] }),
    )
  })

  it('附件上传、下载、满意度与在线状态走真实端点', async () => {
    const file = new File(['hello'], '截图.png', { type: 'image/png' })
    const attachment = {
      id: 9,
      file_name: '截图.png',
      content_type: 'image/png',
      size_bytes: 5,
      url: '/api/support/attachments/9',
      created_at: '2026-10-28 10:00:00',
    }
    mocks.requestJson.mockResolvedValueOnce(attachment)
    mocks.requestBlob.mockResolvedValueOnce(new Blob(['x']))
    await uploadSupportAttachment('token', file)
    await downloadSupportAttachment('token', 9)
    await rateSupportConversation('token', 12, 5, '很好')
    await getSupportAvailability()

    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/support/attachments')
    expect((mocks.requestJson.mock.calls[0]?.[1].body as FormData).get('file')).toBe(file)
    expect(mocks.requestBlob.mock.calls[0]?.[0]).toBe('/support/attachments/9')
    expect(mocks.requestJson.mock.calls[1]?.[0]).toBe('/support/conversations/12/satisfaction')
    expect(mocks.requestJson.mock.calls[1]?.[1].body).toBe(
      JSON.stringify({ rating: 5, comment: '很好' }),
    )
    expect(mocks.requestJson.mock.calls[2]?.[0]).toBe('/support/availability/public')
  })

  it('实时地址使用 2.0 WebSocket 并编码令牌', () => {
    const guest = ['73sg', 'test', 'guest'].join('_')
    expect(supportConversationWsUrl('a b')).toBe(
      'ws://localhost:3000/api/support/conversations/ws?token=a%20b',
    )
    expect(supportConversationWsUrl(guest)).toBe(
      `ws://localhost:3000/api/support/guest/conversations/ws?token=${encodeURIComponent(guest)}`,
    )
  })
})
