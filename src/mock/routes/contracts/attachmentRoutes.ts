import type { MockRoute } from '../../router'

import { contracts, findRequirement } from '../../db'
import { errorResponse, jsonResponse, textResponse } from '../../response'
import {
  attachmentOverlay,
  contractById,
  developerAgreement,
  nowText,
  saveAttachment,
  signingInitiatedContracts,
  withAttachment,
} from './helpers'

export const contractAttachmentRoutes: MockRoute[] = [
  /* ------------------------------- R012 自定义合同附件（上传 / 拟定 / 撤回 / 下载） */
  {
    method: 'POST',
    path: '/contracts/requirement/:requirementId/attachment',
    note: '上传自定义合同附件：mock 读不到 multipart 字节，只伪造一份文件信息',
    handler: (request, params) =>
      saveAttachment(
        request,
        params.requirementId ?? '',
        'uploaded_file',
        'mock 上传的合同附件.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
  },
  {
    method: 'POST',
    path: '/contracts/requirement/:requirementId/attachment/draft',
    note: '页面内拟定条款生成附件；金额必须等于需求单预算（与后端同口径）',
    handler: (request, params) => {
      const requirementId = params.requirementId ?? ''
      const body = (request.body ?? {}) as { title?: string; amount?: number }
      const budget = findRequirement(requirementId)?.budget ?? 0
      const amount = Number(body.amount ?? 0)

      if (!Number.isFinite(amount) || amount <= 0) {
        return errorResponse(400, '拟定金额必须大于 0，且与需求单预算一致')
      }
      if (budget > 0 && Math.abs(amount - budget) > 0.001) {
        return errorResponse(400, `拟定金额必须等于需求单预算 ¥${budget.toFixed(2)}`)
      }

      const title = (body.title ?? '').trim() || '合同附件'
      return saveAttachment(
        request,
        requirementId,
        'drafted_terms',
        `${title}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    },
  },
  {
    method: 'DELETE',
    path: '/contracts/:contractId/attachment',
    note: '撤回自定义合同附件（仅在未发起签署时允许）',
    handler: (_request, params) => {
      const contract = contractById(params.contractId)
      if (!contract) {
        return textResponse('合同不存在', 404)
      }
      if (signingInitiatedContracts.has(contract.id)) {
        return errorResponse(409, '已发起签署，需作废重签')
      }
      attachmentOverlay.delete(contract.id)
      return jsonResponse(withAttachment(contract))
    },
  },
  {
    method: 'GET',
    path: '/contracts/:contractId/attachment',
    note: '下载附件原件：mock 返回占位文本（鉴权下载与 /uploads 排除以后端为准）',
    handler: (_request, params) => {
      const contract = contractById(params.contractId)
      const item = contract ? attachmentOverlay.get(contract.id) : undefined
      return textResponse(`mock 附件占位内容：${item?.attachment_file_name ?? '无附件'}`)
    },
  },
  {
    method: 'GET',
    path: '/contracts/attachment/blank-template',
    note: '下载空白合同模板：mock 返回占位文本',
    handler: () => textResponse('mock 空白合同模板占位内容'),
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/attachment/review',
    note: '附件审核（mock 专用，方便本地走查三态；真实审核在管理端，见任务-03）',
    handler: (request, params) => {
      const contract = contractById(params.contractId)
      const item = contract ? attachmentOverlay.get(contract.id) : undefined
      if (!contract || !item) {
        return errorResponse(409, '该合同没有可审核的附件')
      }

      const body = (request.body ?? {}) as { decision?: string; note?: string }
      const decision = body.decision === 'rejected' ? 'rejected' : 'approved'
      item.attachment_review_status = decision
      item.attachment_reviewed_by = 'admin'
      item.attachment_reviewed_at = nowText()
      item.attachment_review_note = (body.note ?? '').trim() || null
      // 放行是「对某个具体版本」放行的：记下当前指纹，换过文件就不再匹配（与后端同口径）。
      item.attachment_approved_sha256 = decision === 'approved' ? item.attachment_file_sha256 : null

      return jsonResponse(withAttachment(contract))
    },
  },
  {
    method: 'GET',
    path: '/contracts/developer-agreement',
    note: '开发者入驻协议',
    handler: () => jsonResponse(developerAgreement()),
  },
]
