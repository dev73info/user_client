/**
 * 用户侧工单 mock：列表分页、详情（事件 / 动作）、分类、附件、满意度、重开、已读。
 *
 * 静态路径（categories / attachments）先于 `/:ticket_id` 注册，避免被参数路由抢走。
 * 已结束工单的回复在 7 天窗口内自动重开，超期回 409 `TICKET_REOPEN_EXPIRED`。
 */

import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, readInt, readString } from '../response'
import {
  appendMockUserMessage,
  closeMockTicket,
  createMockAttachment,
  createMockTicket,
  findMockTicket,
  listMockTickets,
  markMockRead,
  rateMockTicket,
  reopenMockTicket,
  ticketAttachments,
  ticketCategories,
  toTicketDetail,
  toTicketResponse,
} from '../db/tickets'

function notFound() {
  return jsonResponse({ code: 'TICKET_NOT_FOUND', message: '工单不存在' }, 404)
}

function expired() {
  return jsonResponse({ code: 'TICKET_REOPEN_EXPIRED', message: '已超过 7 天，请新建工单' }, 409)
}

function invalid(message: string) {
  return jsonResponse({ code: 'INVALID_REQUEST', message }, 400)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function readAttachmentIds(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : []
}

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/ticket/categories',
    note: '新建工单用启用中的分类',
    handler: () => jsonResponse(ticketCategories),
  },
  {
    method: 'POST',
    path: '/ticket/attachments',
    note: '工单附件上传（multipart，字段 file）；mock 只记文件名 / 类型 / 大小',
    handler: (request) => {
      const file = request.files[0]
      return jsonResponse(
        createMockAttachment({ name: file?.name, type: file?.type, size: file?.size }),
      )
    },
  },
  {
    method: 'GET',
    path: '/ticket/attachments/:attachment_id',
    note: '附件下载需要 Bearer；mock 返回占位内容',
    handler: (_request, params) => {
      const id = Number(params.attachment_id)
      const attachment = ticketAttachments.find((item) => item.id === id)
      if (!attachment) {
        return jsonResponse({ code: 'TICKET_ATTACHMENT_NOT_FOUND', message: '附件不存在' }, 404)
      }
      return new Response('mock attachment content', {
        status: 200,
        headers: { 'Content-Type': attachment.content_type },
      })
    },
  },
  {
    method: 'GET',
    path: '/ticket',
    note: '我的工单分页，支持 status / page / page_size',
    handler: (request) =>
      jsonResponse(
        listMockTickets({
          status: readString(request.query, 'status') || undefined,
          page: readInt(request.query, 'page', 1),
          page_size: readInt(request.query, 'page_size', 20),
        }),
      ),
  },
  {
    method: 'POST',
    path: '/ticket',
    note: '创建工单',
    handler: (request) => {
      const body = asRecord(request.body)
      const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      if (!subject || !content) {
        return invalid('请填写工单标题与问题描述')
      }
      const ticket = createMockTicket({
        subject,
        content,
        category: typeof body.category === 'string' ? body.category : null,
        priority: typeof body.priority === 'string' ? body.priority : null,
        attachment_ids: readAttachmentIds(body.attachment_ids),
      })
      return jsonResponse(toTicketResponse(ticket))
    },
  },
  {
    method: 'GET',
    path: '/ticket/:ticket_id',
    note: '工单详情：ticket / messages / events / actions',
    handler: (_request, params) => {
      const ticket = findMockTicket(params.ticket_id ?? '')
      return ticket ? jsonResponse(toTicketDetail(ticket)) : notFound()
    },
  },
  {
    method: 'POST',
    path: '/ticket/:ticket_id/messages',
    note: '回复工单；resolved/closed 7 天内自动重开，超期 409',
    handler: (request, params) => {
      const ticket = findMockTicket(params.ticket_id ?? '')
      if (!ticket) return notFound()
      const body = asRecord(request.body)
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      const attachmentIds = readAttachmentIds(body.attachment_ids)
      if (!content && attachmentIds.length === 0) {
        return invalid('请输入回复内容')
      }
      const result = appendMockUserMessage(ticket, { content, attachment_ids: attachmentIds })
      if (result === 'expired') return expired()
      return jsonResponse(toTicketDetail(result))
    },
  },
  {
    method: 'PATCH',
    path: '/ticket/:ticket_id/close',
    note: '关闭工单',
    handler: (_request, params) => {
      const ticket = findMockTicket(params.ticket_id ?? '')
      if (!ticket) return notFound()
      return jsonResponse(toTicketResponse(closeMockTicket(ticket)))
    },
  },
  {
    method: 'PATCH',
    path: '/ticket/:ticket_id/reopen',
    note: '重开工单；超过 7 天回 409',
    handler: (_request, params) => {
      const ticket = findMockTicket(params.ticket_id ?? '')
      if (!ticket) return notFound()
      const result = reopenMockTicket(ticket)
      if (result === 'expired') return expired()
      return jsonResponse(toTicketResponse(result))
    },
  },
  {
    method: 'PATCH',
    path: '/ticket/:ticket_id/read',
    note: '标记已读',
    handler: (_request, params) => {
      const ticket = findMockTicket(params.ticket_id ?? '')
      if (!ticket) return notFound()
      markMockRead(ticket)
      return new Response(null, { status: 204 })
    },
  },
  {
    method: 'POST',
    path: '/ticket/:ticket_id/satisfaction',
    note: '满意度评价（1-5 星，仅创建者、仅已解决/已关闭）',
    handler: (request, params) => {
      const ticket = findMockTicket(params.ticket_id ?? '')
      if (!ticket) return notFound()
      const body = asRecord(request.body)
      const rating = typeof body.rating === 'number' ? body.rating : 0
      const comment = typeof body.comment === 'string' ? body.comment : null
      if (!rateMockTicket(ticket, rating, comment)) {
        return invalid('当前状态不能评价')
      }
      return jsonResponse(toTicketResponse(ticket))
    },
  },
]

export const ticketRoutes = defineRouteTable('tickets', routes)
