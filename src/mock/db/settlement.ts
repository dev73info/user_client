/**
 * 收款账户（结算账户）的假数据。
 *
 * 这一族接口原本整组缺失，`GET /api/payment/settlement-account` 落到兜底的 `[]`——
 * 而 `[]` 在 JS 里是**真值**，适配层 `account ? toSnapshot(account) : null` 会把它当成账户对象，
 * 于是账户页永远停在「正在自动开通收款账户，稍后刷新查看」，一个永远不会结束的等待。
 *
 * 这里给一份能走完整条链的账：初始状态是「渠道会员已就绪、还没绑卡」（`active` + `member_ready`，
 * `accepts_settlement` 为假），对应界面上的「收款账户：待绑卡，认证已完成，绑定银行卡后即可收取合同款」。
 * 绑定 / 换绑 / 注销都会真的改这里，所以预览时整条绑卡流程点得到，不是只换一句提示。
 *
 * 契约只存**卡号后四位**，完整卡号平台不留，这里也一样。
 */

import type { components } from '@/api/generated/schema'

import { DEV_USERNAME, datetime } from './shared'

/** 契约里的账户对象（`SettlementAccountResponse`）。 */
export type MockSettlementAccount = components['schemas']['SettlementAccountResponse']

export const settlementAccount: MockSettlementAccount = {
  username: DEV_USERNAME,
  member_type: 'personal',
  account_name: '柒叁演示',
  bank_name: '',
  account_no_tail: '',
  status: 'active',
  status_label: '渠道已通过，待绑定收款卡',
  // 渠道会员已就绪：绑卡这一步在用户手里，不是等平台。
  member_ready: true,
  accepts_settlement: false,
  review_note: '',
  provider_error: null,
  credit_code: null,
  merchant_type: null,
  updated_time: datetime(-2, 10, 0),
}

/** 绑卡 / 换绑：两者字段相同，平台只留后四位。 */
export function bindSettlementAccount(payload: {
  account_name?: string
  bank_name?: string
  account_no_tail?: string
  member_type?: string | null
}): MockSettlementAccount {
  settlementAccount.account_name = (payload.account_name ?? '').trim()
  settlementAccount.bank_name = (payload.bank_name ?? '').trim()
  settlementAccount.account_no_tail = (payload.account_no_tail ?? '').trim()
  if (payload.member_type) {
    settlementAccount.member_type = payload.member_type
  }
  // 号码齐备 → 能收分账款。这一位是界面判定「已绑卡」的唯一口径。
  settlementAccount.accepts_settlement =
    settlementAccount.account_no_tail.length > 0 && settlementAccount.bank_name.length > 0
  settlementAccount.status = 'active'
  settlementAccount.status_label = settlementAccount.accepts_settlement
    ? '已绑定收款账户'
    : '渠道已通过，待绑定收款卡'
  settlementAccount.updated_time = datetime(0, 12, 0)

  return settlementAccount
}

/** 注销：行不删，只置 `closed`（历史分账与提现单上仍印着当时的账户）。 */
export function closeSettlementAccount(): MockSettlementAccount {
  settlementAccount.status = 'closed'
  settlementAccount.status_label = '已注销'
  settlementAccount.accepts_settlement = false
  settlementAccount.updated_time = datetime(0, 12, 0)

  return settlementAccount
}
