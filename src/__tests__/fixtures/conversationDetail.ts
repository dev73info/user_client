/**
 * 需求会话弹窗测试用的固定数据。
 *
 * 弹窗挂载用例的基线详情（`detail`）与两条改造用例要的列表行 / 历史区段形状放在这里，
 * 免得 `requirementConversationModal.spec.ts` 顶掉 300 行的模块预算。
 */

export const nowIso = new Date().toISOString()

export const detail = {
  conversation: {
    id: 7,
    conversation_id: 'conv-1',
    requirement_id: 'REQ-1',
    requirement_title: '做个落地页',
    customer: 'alice',
    developer: 'bob',
    status: 'open' as const,
    requirement_status: 'in_development',
    unread_count: 0,
    last_message_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    history_segments: [],
    history_disclosures: [],
  },
  messages: [
    {
      id: 11,
      conversation_id: 'conv-1',
      sender: 'bob',
      sender_role: 'developer' as const,
      content: '首版已经发你了',
      created_at: nowIso,
    },
    {
      id: 12,
      conversation_id: 'conv-1',
      sender: 'alice',
      sender_role: 'customer' as const,
      content: '收到，我看下',
      created_at: nowIso,
    },
  ],
}

/** 需求大厅 / 开发者侧列表返回的那一条（抽屉按编号从列表里挑）。 */
export const requirementRow = {
  requirement_id: 'REQ-1',
  title: '做个落地页',
  payment_mode: 'platform_guarantee',
  status: 'in_development',
  budget: 5000,
  updated_at: nowIso,
  creator: 'alice',
  developer: 'bob',
  description: '<p>首屏要<strong>能看</strong></p><ul><li>移动端适配</li></ul>',
  acceptance_criteria: '<p>Lighthouse 90 分</p>',
}

/** 我是客户 alice：一段没公开的历史区段（可申请）+ 一条等着我这一票的申请。 */
export const withHistory = {
  conversation: {
    ...structuredClone(detail.conversation),
    history_segments: [
      {
        previous_developer: 'carol',
        segment_start: '2026-01-01 10:00',
        segment_end: '2026-02-01 10:00',
        status: 'hidden',
        developer_consent: 'pending',
        customer_consent: 'pending',
      },
    ],
    history_disclosures: [
      {
        id: 31,
        previous_developer: 'carol',
        current_developer: 'bob',
        developer_consent: 'approved',
        customer_consent: 'pending',
        status: 'pending',
      },
    ],
  },
  messages: structuredClone(detail.messages),
}
