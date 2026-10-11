import { describe, expect, it } from 'vitest'

import {
  ARCHIVED_WRITE_BLOCKED_MESSAGE,
  canClaimResourceWhileLocked,
  developmentCycleLabel,
  isRequirementArchived,
  isRequirementCleared,
  isRequirementLocked,
  normalizeDevelopmentCycle,
  requirementArchiveBanner,
  requirementArchiveState,
  requirementLockRemainingDays,
  validateDevelopmentCycleInput,
  type RequirementArchiveState,
} from '@/shared/requirementArchive'

/* R014：合同有效期届满后的「超期锁定 / 已清除」是后端按访问触发的收口，前端只做展示判定。
   这里覆盖三档状态归类、剩余天数、横幅文案（锁定 / 清除）、转换引导，以及「开发周期（天）」
   的输入校验与归一化——校验只保证前端能负责的两件事（担保需求必填、正整数），
   平台配置的最短下限由后端校验并回中文提示，前端不写死数字。 */

type ArchiveFields = {
  archive_locked_at?: string | null
  archive_lock_expires_at?: string | null
  archive_cleared_at?: string | null
  archive_can_claim_resource?: boolean | null
}

/** 只给归档相关的字段：被判定函数 Pick 出来的就是这几列。 */
function archive(fields: ArchiveFields = {}) {
  return {
    archive_locked_at: null as string | null,
    archive_lock_expires_at: null as string | null,
    archive_cleared_at: null as string | null,
    archive_can_claim_resource: false as boolean | null,
    ...fields,
  }
}

const LOCKED_AT = '2026-10-11T19:24:07'
const EXPIRES_AT = '2026-11-10T19:24:07'
const LOCKED = archive({ archive_locked_at: LOCKED_AT, archive_lock_expires_at: EXPIRES_AT })

describe('R014 归档态：三档归类', () => {
  it('无任何标记为正常态', () => {
    expect(requirementArchiveState(archive())).toBe<RequirementArchiveState>('active')
    expect(isRequirementLocked(archive())).toBe(false)
    expect(isRequirementCleared(archive())).toBe(false)
    expect(isRequirementArchived(archive())).toBe(false)
  })

  it('有锁定时间为锁定态：只读 + 可下载', () => {
    expect(requirementArchiveState(LOCKED)).toBe<RequirementArchiveState>('locked')
    expect(isRequirementLocked(LOCKED)).toBe(true)
    expect(isRequirementArchived(LOCKED)).toBe(true)
  })

  it('锁定与清除标记并存时归「已清除」（清除是终态）', () => {
    const cleared = archive({
      archive_locked_at: LOCKED_AT,
      archive_lock_expires_at: EXPIRES_AT,
      archive_cleared_at: '2026-12-11T00:00:00',
    })
    expect(requirementArchiveState(cleared)).toBe<RequirementArchiveState>('cleared')
    expect(isRequirementCleared(cleared)).toBe(true)
    expect(isRequirementLocked(cleared)).toBe(false)
    expect(isRequirementArchived(cleared)).toBe(true)
  })

  it('空字符串不算标记（旧数据 / 旧后端把空串当未归档）', () => {
    expect(requirementArchiveState(archive({ archive_locked_at: '   ' }))).toBe<RequirementArchiveState>('active')
    expect(requirementArchiveState(archive({ archive_cleared_at: '' }))).toBe<RequirementArchiveState>('active')
  })
})

describe('R014 锁定期剩余天数', () => {
  const now = new Date('2026-11-09T19:24:07').getTime() // 距到期 1 天

  it('按向上取整给剩余天数', () => {
    expect(requirementLockRemainingDays(LOCKED, now)).toBe(1)
  })

  it('未锁定 / 已清除不报剩余天数', () => {
    expect(requirementLockRemainingDays(archive(), now)).toBeNull()
    expect(
      requirementLockRemainingDays(
        archive({ archive_locked_at: LOCKED_AT, archive_cleared_at: '2026-12-11T00:00:00' }),
        now,
      ),
    ).toBeNull()
  })

  it('锁定但缺到期时间 / 时间解析不出时返回 null（不显示剩余天数）', () => {
    expect(requirementLockRemainingDays(archive({ archive_locked_at: LOCKED_AT }), now)).toBeNull()
    expect(
      requirementLockRemainingDays(
        archive({ archive_locked_at: LOCKED_AT, archive_lock_expires_at: 'not-a-date' }),
        now,
      ),
    ).toBeNull()
  })

  it('已到点但后端尚未在本次响应收口时按 0 天展示', () => {
    const after = new Date('2026-11-20T00:00:00').getTime()
    expect(requirementLockRemainingDays(LOCKED, after)).toBe(0)
  })
})

describe('R014 开发周期（天）文案', () => {
  it('有值写「N 天」，未填 / 非法返回空串', () => {
    expect(developmentCycleLabel(30)).toBe('30 天')
    expect(developmentCycleLabel(1)).toBe('1 天')
    expect(developmentCycleLabel(null)).toBe('')
    expect(developmentCycleLabel(undefined)).toBe('')
    expect(developmentCycleLabel(Number.NaN)).toBe('')
  })
})

