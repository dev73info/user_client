import type { RequirementItem } from '@/api/requirements'

/**
 * 合同有效期届满后的「超期锁定 / 已清除」展示口径（R014）。
 *
 * 后端把「担保需求合同有效期过期 → 锁定 30 天 → 清除」做成了访问触发的收口，
 * 结果通过需求单的 `archive_*` 字段透出：
 *   - `archive_locked_at`        首次进入锁定态的时刻；非空即已锁定（幂等，不推后）
 *   - `archive_lock_expires_at`  锁定到期时刻 = 锁定时刻 + 平台配置的锁定期天数
 *   - `archive_cleared_at`       内容被清除的时刻；非空即「已清除」终态（优先于锁定态）
 *   - `archive_can_claim_resource` 锁定期内是否该引导「转为我的资源」
 *
 * 这里只做**纯展示判定**（状态归类、文案、剩余天数），判定真值全在后端；
 * 页面据此给横幅、保留 / 隐藏下载入口、置灰写操作。放在 shared 里是为了能单测。
 */

/** 需求是否已被「管理」过（进入锁定 / 清除态）。 */
type ArchiveLike = Pick<
  RequirementItem,
  | 'archive_locked_at'
  | 'archive_lock_expires_at'
  | 'archive_cleared_at'
  | 'archive_can_claim_resource'
>

/**
 * 归档态三档：
 * - `active` 正常（未锁定、未清除）；
 * - `locked` 已进入 30 天资料保留期（只读 + 可下载）；
 * - `cleared` 保留期已满、内容已清除（下载入口不再渲染）。
 *
 * 清除是终态：同时有锁定与清除标记时归 `cleared`。
 */
export type RequirementArchiveState = 'active' | 'locked' | 'cleared'

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function requirementArchiveState(item: ArchiveLike): RequirementArchiveState {
  if (hasText(item.archive_cleared_at)) {
    return 'cleared'
  }
  if (hasText(item.archive_locked_at)) {
    return 'locked'
  }
  return 'active'
}

export function isRequirementLocked(item: ArchiveLike): boolean {
  return requirementArchiveState(item) === 'locked'
}

export function isRequirementCleared(item: ArchiveLike): boolean {
  return requirementArchiveState(item) === 'cleared'
}

/** 锁定或已清除都算「归档中」：写操作一律被后端拒绝，页面要置灰。 */
export function isRequirementArchived(item: ArchiveLike): boolean {
  return requirementArchiveState(item) !== 'active'
}

/**
 * 锁定期剩余天数（向上取整）：`archive_lock_expires_at` 与当前时间的差。
 *
 * 未锁定 / 已清除 / 时间解析不出时返回 `null`，调用方不显示剩余天数即可。
 * `now` 便于单测注入固定时刻。
 */
export function requirementLockRemainingDays(item: ArchiveLike, now: number = Date.now()): number | null {
  if (!isRequirementLocked(item) || !hasText(item.archive_lock_expires_at)) {
    return null
  }
  const expiresAt = new Date(item.archive_lock_expires_at as string).getTime()
  if (Number.isNaN(expiresAt)) {
    return null
  }
  const remainingMs = expiresAt - now
  if (remainingMs <= 0) {
    // 已到点但后端还没在这条响应上收口（下次访问才清除）：按 0 天展示。
    return 0
  }
  return Math.ceil(remainingMs / 86_400_000)
}

/** 开发周期文案：有值写「N 天」，未填返回空串（由调用方决定不渲染）。 */
export function developmentCycleLabel(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) {
    return ''
  }
  return `${days} 天`
}

/** 锁定期内统一的「只读」提示：与后端 409 的中文口径一致。 */
export const ARCHIVED_WRITE_BLOCKED_MESSAGE =
  '合同有效期已届满，已进入锁定 / 已清除阶段：锁定期内只能下载资料，不能修改或发起新的动作'

/**
 * 归档横幅文案。
 *
 * - 锁定：说明「有效期已过、进入保留期、到期后清除、期间可下载不可修改」，带上剩余天数；
 * - 清除：说明「保留期已满、资料已清除」，并讲清审计台账（合同编号 / 金额）仍在；
 * - 正常：空串。
 */
export function requirementArchiveBanner(
  item: ArchiveLike,
  now: number = Date.now(),
): { state: RequirementArchiveState; title: string; description: string } {
  const state = requirementArchiveState(item)

  if (state === 'cleared') {
    return {
      state,
      title: '资料已清除',
      description:
        '合同有效期已过且 30 天资料保留期已满，平台已按规则清除合同正文、存证、发票文件与会话附件；' +
        '合同编号、签署状态与发票金额台账仍保留，可用于对账。',
    }
  }

  if (state === 'locked') {
    const remaining = requirementLockRemainingDays(item, now)
    const remainingText = remaining == null ? '' : `，约剩 ${remaining} 天`
    return {
      state,
      title: '已进入超期锁定（资料保留期）',
      description:
        `合同有效期已过，需求进入 30 天资料保留期${remainingText}。` +
        '锁定期内双方仍可下载合同、存证、发票与会话附件，但不能发消息、传附件、验收、请求尾款或编辑需求单；' +
        '保留期届满后平台将清除资料。',
    }
  }

  return { state, title: '', description: '' }
}

/**
 * 锁定期内是否该显示「转为我的资源」引导入口。
 *
 * 后端已把前置（锁定未清除 + 已结单 + 有交付资源 + 未转换）算成 `archive_can_claim_resource`，
 * 前端不重复推导；这里只兜一层「确实处在锁定态」，避免字段缺省时误显示。
 */
export function canClaimResourceWhileLocked(item: ArchiveLike): boolean {
  return isRequirementLocked(item) && item.archive_can_claim_resource === true
}

/* ------------------------------------------------------------------ 开发周期（天）输入 */

/**
 * 校验「开发周期（天）」输入，返回可直接 toast 的中文文案（空串表示通过）。
 *
 * 只做**前端能负责的两件事**：担保需求必填、正整数（不得为 0 / 负数）。
 * 平台配置的「最短天数下限」不在前端写死——后端会按配置校验并返回中文提示
 * （`开发周期不能少于平台配置的最短天数`），前端原样展示，避免两处数字漂移。
 */
export function validateDevelopmentCycleInput(
  raw: unknown,
  paymentMode: string,
): string {
  if (paymentMode !== 'platform_guarantee') {
    return ''
  }
  const text = String(raw ?? '').trim()
  if (!text) {
    return '担保需求必须填写开发周期（天）'
  }
  if (!/^\d+$/.test(text)) {
    return '开发周期（天）必须是正整数'
  }
  if (Number(text) < 1) {
    return '开发周期（天）必须大于 0'
  }
  return ''
}

/**
 * 把「开发周期」输入归一化成提交值：担保需求给正整数，其余（含无担保）给 `undefined`。
 *
 * 调用前应先跑 {@link validateDevelopmentCycleInput}；这里对非法输入返回 `undefined`，
 * 由后端兜最后的校验与中文提示。
 */
export function normalizeDevelopmentCycle(
  raw: unknown,
  paymentMode: string,
): number | undefined {
  if (paymentMode !== 'platform_guarantee') {
    return undefined
  }
  const text = String(raw ?? '').trim()
  if (!/^\d+$/.test(text)) {
    return undefined
  }
  const value = Number(text)
  return value > 0 ? value : undefined
}
