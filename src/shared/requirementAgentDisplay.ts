import type { RequirementAgentMessage } from '@/api/requirementAgent'

/**
 * 「跟 AI 聊着填需求」面板的展示层纯函数与文案（R047 从 `components/RequirementAgentPanel.vue` 下沉）。
 *
 * 只做「消息 → 发送者文案」「时间串 → 两位月日时分」，不碰状态、不发请求。
 */

// 开场示例：降低「不知道从哪说起」的门槛，点一下直接填进输入框
export const AGENT_STARTER_EXAMPLES = [
  '想做一个企业官网，预算 3000 左右',
  '需要一个微信小程序，能下单和看订单',
  '把现有的后台管理系统的登录页改版',
]

export function formatAgentTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function agentSenderLabel(message: RequirementAgentMessage): string {
  switch (message.sender_role) {
    case 'ai':
      return 'AI 助手'
    case 'agent':
      return message.sender_username ? `${message.sender_username}（客服）` : '平台客服'
    case 'system':
      return '系统提示'
    default:
      return '我'
  }
}
