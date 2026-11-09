/**
 * 未读通知数的广播事件。
 *
 * 通知中心页在内容区里读 / 标记已读，而铃铛角标挂在工作台外壳的图标栏上，
 * 两者没有父子关系。标记已读成功后广播当前未读数，由需要刷新的地方订阅，
 * 与 `shared/conversationEvents.ts` 的会话已读广播是同一套做法。
 */

export const NOTIFICATION_UNREAD_CHANGED_EVENT = '73info:notification-unread-changed'

export type NotificationUnreadChangedDetail = {
  unread: number
}

export function dispatchNotificationUnreadChanged(unread: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<NotificationUnreadChangedDetail>(NOTIFICATION_UNREAD_CHANGED_EVENT, {
      detail: { unread },
    }),
  )
}
