import type { ConversationHistoryDisclosure } from '@/api/conversations'

/**
 * 「系统通知」页用例的夹具工厂（R047 拆出的挂载烟测与过户用例共用）。
 *
 * 几类来源的字段都很多，用例只关心被聚合层读到的那几个，所以工厂补齐其余字段，
 * 不在每个用例里铺一整份对象——一份铺开就是几十行，两个 spec 各抄一遍既难比对也超行数预算。
 * 与 `__tests__/notifications.spec.ts` 里的同类工厂同源（那边测纯函数，不跨文件引用，避免耦合）。
 */

export function historyDisclosureFixture(
  overrides: Partial<ConversationHistoryDisclosure> = {},
): ConversationHistoryDisclosure {
  return {
    id: 3,
    conversation_id: 'CONV-1',
    requirement_id: 'REQ-1',
    requirement_title: '企业官网改版',
    customer: 'cust',
    previous_developer: 'dev_old',
    current_developer: 'dev_new',
    developer_consent: 'pending',
    customer_consent: 'pending',
    status: 'pending',
    created_at: '2026-03-05T09:00:00+08:00',
    ...overrides,
  }
}
