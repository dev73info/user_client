import { datetime } from './shared'

import type { MockTicket, MockTicketEvent, MockTicketMessage } from './ticketModel'

const STAFF = 'support_demo'

let seedMessageId = 1
let seedEventId = 1

function msg(
  ticketId: string,
  sender: string,
  senderRole: string,
  content: string,
  createdAt: string,
  attachmentIds: number[] = [],
): MockTicketMessage {
  return {
    id: seedMessageId++,
    ticket_id: ticketId,
    sender,
    sender_role: senderRole,
    content,
    internal: false,
    attachment_ids: attachmentIds,
    created_at: createdAt,
  }
}

function ev(
  ticketId: string,
  eventType: string,
  createdAt: string,
  extra: Partial<MockTicketEvent> = {},
): MockTicketEvent {
  return {
    id: seedEventId++,
    ticket_id: ticketId,
    event_type: eventType,
    actor: null,
    actor_role: null,
    from_value: null,
    to_value: null,
    note: null,
    created_at: createdAt,
    ...extra,
  }
}

/**
 * 四条演示工单，覆盖全部交互：
 * 1) 处理中且首次响应逾期（未读 2）
 * 2) 已解决、未评价（可评价）
 * 3) 关闭未满 7 天（可回复 / 可重开）
 * 4) 关闭超过 7 天（回复拦截、已评价只读）
 */
