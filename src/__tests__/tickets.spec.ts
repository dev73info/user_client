import { beforeEach, describe, expect, it, vi } from 'vitest'

import { closeTicket, createTicket, getTicketDetail, listTickets, replyTicket } from '@/api/tickets'
import {
  countTickets,
  filterTickets,
  sortTickets,
  ticketPriorityLabel,
  ticketStatusLabel,
} from '@/shared/ticketDisplay'

const mocks = vi.hoisted(() => ({ requestJson: vi.fn(), authHeaders: vi.fn() }))

vi.mock('@/api/http', () => ({
  requestJson: mocks.requestJson,
  authHeaders: mocks.authHeaders,
}))

const tickets = [
  {
    id: 1,
    ticket_id: 'TK-CLOSED',
    creator: 'alice',
    subject: '旧问题',
    category: '账号',
    priority: 'low',
    status: 'closed',
    created_at: '2026-10-20T08:00:00Z',
    updated_at: '2026-10-20T09:00:00Z',
  },
  {
    id: 2,
    ticket_id: 'TK-OPEN',
    creator: 'alice',
    subject: '支付问题',
    category: '支付',
    priority: 'urgent',
    status: 'open',
    created_at: '2026-10-21T08:00:00Z',
    updated_at: '2026-10-21T09:00:00Z',
  },
]

describe('工单接口与展示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authHeaders.mockReturnValue({ Authorization: 'Bearer token' })
    mocks.requestJson.mockResolvedValue({})
  })

  it('列表与详情走本人工单端点', async () => {
    await listTickets('token')
    await getTicketDetail('token', 'TK-1')
    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/ticket')
    expect(mocks.requestJson.mock.calls[1]?.[0]).toBe('/ticket/TK-1')
  })

  it('创建、回复、关闭使用正确方法与请求体', async () => {
    await createTicket('token', { subject: '问题', content: '说明', priority: 'high' })
    await replyTicket('token', 'TK-1', { content: '补充' })
    await closeTicket('token', 'TK-1')

    expect(mocks.requestJson.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(mocks.requestJson.mock.calls[0]?.[1].body)).toEqual({
      subject: '问题',
      content: '说明',
      priority: 'high',
    })
    expect(mocks.requestJson.mock.calls[1]?.[0]).toBe('/ticket/TK-1/messages')
    expect(mocks.requestJson.mock.calls[2]?.[1]).toMatchObject({ method: 'PATCH' })
  })

  it('排序、筛选与计数不分叉', () => {
    const sorted = sortTickets(tickets)
    expect(sorted.map((item) => item.ticket_id)).toEqual(['TK-OPEN', 'TK-CLOSED'])
    expect(filterTickets(sorted, { keyword: '支付', status: 'all', priority: 'all' })).toHaveLength(
      1,
    )
    expect(countTickets(sorted)).toEqual({ total: 2, pending: 1, resolved: 1 })
    expect(ticketStatusLabel('open')).toBe('待处理')
    expect(ticketPriorityLabel('urgent')).toBe('紧急')
  })
})
