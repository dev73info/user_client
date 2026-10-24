import type { RequirementItem } from '@/api/requirements'
import type { PublicMcResourceVersionItem } from '@/api/resources'
import type { ContractSigningStatus } from '@/shared/contracts'
import type { RequirementRowFacts } from '@/shared/requirementRowRules'

/* 需求行判定的夹具工厂：两个 spec（行内判定 / 主操作分组）共用一份，
   免得同一份合同状态常量与需求行形状各抄一遍、改字段时漏改一处。 */

export const SIGNED: ContractSigningStatus = {
  has_contract: true,
  party_a_signed: true,
  party_b_signed: true,
}

// party_a 是需求方（本页用户），「只签了一方」的两档在状态文案上都是「待签合同」
export const AWAITING_B: ContractSigningStatus = {
  has_contract: true,
  party_a_signed: true,
  party_b_signed: false,
}

export const NO_CONTRACT: ContractSigningStatus = {
  has_contract: false,
  party_a_signed: false,
  party_b_signed: false,
}

export function version(no: string, id = 1): PublicMcResourceVersionItem {
  return {
    id,
    resource_id: 48,
    version: no,
    resource: `https://cdn.example.com/${no}.zip`,
    note: null,
    creator: 'dev',
    created_at: '2026-10-09 10:00:00',
    is_current: true,
    price_fen: 0,
    purchasable: false,
  }
}

export function requirement(part: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 1,
    requirement_id: '2026-1',
    created_time: '2026-10-09 10:00:00',
    creator: 'customer',
    subscribe_status_change: false,
    title: '需求单',
    payment_mode: 'platform_guarantee',
    status: 'pending_deposit',
    bound_resource_id: 48,
    ...part,
  }
}

export function facts(part: Partial<RequirementRowFacts> = {}): RequirementRowFacts {
  return { contract: null, ...part }
}
