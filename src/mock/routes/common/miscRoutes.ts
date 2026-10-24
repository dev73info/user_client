import type { MockRoute } from '../../router'

import { communityPosts, coupons } from '../../db'
import { currentMockProfile } from '../../identity'
import { jsonResponse, textResponse } from '../../response'
import { currentUsername, devCreditSelf, nowText } from './helpers'

export const miscRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 客服 */
  {
    method: 'GET',
    path: '/support/channels/public',
    note: '客服渠道开关（首页在线客服浮窗据此显示）',
    handler: () => jsonResponse([{ channel_key: 'online', label: '在线客服', enabled: true }]),
  },
  {
    method: 'GET',
    path: '/support/conversations/mine',
    note: '我的客服会话',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/support/conversations/:id',
    note: '会话详情',
    handler: (_request, params) => textResponse(`mock 没有会话 ${params.id ?? ''}`, 404),
  },
  {
    method: 'POST',
    path: '/support/conversations',
    note: '创建客服会话：mock 回一条占位会话，不接客服系统',
    handler: (request) => {
      const body = (request.body ?? {}) as { content?: string }

      return jsonResponse({
        id: 1,
        conversation_no: 'MOCK-SUPPORT-1',
        user_username: currentUsername(),
        user_role: currentMockProfile().role,
        agent_username: null,
        status: 'open',
        priority: 'normal',
        last_message: body.content ?? '',
        last_message_at: nowText(),
        last_message_by: currentUsername(),
        unread_agent: 1,
        unread_user: 0,
        agent_last_read_message_id: null,
        user_last_read_message_id: null,
        created_at: nowText(),
        updated_at: nowText(),
      })
    },
  },
  {
    method: 'POST',
    path: '/support/conversations/:id/messages',
    note: '发消息（mock 只回显，不连客服系统）',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { content?: string }

      return jsonResponse({
        id: Date.now(),
        conversation_id: Number(params.id) || 1,
        sender_username: currentUsername(),
        sender_role: 'user',
        content: body.content ?? '',
        created_at: nowText(),
      })
    },
  },

  /* ---------------------------------------------------------------- 支付渠道与社区 */
  {
    method: 'GET',
    path: '/adapay/availability',
    note: '电签担保可用性：mock 一律可用，发布需求时能选到担保模式',
    handler: () => jsonResponse({ paymentReady: true, escrowBetaOnly: false, escrowAllowed: true }),
  },
  {
    method: 'GET',
    path: '/community/posts',
    note: '社区帖子列表',
    handler: () => jsonResponse(communityPosts),
  },
  {
    method: 'GET',
    path: '/community/posts/:id',
    note: '社区帖子详情',
    handler: (_request, params) => {
      const post = communityPosts.find((item) => String(item.id) === params.id)
      return post ? jsonResponse(post) : textResponse('帖子不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/community/tags',
    note: '社区标签',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/coupons/available',
    note: '我的可用优惠券',
    handler: () => jsonResponse(coupons),
  },
  {
    method: 'GET',
    path: '/teams/invitations',
    note: '我的团队邀请（演示数据没有团队邀请）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/teams/teams',
    note: '我的团队（演示数据没有团队）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/badges/user/:username',
    note: '用户徽章：形状对、内容为空（不做假徽章，避免看起来像真的获得了权益）',
    handler: () => jsonResponse({ badges: [] }),
  },
  {
    method: 'GET',
    path: '/dev/credit/me',
    note: '开发者信用：额度放宽，否则需求大厅的接单按钮会被「信用不足」挡住',
    handler: () => jsonResponse(devCreditSelf()),
  },
]
