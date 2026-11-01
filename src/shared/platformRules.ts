/**
 * 规则中心列出的平台公示文件。
 *
 * `code` 是后端 `contract_template.name`，正文通过 `/api/auth/agreement-content` 现取，
 * 前端只维护「列哪些、叫什么、按什么顺序」。后端只放行公示清单里的代号，
 * 两边要对得上（清单在 `backend_73info/crates/identity/src/domain/agreement.rs`）。
 */
export type PlatformRule = {
  code: string
  title: string
}

export const platformRules: PlatformRule[] = [
  { code: 'dispute_rule', title: '争议处理规则' },
  { code: 'deposit_credit_rule', title: '保证金与信用规则' },
  { code: 'fee_settlement_invoice_rule', title: '费率、结算与开票规则' },
  { code: 'resource_listing_rule', title: '资源上架与接口下线规则' },
  { code: 'community_rule', title: '社区规范与违规处理规则' },
  { code: 'privacy_policy', title: '隐私政策' },
  { code: 'activity_rule', title: '活动规则' },
  { code: 'payment_refund_notice', title: '支付与退款说明' },
  { code: 'third_party_authorization', title: '第三方应用授权协议' },
  { code: 'appeal_rule', title: '申诉与举报规则' },
  { code: 'team_rule', title: '团队规则' },
]

/** 按代号取标题；未知代号返回空串。 */
export function platformRuleTitle(code: string): string {
  return platformRules.find((rule) => rule.code === code)?.title ?? ''
}
