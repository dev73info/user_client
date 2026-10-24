import type { RequirementItem } from '@/api/requirements'

import { REQUIREMENT_SEEDS, type RequirementSeed } from './requirementSeeds'
import { CLIENT_USERNAME, datetime } from './shared'

/**
 * mock 内部记账用的需求行：在契约 `RequirementItem` 之上多一个 `updated_at`。
 *
 * mock 的种子数据要按「最近动过」排序、会话要按「需求最近活跃」兜底，这些都需要一个本地时间戳；
 * 但契约 `RequirementResponse` **没有** `updated_at`（后端 DTO 就没有这一列），
 * 所以它只活在 mock 内部，不随任何响应下发——下发出去就成了假字段。
 */
export type MockRequirementRow = RequirementItem & { updated_at: string }

function buildRequirement(seed: RequirementSeed): MockRequirementRow {
  return {
    id: seed.id,
    requirement_id: seed.code,
    subscribe_status_change: false,
    bound_resource_id: seed.resourceId,
    bound_resource_version_count: seed.resourceId ? 3 : null,
    resource_visibility: seed.resourceId ? 'public' : null,
    created_time: datetime(-seed.createdDaysAgo, 10, 0),
    creator: CLIENT_USERNAME,
    title: seed.title,
    description: seed.description,
    acceptance_criteria: seed.acceptance,
    review_note: seed.reviewNote ?? null,
    status: seed.status,
    budget: seed.budget,
    payment_mode: seed.mode,
    updated_at: datetime(-seed.updatedDaysAgo, 15, 30),
    developer: seed.developer,
    pending_resource_version_delete_requests: seed.pendingVersionDelete
      ? [
          {
            version_id: seed.pendingVersionDelete.versionId,
            version: seed.pendingVersionDelete.version,
            requested_at: datetime(-seed.pendingVersionDelete.daysAgo, 10, 30),
          },
        ]
      : null,
    resource_version_delete_request_status: seed.pendingVersionDelete ? 'pending' : null,
    settlement_available_at: seed.status === 'pending_settlement' ? datetime(7, 12, 0) : null,
  }
}

export const requirements: MockRequirementRow[] = REQUIREMENT_SEEDS.map(buildRequirement)

export function seedOf(code: string): RequirementSeed | undefined {
  return REQUIREMENT_SEEDS.find((item) => item.code === code)
}

export function findRequirement(code: string): MockRequirementRow | undefined {
  return requirements.find((item) => item.requirement_id === code)
}

export function seedOfRequirement(code: string): RequirementSeed | undefined {
  return seedOf(code)
}

/** 平台分成比例（默认 20%，与后端一致），定金 = 总价 × 该比例。 */
export const PLATFORM_DEPOSIT_PERCENT = 20

export function depositAmountOf(requirement: RequirementItem): number {
  return Math.round(((requirement.budget ?? 0) * PLATFORM_DEPOSIT_PERCENT) / 100)
}

export function finalAmountOf(requirement: RequirementItem): number {
  return Math.max((requirement.budget ?? 0) - depositAmountOf(requirement), 0)
}
