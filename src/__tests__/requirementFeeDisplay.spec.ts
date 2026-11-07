import { describe, expect, it } from 'vitest'

import type { RequirementFeeTerms } from '@/api/requirementFee'
import {
  estimateResourceFeeFen,
  estimateResourceNetFen,
  feeLockNote,
  formatBpsPercent,
  formatFeeCny,
  requirementFeeLines,
  resourceExpectedNetLabel,
  resourceFeeHintText,
  stageDeveloperNetFen,
  stagePlatformFeeFen,
} from '@/shared/requirementFee'

const terms: RequirementFeeTerms = {
  requirement_id: 'REQ-1',
  platform_fee_bps: 500,
  personal_income_tax_bps: 0,
  total_fen: 10_000,
  deposit_fen: 1_000,
  deposit_ratio_bps: 1_000,
  platform_fee_fen: 500,
  tax_fen: 0,
  developer_net_fen: 9_500,
  deposit_platform_fee_fen: 50,
  deposit_tax_fen: 0,
  deposit_developer_net_fen: 950,
  final_platform_fee_fen: 450,
  final_tax_fen: 0,
  final_developer_net_fen: 8_550,
  customer_breach_platform_fee_bps: 2_000,
  customer_breach_tax_bps: 0,
  snapshot_at: '2026-11-08 10:00:00',
}

describe('requirementFee：格式化', () => {
  it('基点转百分比去掉多余的 0', () => {
    expect(formatBpsPercent(1_000)).toBe('10')
    expect(formatBpsPercent(450)).toBe('4.5')
    expect(formatBpsPercent(425)).toBe('4.25')
    expect(formatBpsPercent(0)).toBe('0')
  })

  it('分转元保留两位，负号在 ¥ 前面', () => {
    expect(formatFeeCny(9_500)).toBe('¥95.00')
    expect(formatFeeCny(-450)).toBe('-¥4.50')
  })
})

describe('requirementFee：合同签署页两视角', () => {
  it('需求方强调实付，并写明不额外收取', () => {
    const lines = requirementFeeLines(terms, 'customer')
    expect(lines[0]).toMatchObject({ label: '合同总额（您实付）', emphasis: true })
    expect(lines[1]?.label).toContain('不额外向您收取')
    expect(lines[2]).toMatchObject({ label: '开发者实收', value: '¥95.00' })
  })

  it('开发者强调到手，平台服务费与个税都是负数', () => {
    const lines = requirementFeeLines(terms, 'developer')
    expect(lines[1]).toMatchObject({ value: '-¥5.00' })
    expect(lines[3]).toMatchObject({ label: '到手', value: '¥95.00', emphasis: true })
  })

  it('锁定说明带快照时间', () => {
    expect(feeLockNote(terms)).toBe('费率已于 2026-11-08 10:00:00 锁定，后续调整不影响本单。')
    expect(feeLockNote({ ...terms, snapshot_at: '' })).toBe('费率已锁定，后续调整不影响本单。')
  })
})

describe('requirementFee：阶段取数', () => {
  it('定金与尾款各取各的快照', () => {
    expect(stagePlatformFeeFen(terms, 'deposit')).toBe(50)
    expect(stagePlatformFeeFen(terms, 'final')).toBe(450)
    expect(stageDeveloperNetFen(terms, 'deposit')).toBe(950)
    expect(stageDeveloperNetFen(terms, 'final')).toBe(8_550)
  })
})

describe('requirementFee：资源预计到手', () => {
  it('按整数分向下取整，与后端落单同口径', () => {
    expect(estimateResourceFeeFen(9_999, 500)).toBe(499)
    expect(estimateResourceNetFen(9_999, 500)).toBe(9_500)
    expect(estimateResourceFeeFen(100, 0)).toBe(0)
    expect(estimateResourceNetFen(100, 10_000)).toBe(0)
  })

  it('发布页提示：比例 + 买家价不变 + 预计到手', () => {
    expect(resourceFeeHintText(400, '¥96.00')).toBe(
      '平台抽成 4%（按成交价扣除），买家支付价不变，预计到手 ¥96.00',
    )
    expect(resourceFeeHintText(400)).toBe('平台抽成 4%（按成交价扣除），买家支付价不变')
  })

  it('定价文本优先现金价，其次积分价', () => {
    expect(resourceExpectedNetLabel('100', '0', 400)).toBe('¥96.00')
    expect(resourceExpectedNetLabel('', '100', 400)).toBe('96 积分')
    expect(resourceExpectedNetLabel('', '', 400)).toBe('')
  })
})
