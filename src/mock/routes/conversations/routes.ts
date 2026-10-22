import type { MockRoute } from '../../router'

import { type RequirementConversation } from '@/shared/conversations'
import { DEV_USERNAME, findRequirement } from '../../db'
import { jsonResponse, textResponse } from '../../response'
import {
  allocateMessageId,
  buildConversation,
  createEventStream,
  detailOf,
  messagesOf,
  nowText,
  readKey,
  readStore,
  visibleRequirements,
} from './helpers'

export const conversationRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/conversations/',
    note: '我的会话列表',
    handler: (request) =>
      jsonResponse(
        visibleRequirements(request)
          .map((item) => buildConversation(request, item.requirement_id))
          .filter((item): item is RequirementConversation => item !== null),
      ),
  },
  {
    method: 'GET',
    path: '/conversations',
    note: '我的会话列表（不带斜杠的写法）',
    handler: (request) =>
      jsonResponse(
        visibleRequirements(request)
          .map((item) => buildConversation(request, item.requirement_id))
          .filter((item): item is RequirementConversation => item !== null),
      ),
  },
  {
    method: 'GET',
    path: '/conversations/events',
    note: '实时事件流（SSE）：首帧推当前会话，之后只发心跳',
    handler: (request) => {
      const code = request.query.get('requirement_id') ?? ''
      return createEventStream(code, request)
    },
  },
  {
    method: 'GET',
    path: '/conversations/history-disclosures',
    note: '与我相关的历史沟通公开申请：演示数据没有',
    handler: () => jsonResponse([]),
  },
  {
    method: 'POST',
    path: '/conversations/history-disclosures/requirement/:requirementId',
    note: '申请公开历史沟通：mock 直接放行并返回会话详情',
    handler: (request, params) => {
      const detail = detailOf(request, params.requirementId ?? '')
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/conversations/history-disclosures/:disclosureId/respond',
    note: '历史沟通申请表决',
    handler: () =>
      jsonResponse({
        id: 1,
        requirement_id: '',
        status: 'approved',
        created_at: nowText(),
        responded_at: nowText(),
      }),
  },
  {
    method: 'GET',
    path: '/conversations/requirement/:requirementId',
    note: '按需求取会话详情',
    handler: (request, params) => {
      const detail = detailOf(request, params.requirementId ?? '')
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/conversations/:conversationId/read',
    note: '标记已读：把这一侧的已读位置推到最新一条消息',
    handler: (request, params) => {
      const code = String(params.conversationId ?? '').replace(/^CONV-/, '')
      const lastRead = messagesOf(code).reduce((max, message) => Math.max(max, message.id), 0)
      readStore.set(readKey(request, code), lastRead)
      return jsonResponse({ last_read_message_id: lastRead })
    },
  },
  {
    method: 'POST',
    path: '/conversations/:conversationId/messages/attachment',
    note: '发带附件的消息（mock 只记文本，不存文件）',
    handler: (request, params) => {
      const code = String(params.conversationId ?? '').replace(/^CONV-/, '')
      const list = messagesOf(code)
      const body = (request.body ?? {}) as { content?: string; file_name?: string }

      list.push({
        id: allocateMessageId(),
        conversation_id: params.conversationId ?? '',
        sender: request.identity === 'dev' ? DEV_USERNAME : (findRequirement(code)?.creator ?? ''),
        sender_role: request.identity === 'dev' ? 'developer' : 'customer',
        content: body.content ?? '',
        attachment_url: '/uploads/mock-attachment.pdf',
        attachment_name: body.file_name ?? 'mock-attachment.pdf',
        attachment_mime: 'application/pdf',
        attachment_size: 1024,
        message_type: 'text',
        action_type: null,
        action_ref: null,
        created_at: nowText(),
      })

      const detail = detailOf(request, code)
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/conversations/:conversationId/messages',
    note: '发消息：追加到内存会话并回整份详情（前端用返回值刷新列表）',
    handler: (request, params) => {
      const code = String(params.conversationId ?? '').replace(/^CONV-/, '')
      const requirement = findRequirement(code)
      const list = messagesOf(code)
      const body = (request.body ?? {}) as { content?: string }

      list.push({
        id: allocateMessageId(),
        conversation_id: params.conversationId ?? '',
        sender: request.identity === 'dev' ? DEV_USERNAME : (requirement?.creator ?? ''),
        sender_role: request.identity === 'dev' ? 'developer' : 'customer',
        content: body.content ?? '',
        message_type: 'text',
        action_type: null,
        action_ref: null,
        created_at: nowText(),
      })

      const detail = detailOf(request, code)
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
]