describe('R014 归档横幅文案', () => {
  it('正常态不渲染横幅（title 为空串）', () => {
    expect(requirementArchiveBanner(archive()).title).toBe('')
    expect(requirementArchiveBanner(archive()).description).toBe('')
  })

  it('锁定态给「超期锁定（资料保留期）」标题、剩余天数与「可下载不可写」说明', () => {
    const banner = requirementArchiveBanner(LOCKED, new Date('2026-11-09T19:24:07').getTime())
    expect(banner.state).toBe<RequirementArchiveState>('locked')
    expect(banner.title).toBe('已进入超期锁定（资料保留期）')
    expect(banner.description).toContain('合同有效期已过')
    expect(banner.description).toContain('约剩 1 天')
    expect(banner.description).toContain('仍可下载')
    expect(banner.description).toContain('保留期届满后平台将清除资料')
  })

  it('清除态给「资料已清除」，并交代审计台账仍在', () => {
    const banner = requirementArchiveBanner(
      archive({ archive_locked_at: LOCKED_AT, archive_cleared_at: '2026-12-11T00:00:00' }),
    )
    expect(banner.state).toBe<RequirementArchiveState>('cleared')
    expect(banner.title).toBe('资料已清除')
    expect(banner.description).toContain('资料保留期已满')
    expect(banner.description).toContain('合同编号')
    expect(banner.description).toContain('发票金额台账仍保留')
  })

  it('只读拦截文案与后端 409 的中文口径一致', () => {
    expect(ARCHIVED_WRITE_BLOCKED_MESSAGE).toContain('合同有效期已届满')
    expect(ARCHIVED_WRITE_BLOCKED_MESSAGE).toContain('只能下载资料')
  })
})

describe('R014 锁定期内的转换引导', () => {
  it('锁定态 + 后端允许转换时才显示引导', () => {
    expect(canClaimResourceWhileLocked(archive({ ...LOCKED, archive_can_claim_resource: true }))).toBe(true)
    expect(canClaimResourceWhileLocked(archive({ ...LOCKED, archive_can_claim_resource: false }))).toBe(false)
  })

  it('未锁定 / 已清除不显示引导（引导只在保留期内）', () => {
    expect(canClaimResourceWhileLocked(archive({ archive_can_claim_resource: true }))).toBe(false)
    expect(
      canClaimResourceWhileLocked(
        archive({ archive_locked_at: LOCKED_AT, archive_cleared_at: '2026-12-11T00:00:00', archive_can_claim_resource: true }),
      ),
    ).toBe(false)
  })
})

describe('R014 开发周期输入校验与归一化', () => {
  it('担保需求必填：空值被拦，提示可直接 toast', () => {
    expect(validateDevelopmentCycleInput('', 'platform_guarantee')).toBe('担保需求必须填写开发周期（天）')
    expect(validateDevelopmentCycleInput('   ', 'platform_guarantee')).toBe('担保需求必须填写开发周期（天）')
  })

  it('必须是正整数：非数字 / 0 / 负数被拦', () => {
    expect(validateDevelopmentCycleInput('abc', 'platform_guarantee')).toBe('开发周期（天）必须是正整数')
    expect(validateDevelopmentCycleInput('3.5', 'platform_guarantee')).toBe('开发周期（天）必须是正整数')
    expect(validateDevelopmentCycleInput('0', 'platform_guarantee')).toBe('开发周期（天）必须大于 0')
    expect(validateDevelopmentCycleInput('-1', 'platform_guarantee')).toBe('开发周期（天）必须是正整数')
  })

  it('不写死平台下限：低于配置下限的值在前端放行，交由后端返回中文提示', () => {
    // 平台配置的最短天数会更高（例如 7 天），前端只保证「正整数」，故 `1` 必须放行，
    // 让后端的「不能少于平台配置的最短天数」成为唯一提示来源，避免两处数字漂移。
    expect(validateDevelopmentCycleInput('1', 'platform_guarantee')).toBe('')
    expect(validateDevelopmentCycleInput('30', 'platform_guarantee')).toBe('')
  })

  it('无担保需求不校验、不显示该字段（返回空串即通过）', () => {
    expect(validateDevelopmentCycleInput('', 'self_managed')).toBe('')
    expect(validateDevelopmentCycleInput('abc', 'self_managed')).toBe('')
  })

  it('归一化：担保需求给正整数，其余（含无担保 / 非法）给 undefined', () => {
    expect(normalizeDevelopmentCycle('30', 'platform_guarantee')).toBe(30)
    expect(normalizeDevelopmentCycle(7, 'platform_guarantee')).toBe(7)
    expect(normalizeDevelopmentCycle('0', 'platform_guarantee')).toBeUndefined()
    expect(normalizeDevelopmentCycle('abc', 'platform_guarantee')).toBeUndefined()
    expect(normalizeDevelopmentCycle('', 'platform_guarantee')).toBeUndefined()
    expect(normalizeDevelopmentCycle('30', 'self_managed')).toBeUndefined()
  })
})
