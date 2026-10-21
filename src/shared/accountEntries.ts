/**
 * 账户入口行的形状（「账号与安全」与「认证管理」两张卡片共用）。
 *
 * 视图只负责按状态拼出这些描述对象，渲染与样式在 `components/account/AccountEntryGrid.vue`，
 * 点了之后做什么仍在视图的 `openAccountEntry` 里。类型单独放这儿，是为了让组件与视图
 * 都从同一份定义取值，而不是在 `.vue` 里互相 import 类型。
 */
import type { Component } from 'vue'

/// 标签语气。`ui_73info` 的 `TTag` 收的是语义 `tone`，与 Element 的 `type` 同词；
/// 这里的取值正好都在 `Tone` 里，所以字段名跟着改成 `tone`，模板写 `:tone`。
export type AccountEntryStatus = { text: string; tone: 'success' | 'warning' | 'danger' | 'info' }

export type AccountEntry = {
  key: string
  title: string
  desc: string
  icon: Component
  status?: AccountEntryStatus
  danger?: boolean
  loading?: boolean
  /** 审核期间不放开入口：点了只给原因，不打开登记弹窗（视觉上也是禁用态）。 */
  locked?: boolean
}

export type AccountEntryGroup = { title: string; entries: AccountEntry[] }

/// 渠道 id → 用户看得懂的名字。入口行的标题、绑定 / 解绑的提示文案都读这一份，
/// 免得「入口叫 GitHub、提示里叫 github」这种两处各写一张表的老毛病。
export function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    github: 'GitHub',
    gitee: 'Gitee',
    qq: 'QQ',
    wechat: '微信',
    alipay: '支付宝',
  }
  return labels[provider] ?? provider
}
