/**
 * 徽章与邀请的接口。
 *
 * 之前这一组在 mock 里没实现，`/badges/my` 走空壳兜底返回 `[]`，
 * 徽章墙于是读 `badges` 时抛错、整个页面停在加载态。数据在 `db/badges.ts`，
 * 这里只做「读当前身份的那份 / 改佩戴状态」。
 */

import {
  badgeDefinitions,
  inviteCode,
  inviteStats,
  myBadges,
  setEquippedBadges,
} from '../db/badges'
import { currentMockProfile } from '../identity'
import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse } from '../response'

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/badges',
    note: '全部徽章定义',
    handler: () => jsonResponse(badgeDefinitions),
  },
  {
    method: 'GET',
    path: '/badges/my',
    note: '我已获得的徽章',
    handler: () => jsonResponse({ badges: myBadges() }),
  },
  {
    method: 'GET',
    path: '/badges/user/:username',
    note: '某个用户的徽章：他人视角看不到佩戴状态以外的差别，直接按当前身份返回',
    handler: () => jsonResponse({ badges: myBadges() }),
  },
  {
    method: 'PUT',
    path: '/badges/my/equipped',
    note: '佩戴徽章：传进来的 code 列表即佩戴中',
    handler: (request) => {
      const body = (request.body ?? {}) as { codes?: string[] }
      return jsonResponse({ badges: setEquippedBadges(body.codes ?? []) })
    },
  },
  {
    method: 'GET',
    path: '/invite/my-code',
    note: '我的邀请码',
    handler: () => jsonResponse(inviteCode()),
  },
  {
    method: 'GET',
    path: '/invite/my-stats',
    note: '我的邀请记录',
    handler: () => jsonResponse(inviteStats()),
  },
  {
    method: 'GET',
    path: '/invite/leaderboard',
    note: '邀请排行榜：只给当前身份一条，够撑住页面',
    handler: () => {
      const profile = currentMockProfile()

      return jsonResponse({
        period: 'alltime',
        entries: [
          {
            rank: 1,
            username: profile.username,
            avatar_url: null,
            count: inviteStats().total_invited,
            badges: [],
          },
        ],
      })
    },
  },
]

export const badgeRoutes = defineRouteTable('badges', routes)