export function seedMockTickets(creator: string): MockTicket[] {
  return [
    {
      id: 1,
      ticket_id: 'TK-20261106-0001',
      creator,
      subject: '充值后余额没有到账',
      category: '支付',
      priority: 'high',
      status: 'processing',
      source: 'web',
      assigned_to: STAFF,
      first_response_at: null,
      first_response_due_at: datetime(-2, 9, 10),
      first_response_overdue: true,
      resolved_at: null,
      closed_at: null,
      reopen_count: 0,
      satisfaction_rating: null,
      satisfaction_comment: null,
      satisfaction_rated_at: null,
      last_user_reply_at: datetime(-3, 9, 30),
      last_staff_reply_at: null,
      last_replied_at: datetime(-3, 9, 30),
      last_replied_by: creator,
      unread_count: 2,
      created_at: datetime(-3, 9, 10),
      updated_at: datetime(-1, 10, 0),
      messages: [
        msg('TK-20261106-0001', creator, 'user', '充值后余额没有到账，订单号 20261106-001。', datetime(-3, 9, 10)),
        msg('TK-20261106-0001', creator, 'user', '补充：是微信支付。', datetime(-3, 9, 30)),
      ],
      events: [
        ev('TK-20261106-0001', 'created', datetime(-3, 9, 10), { actor: creator, actor_role: 'user' }),
        ev('TK-20261106-0001', 'assigned', datetime(-3, 10, 0), {
          actor: STAFF,
          actor_role: 'staff',
          to_value: STAFF,
        }),
        ev('TK-20261106-0001', 'status_change', datetime(-3, 10, 5), {
          actor: STAFF,
          actor_role: 'staff',
          from_value: 'open',
          to_value: 'processing',
        }),
      ],
    },
    {
      id: 2,
      ticket_id: 'TK-20261104-0002',
      creator,
      subject: '登录验证码收不到',
      category: '账号',
      priority: 'normal',
      status: 'resolved',
      source: 'web',
      assigned_to: STAFF,
      first_response_at: datetime(-5, 12, 0),
      first_response_due_at: datetime(-4, 11, 0),
      first_response_overdue: false,
      resolved_at: datetime(-1, 15, 0),
      closed_at: null,
      reopen_count: 0,
      satisfaction_rating: null,
      satisfaction_comment: null,
      satisfaction_rated_at: null,
      last_user_reply_at: datetime(-2, 10, 0),
      last_staff_reply_at: datetime(-1, 15, 0),
      last_replied_at: datetime(-1, 15, 0),
      last_replied_by: STAFF,
      unread_count: 0,
      created_at: datetime(-5, 11, 0),
      updated_at: datetime(-1, 15, 0),
      messages: [
        msg('TK-20261104-0002', creator, 'user', '登录时一直收不到短信验证码。', datetime(-5, 11, 0), [1]),
        msg('TK-20261104-0002', STAFF, 'staff', '已切换备用通道重发，请再试一次。', datetime(-5, 12, 0)),
      ],
      events: [
        ev('TK-20261104-0002', 'created', datetime(-5, 11, 0), { actor: creator, actor_role: 'user' }),
        ev('TK-20261104-0002', 'first_response', datetime(-5, 12, 0), {
          actor: STAFF,
          actor_role: 'staff',
        }),
        ev('TK-20261104-0002', 'resolved', datetime(-1, 15, 0), {
          actor: STAFF,
          actor_role: 'staff',
          from_value: 'processing',
          to_value: 'resolved',
        }),
      ],
    },
    {
      id: 3,
      ticket_id: 'TK-20261106-0003',
      creator,
      subject: '资源下载链接失效',
      category: '资源',
      priority: 'low',
      status: 'closed',
      source: 'web',
      assigned_to: STAFF,
      first_response_at: datetime(-4, 9, 0),
      first_response_due_at: datetime(-3, 8, 0),
      first_response_overdue: false,
      resolved_at: datetime(-2, 17, 0),
      closed_at: datetime(-2, 18, 0),
      reopen_count: 0,
      satisfaction_rating: null,
      satisfaction_comment: null,
      satisfaction_rated_at: null,
      last_user_reply_at: datetime(-4, 8, 30),
      last_staff_reply_at: datetime(-2, 17, 0),
      last_replied_at: datetime(-2, 17, 0),
      last_replied_by: STAFF,
      unread_count: 0,
      created_at: datetime(-4, 8, 0),
      updated_at: datetime(-2, 18, 0),
      messages: [
        msg('TK-20261106-0003', creator, 'user', '资源下载链接打开是 404。', datetime(-4, 8, 0)),
        msg('TK-20261106-0003', STAFF, 'staff', '链接已重新生成，请从资源详情页重新下载。', datetime(-4, 9, 0)),
      ],
      events: [
        ev('TK-20261106-0003', 'created', datetime(-4, 8, 0), { actor: creator, actor_role: 'user' }),
        ev('TK-20261106-0003', 'first_response', datetime(-4, 9, 0), {
          actor: STAFF,
          actor_role: 'staff',
        }),
        ev('TK-20261106-0003', 'resolved', datetime(-2, 17, 0), {
          actor: STAFF,
          actor_role: 'staff',
        }),
        ev('TK-20261106-0003', 'closed', datetime(-2, 18, 0), {
          actor: STAFF,
          actor_role: 'staff',
          from_value: 'resolved',
          to_value: 'closed',
        }),
      ],
    },
    {
      id: 4,
      ticket_id: 'TK-20261028-0004',
      creator,
      subject: '保证金退还进度咨询',
      category: '支付',
      priority: 'urgent',
      status: 'closed',
      source: 'web',
      assigned_to: STAFF,
      first_response_at: datetime(-12, 11, 0),
      first_response_due_at: datetime(-12, 10, 30),
      first_response_overdue: false,
      resolved_at: datetime(-9, 15, 0),
      closed_at: datetime(-9, 16, 0),
      reopen_count: 0,
      satisfaction_rating: 5,
      satisfaction_comment: '处理得很快',
      satisfaction_rated_at: datetime(-9, 16, 30),
      last_user_reply_at: datetime(-11, 9, 0),
      last_staff_reply_at: datetime(-9, 15, 0),
      last_replied_at: datetime(-9, 15, 0),
      last_replied_by: STAFF,
      unread_count: 1,
      created_at: datetime(-12, 10, 0),
      updated_at: datetime(-9, 16, 30),
      messages: [
        msg('TK-20261028-0004', creator, 'user', '想确认保证金退还的到账时间。', datetime(-12, 10, 0)),
        msg('TK-20261028-0004', STAFF, 'staff', '已提交出款，按银行处理时间 1-3 个工作日到账。', datetime(-12, 11, 0)),
      ],
      events: [
        ev('TK-20261028-0004', 'created', datetime(-12, 10, 0), { actor: creator, actor_role: 'user' }),
        ev('TK-20261028-0004', 'first_response', datetime(-12, 11, 0), {
          actor: STAFF,
          actor_role: 'staff',
        }),
        ev('TK-20261028-0004', 'resolved', datetime(-9, 15, 0), { actor: STAFF, actor_role: 'staff' }),
        ev('TK-20261028-0004', 'closed', datetime(-9, 16, 0), { actor: STAFF, actor_role: 'staff' }),
        ev('TK-20261028-0004', 'rated', datetime(-9, 16, 30), {
          actor: creator,
          actor_role: 'user',
          note: '5 星',
        }),
      ],
    },
  ]
}
