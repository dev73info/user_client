import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, readInt, readString } from '../response'
import {
  markAllNotificationsRead,
  markNotificationRead,
  myNotifications,
  unreadNotificationCount,
} from '../db/notifications'

/** 站内通知收件箱：分页 + kind 筛选 + 已读动作。契约见 `/api/notification`。 */
const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/notification',
    note: '我的通知（分页、kind 筛选、只看未读）',
    handler: (request) => {
      const kind = readString(request.query, 'kind')
      const unreadOnly =
        readString(request.query, 'unread_only') === 'true' ||
        readString(request.query, 'unread') === 'true'
      const page = Math.max(1, readInt(request.query, 'page', 1))
      const pageSize = Math.min(100, Math.max(1, readInt(request.query, 'page_size', 20)))

      const filtered = myNotifications()
        .filter((item) => (!kind || item.kind === kind) && (!unreadOnly || !item.read))
        .sort((left, right) => right.created_time.localeCompare(left.created_time))
      const start = (page - 1) * pageSize

      return jsonResponse({
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
        unread_count: unreadNotificationCount(),
      })
    },
  },
  {
    method: 'GET',
    path: '/notification/unread-count',
    note: '我的未读数（铃铛角标）',
    handler: () => jsonResponse({ unread: unreadNotificationCount() }),
  },
  {
    method: 'POST',
    path: '/notification/read-all',
    note: '全部标为已读',
    handler: () => jsonResponse({ marked: markAllNotificationsRead() }),
  },
  {
    method: 'POST',
    path: '/notification/:notification_id/read',
    note: '标记一条已读',
    handler: (_request, params) => {
      const updated = markNotificationRead(params.notification_id ?? '')
      return updated
        ? jsonResponse(updated)
        : jsonResponse({ code: 'NOT_FOUND', message: '通知不存在' }, 404)
    },
  },
]

export const notificationRoutes = defineRouteTable('notification', routes)
