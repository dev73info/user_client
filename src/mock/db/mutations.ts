import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { RequirementItem, RequirementPaymentMode } from '@/api/requirements'
import type { DevWithdrawalRecord } from '@/api/devWallet'
import { CONTRACT_STATUS } from '@/shared/contracts'

import { buildContract, contractOfRequirement, contracts } from './contracts'
import type { MockPayment } from './payments'
import { REQUIREMENT_SEEDS } from './requirementSeeds'
import { findRequirement, requirements, seedOf } from './requirements'
import { mcResourceVersions, mcResources, versionsOf } from './resources'
import { devWithdrawals } from './devWallet'
import { CLIENT_USERNAME, DEV_USERNAME, datetime, iso } from './shared'

/* ------------------------------------------------------------------ 变更操作 */

let nextRequirementId = 100
let nextResourceId = 9100
let nextVersionId = 100

/** 客户发布需求：直接进入「平台审核中」。 */
export function createRequirementRecord(payload: {
  title: string
  description: string
  budget: number
  acceptance_criteria: string
  payment_mode: RequirementPaymentMode
}): RequirementItem {
  nextRequirementId += 1
  const code = `REQ-MOCK-${nextRequirementId}`

  const item: RequirementItem = {
    id: nextRequirementId,
    requirement_id: code,
    subscribe_status_change: false,
    bound_resource_id: null,
    bound_resource_version_count: null,
    resource_visibility: null,
    created_time: datetime(0, 10, 0),
    creator: CLIENT_USERNAME,
    title: payload.title,
    description: payload.description,
    acceptance_criteria: payload.acceptance_criteria,
    review_note: null,
    status: 'pending_review',
    budget: payload.budget,
    payment_mode: payload.payment_mode,
    updated_at: datetime(0, 10, 0),
    developer: null,
    settlement_available_at: null,
  }

  REQUIREMENT_SEEDS.push({
    id: item.id,
    code,
    title: payload.title,
    description: payload.description,
    acceptance: payload.acceptance_criteria,
    budget: payload.budget,
    mode: payload.payment_mode,
    status: 'pending_review',
    developer: null,
    resourceId: null,
    createdDaysAgo: 0,
    updatedDaysAgo: 0,
    depositPaid: false,
    finalPaid: false,
  })
  requirements.unshift(item)

  return item
}

/** 开发者接单：绑定资源后需求进入待付定金，并自动生成一份待签合同。 */
export function bindRequirementRecord(code: string, resourceId: number): RequirementItem | null {
  const requirement = findRequirement(code)
  if (!requirement) {
    return null
  }

  requirement.developer = DEV_USERNAME
  requirement.bound_resource_id = resourceId
  requirement.bound_resource_version_count = versionsOf(resourceId).length
  requirement.resource_visibility = 'public'
  requirement.updated_at = datetime(0, 12, 0)

  const seed = seedOf(code)
  if (seed) {
    seed.developer = DEV_USERNAME
    seed.resourceId = resourceId
    seed.updatedDaysAgo = 0
  }

  if (!contractOfRequirement(code) && requirement.payment_mode === 'platform_guarantee' && seed) {
    contracts.push(buildContract(seed, CONTRACT_STATUS.signing, false, false))
  }

  return requirement
}

/** 新增资源。 */
export function createResourceRecord(payload: {
  title: string
  author: string
  description: string
  platform: string
  file_name: string
  source_url: string
  requirement_id: string | null
  visibility: McResourcePayload['visibility']
  /** R029：推广分成比例（万分比），不传按 0 */
  promo_share_bps?: number
}): McResourcePayload {
  nextResourceId += 1

  const resource: McResourcePayload = {
    id: nextResourceId,
    creator: DEV_USERNAME,
    ownership_type: 'individual',
    team_id: null,
    requirement_id: payload.requirement_id,
    platform: payload.platform,
    title: payload.title,
    author: payload.author,
    description: payload.description,
    tag_selections: [],
    file_name: payload.file_name,
    source_url: payload.source_url,
    cover_url: null,
    docs_url: null,
    visibility: payload.visibility,
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    copyright_declared_at: null,
    purchased_by_me: false,
    created_at: iso(0, 10, 0),
    updated_at: iso(0, 10, 0),
    promo_share_bps: Number(payload.promo_share_bps ?? 0),
  }

  mcResources.unshift(resource)
  return resource
}

/** 新增资源版本，同时同步需求单上的版本数。 */
export function createVersionRecord(
  resourceId: number,
  version: string,
  note: string | null,
): McResourceVersionPayload | null {
  const resource = mcResources.find((item) => item.id === resourceId)
  if (!resource) {
    return null
  }

  nextVersionId += 1

  const record: McResourceVersionPayload = {
    id: nextVersionId,
    resource_id: resourceId,
    version,
    resource: `resource-${resourceId}-${version}.zip`,
    note,
    creator: DEV_USERNAME,
    created_at: datetime(0, 11, 0),
  }

  mcResourceVersions.push(record)
  resource.updated_at = iso(0, 11, 0)

  for (const requirement of requirements) {
    if (requirement.bound_resource_id === resourceId) {
      requirement.bound_resource_version_count = versionsOf(resourceId).length
    }
  }

  return record
}

/** 支付成功：推进支付单与需求状态。 */
export function markPaymentPaid(payment: MockPayment): { requirement_status: string } {
  payment.status = 'paid'
  payment.paid_at = datetime(0, 10, 30)

  const requirement = findRequirement(payment.requirement_id)
  const seed = seedOf(payment.requirement_id)

  if (!requirement || !seed) {
    return { requirement_status: requirement?.status ?? '' }
  }

  if (payment.kind === 'deposit') {
    seed.depositPaid = true
    if (requirement.status === 'pending_deposit') {
      requirement.status = 'deposit_paid'
      seed.status = 'deposit_paid'
    }
  } else {
    seed.finalPaid = true
    requirement.status = 'pending_settlement'
    seed.status = 'pending_settlement'
    requirement.settlement_available_at = datetime(7, 12, 0)
  }

  requirement.updated_at = datetime(0, 10, 30)

  return { requirement_status: requirement.status }
}

export function withdrawRecords(): DevWithdrawalRecord[] {
  return devWithdrawals
}
