import type { ConversationCardSide } from './types'

/**
 * 卡片该摆在会话的哪一侧：这一步是谁做的，就靠谁那一侧。
 *
 * 发起方由后端写卡片时定下（`requirement_conversation_message.actor_role`）：双方某一方做的
 * 动作带 `customer` / `developer`，纯平台通知（结单、客服裁决、超时兜底）为空。平台通知居中；
 * 查看者身份也认不出时（历史卡片先于换人，双方对不上）同样按平台通知处理——摆错侧比居中
 * 更容易被误读成「对方做的」或「我做的」。
 */
export function conversationCardSide(
  actorRole: 'customer' | 'developer' | null | undefined,
  viewerRole: 'customer' | 'developer' | null,
): ConversationCardSide {
  if (actorRole !== 'customer' && actorRole !== 'developer') {
    return 'system'
  }
  if (!viewerRole) {
    return 'system'
  }
  return actorRole === viewerRole ? 'mine' : 'other'
}
