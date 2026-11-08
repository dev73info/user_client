import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/api/http'
import {
  TICKET_REOPEN_EXPIRED,
  closeTicket,
  createTicket,
  downloadTicketAttachment,
  getTicketDetail,
  isReopenExpiredError,
  listTicketCategories,
  listTickets,
  markTicketRead,
  rateTicket,
  reopenTicket,
  replyTicket,
  uploadTicketAttachment,
  type TicketItem,
} from '@/api/tickets'
import {
  buildTicketTimeline,
  countTickets,
  filterTickets,
  sortTickets,
  sumUnread,
  ticketPriorityLabel,
  ticketStatusLabel,
} from '@/shared/ticketDisplay'

const mocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
  requestVoid: vi.fn(),
  requestBlob: vi.fn(),
  authHeaders: vi.fn(),
  authHeader: vi.fn(),
}))

vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/http')>()
  return {
    ...actual,
    requestJson: mocks.requestJson,
    requestVoid: mocks.requestVoid,
    requestBlob: mocks.requestBlob,
    authHeaders: mocks.authHeaders,
    authHeader: mocks.authHeader,
  }
})

function makeTicket(overrides: Partial<TicketItem> = {}): TicketItem {
  return {
    id: 1,
    ticket_id: 'TK-1',
    creator: 'alice',
    subject: '问题',
    priority: 'normal',
    status: 'open',
    created_at: '2026-10-20T08:00:00Z',
    updated_at: '2026-10-20T09:00:00Z',
    ...overrides,
  }
}

describe('工单接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authHeaders.mockReturnValue({ Authorization: 'Bearer token' })
    mocks.authHeader.mockReturnValue({ Authorization: 'Bearer token' })
    mocks.requestJson.mockResolvedValue({})
    mocks.requestVoid.mockResolvedValue(undefined)
    mocks.requestBlob.mockResolvedValue(new Blob(['x']))
  })

  it('列表走分页信封并带 status / page 参数', async () => {
    mocks.requestJson.mockResolvedValue({ items: [], total: 0, page: 2, page_size: 10 })
    const result = await listTickets('token', { status: 'open', page: 2, page_size: 10 })

    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/ticket?status=open&page=2&page_size=10')
    expect(result.page_size).toBe(10)
  })

  it('status=all 不写进查询串', async () => {
    await listTickets('token', { status: 'all' })
    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/ticket')
  })

  it('详情、创建、回复使用正确路径与请求体', async () => {
    await getTicketDetail('token', 'TK-1')
    await createTicket('token', {
      subject: '问题',
      content: '说明',
      priority: 'high',
      attachment_ids: [3],
    })
    await replyTicket('token', 'TK-1', { content: '补充', attachment_ids: [4] })

    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/ticket/TK-1')
    expect(JSON.parse(mocks.requestJson.mock.calls[1]?.[1].body)).toEqual({
      subject: '问题',
      content: '说明',
      priority: 'high',
      attachment_ids: [3],
    })
    expect(mocks.requestJson.mock.calls[2]?.[0]).toBe('/ticket/TK-1/messages')
    expect(JSON.parse(mocks.requestJson.mock.calls[2]?.[1].body)).toEqual({
      content: '补充',
      attachment_ids: [4],
    })
  })

  it('关闭、重开、满意度、已读走对应方法与路径', async () => {
    await closeTicket('token', 'TK-1')
    await reopenTicket('token', 'TK-1')
    await rateTicket('token', 'TK-1', { rating: 4, comment: '不错' })
    await markTicketRead('token', 'TK-1')

    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/ticket/TK-1/close')
    expect(mocks.requestJson.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' })
    expect(mocks.requestJson.mock.calls[1]?.[0]).toBe('/ticket/TK-1/reopen')
    expect(mocks.requestJson.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' })
    expect(mocks.requestJson.mock.calls[2]?.[0]).toBe('/ticket/TK-1/satisfaction')
    expect(JSON.parse(mocks.requestJson.mock.calls[2]?.[1].body)).toEqual({
      rating: 4,
      comment: '不错',
    })
    expect(mocks.requestVoid.mock.calls[0]?.[0]).toBe('/ticket/TK-1/read')
    expect(mocks.requestVoid.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' })
  })

  it('分类、附件上传与下载走新端点', async () => {
    await listTicketCategories('token')
    const file = new File(['hello'], '说明.txt', { type: 'text/plain' })
    await uploadTicketAttachment('token', file)
    await downloadTicketAttachment('token', 7)

    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/ticket/categories')
    expect(mocks.requestJson.mock.calls[1]?.[0]).toBe('/ticket/attachments')
    expect(mocks.requestJson.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    const body = mocks.requestJson.mock.calls[1]?.[1].body as FormData
    expect(body.get('file')).toBeInstanceOf(File)
    expect(mocks.requestBlob.mock.calls[0]?.[0]).toBe('/ticket/attachments/7')
  })

  it('重开超期按错误码分支，不匹配文案', () => {
    expect(
      isReopenExpiredError(new HttpError(409, '已超过 7 天，请新建工单', TICKET_REOPEN_EXPIRED)),
    ).toBe(true)
    expect(isReopenExpiredError(new HttpError(409, '其它原因'))).toBe(false)
    expect(isReopenExpiredError(new Error('TICKET_REOPEN_EXPIRED'))).toBe(false)
  })
})

describe('工单展示与进度', () => {
  it('排序、筛选与计数不分叉', () => {
    const tickets = [
      makeTicket({ ticket_id: 'TK-CLOSED', status: 'closed', subject: '旧问题', category: '账号' }),
      makeTicket({
        ticket_id: 'TK-OPEN',
        status: 'open',
        priority: 'urgent',
        subject: '支付问题',
        category: '支付',
      }),
    ]
    const sorted = sortTickets(tickets)
    expect(sorted.map((item) => item.ticket_id)).toEqual(['TK-OPEN', 'TK-CLOSED'])
    expect(filterTickets(sorted, { keyword: '支付', status: 'all', priority: 'all' })).toHaveLength(
      1,
    )
    expect(countTickets(sorted)).toEqual({ total: 2, pending: 1, resolved: 1 })
    expect(ticketStatusLabel('open')).toBe('待处理')
    expect(ticketPriorityLabel('urgent')).toBe('紧急')
  })

  it('未读按页内条目求和', () => {
    const items = [
      makeTicket({ unread_count: 2 }),
      makeTicket({ unread_count: 0 }),
      makeTicket({ unread_count: 3 }),
    ]
    expect(sumUnread(items)).toBe(5)
  })

  it('进度时间线来自事件，缺失节点用状态字段补齐', () => {
    const ticket = makeTicket({
      status: 'closed',
      created_at: '2026-10-20T08:00:00Z',
      resolved_at: '2026-10-21T08:00:00Z',
      closed_at: '2026-10-21T09:00:00Z',
    })
    const timeline = buildTicketTimeline(ticket, [
      {
        id: 1,
        ticket_id: 'TK-1',
        event_type: 'status_change',
        created_at: '2026-10-21T08:00:00Z',
        from_value: 'open',
        to_value: 'resolved',
      },
    ])

    expect(timeline.some((entry) => entry.label === '状态变更')).toBe(true)
    expect(timeline.some((entry) => entry.key === 'milestone-created')).toBe(true)
    expect(timeline.some((entry) => entry.key === 'milestone-closed')).toBe(true)
    expect(timeline.some((entry) => entry.key === 'milestone-resolved')).toBe(true)
  })
})
