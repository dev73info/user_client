import type { components, operations } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

/**
 * 站内通知收件箱的接口层：逐条对应 `src/api/generated/openapi.json` 里的
 * `/api/notification`、`/api/notification/unread-count`、`/api/notification/read-all`、
 * `/api/notification/{notification_id}/read`。
 *
 * 字段一律照契约的 snake_case，类型直接取 `components['schemas'][...]`；
 * 时间是后端已排好的东八区墙钟串，直接显示。
 */
export type BackendNotification = Schemas['NotificationResponse']
export type NotificationPage = Schemas['NotificationPageResponse']
export type NotificationListQuery = NonNullable<operations['list_mine']['parameters']['query']>
export type MarkAllReadResult = Schemas['MarkAllReadResponse']

/** 一次取全时的每页条数：契约上限 100。 */
const FETCH_ALL_PAGE_SIZE = 100
/** 翻页上限：5000 条已经远超一个用户的收件箱规模，防止后端 bug 让循环打不完。 */
const FETCH_ALL_MAX_PAGES = 50

function withQuery(path: string, query: NotificationListQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value).trim())
    }
  }
  const suffix = params.toString()
  return suffix ? `${path}?${suffix}` : path
}

export function listMyNotifications(
  token: string,
  query: NotificationListQuery = {},
): Promise<NotificationPage> {
  return requestJson<NotificationPage>(
    withQuery('/notification', query),
    { headers: authHeaders(token) },
    '加载站内通知失败',
  )
}

/**
 * 取全部页。
 *
 * 通知中心把后端收件箱与三支本地来源合成同一张按时间倒序的列表，筛选与分页都在合并后做；
 * 只取当前页会把排序与页边界算错。服务端分页在这里只作为取数手段，页大小按契约上限走。
 */
export async function listAllMyNotifications(token: string): Promise<NotificationPage> {
  const items: BackendNotification[] = []
  let first: NotificationPage | null = null
  let page = 1

  while (page <= FETCH_ALL_MAX_PAGES) {
    const result = await listMyNotifications(token, { page, page_size: FETCH_ALL_PAGE_SIZE })
    first ??= result
    items.push(...result.items)
    if (result.items.length === 0 || items.length >= result.total) {
      break
    }
    page += 1
  }

  if (page > FETCH_ALL_MAX_PAGES) {
    console.warn('[notification] 收件箱超过 5000 条，只合并了前 5000 条')
  }

  return {
    ...(first ?? { page: 1, page_size: FETCH_ALL_PAGE_SIZE, total: items.length, unread_count: 0 }),
    items,
    total: items.length,
  }
}

/** 未读数：只取 `unread` 一个字段，角标不关心别的。 */
export async function getMyNotificationUnreadCount(token: string): Promise<number> {
  const result = await requestJson<Schemas['UnreadCountResponse']>(
    '/notification/unread-count',
    { headers: authHeaders(token) },
    '加载未读通知数失败',
  )
  return result.unread
}

/** 标记一条已读；返回标记后的通知（后端同时给出 read / read_time）。 */
export function markMyNotificationRead(
  token: string,
  notificationId: string,
): Promise<BackendNotification> {
  return requestJson<BackendNotification>(
    `/notification/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST', headers: authHeaders(token) },
    '标记已读失败',
  )
}

export function markAllMyNotificationsRead(token: string): Promise<MarkAllReadResult> {
  return requestJson<MarkAllReadResult>(
    '/notification/read-all',
    { method: 'POST', headers: authHeaders(token) },
    '全部标为已读失败',
  )
}
