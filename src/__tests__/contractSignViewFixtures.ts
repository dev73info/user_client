import { createMemoryHistory, createRouter } from 'vue-router'

import type { ContractDetail } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'
import { CONTRACT_STATUS } from '@/shared/contracts'

export const SIGN_URL = 'https://asign.example/sign/HT-2026-0001'

export function contractDetail(patch: Partial<ContractDetail> = {}): ContractDetail {
  return {
    id: 88,
    contract_no: 'HT-2026-0001',
    title: '需求开发合同',
    content: '第一条 服务内容……',
    content_sha256: 'sha256-of-contract-content',
    status: CONTRACT_STATUS.signing,
    party_a_name: '需求方甲',
    party_a_username: 'alice',
    party_a_real_name: '张三',
    party_a_id_card_no_masked: '110***********1234',
    party_a_signed_at: null,
    party_b_name: '开发者乙',
    party_b_username: 'bob',
    party_b_real_name: '李四',
    party_b_id_card_no_masked: '310***********5678',
    party_b_signed_at: null,
    party_c_name: '',
    created_at: '2026-10-20 10:00:00',
    requirement_id: 'REQ-1',
    content_source: 'platform',
    attachment_review_status: 'none',
    effective_until: null,
    development_cycle_days: null,
    signing_logs: [
      {
        id: 1,
        contract_id: 88,
        contract_no: 'HT-2026-0001',
        contract_title: '需求开发合同',
        action: 'created',
        operator: 'system',
        created_at: '2026-10-20 10:00:00',
      },
    ],
    ...patch,
  }
}

export function requirementDetail(): RequirementItem {
  return {
    id: 1,
    requirement_id: 'REQ-1',
    title: '数据清洗插件定制',
    status: 'in_development',
    archive_locked_at: null,
    archive_lock_expires_at: null,
    archive_cleared_at: null,
    archive_can_claim_resource: false,
  } as unknown as RequirementItem
}

export function createContractSignRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'contract-sign', path: '/contract-sign', component: { template: '<div />' } },
      {
        name: 'workbench-signature-detail',
        path: '/workbench/signatures/:contractId',
        component: { template: '<div />' },
      },
      { name: 'workbench', path: '/workbench', component: { template: '<div />' } },
      {
        name: 'workbench-requirements',
        path: '/workbench/requirements',
        component: { template: '<div />' },
      },
      {
        name: 'workbench-signatures',
        path: '/workbench/signatures',
        component: { template: '<div />' },
      },
      {
        name: 'workbench-realname',
        path: '/workbench/realname',
        component: { template: '<div />' },
      },
    ],
  })
}
