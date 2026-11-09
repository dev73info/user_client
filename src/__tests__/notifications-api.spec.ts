/** 收件箱 API：「一次取全」按 total 翻完全部页，并带上分页游标。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAllMyNotifications, type BackendNotification } from '@/api/notifications'
import { inboxItem } from './helpers/notifications'

describe('listAllMyNotifications', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('按 total 翻完所有页，返回合并后的列表与后端未读数', async () => {
    const page = (items: BackendNotification[], pageNo: number) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items,
            total: 3,
            page: pageNo,
            page_size: 100,
            unread_count: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    fetchMock.mockImplementation((url: string) => {
      return String(url).includes('page=2')
        ? page([inboxItem({ notification_id: 'NTF-3' })], 2)
        : page(
            [inboxItem({ notification_id: 'NTF-1' }), inboxItem({ notification_id: 'NTF-2' })],
            1,
          )
    })

    const result = await listAllMyNotifications('token')

    expect(result.items.map((item) => item.notification_id)).toEqual(['NTF-1', 'NTF-2', 'NTF-3'])
    expect(result.unread_count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(firstUrl).toContain('/api/notification?')
    expect(firstUrl).toContain('page=1')
    expect(firstUrl).toContain('page_size=100')
  })
})
