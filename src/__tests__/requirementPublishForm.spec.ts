import { describe, expect, it } from 'vitest'

import {
  validateRequirementPublishForm,
  type RequirementPublishFormValues,
} from '@/shared/requirementPublishForm'

/**
 * 发布 / 重新编辑两个弹窗共用的纯校验层：这个页面没有挂载测试，这里就是唯一的回归网。
 *
 * 重点盯三件事：
 * 1. 报错顺序与拆分前逐条一致（标题 → 描述 → 预算非空 → 预算数值 → 验收标准 → 开发周期）；
 * 2. 提交载荷的归一化——标题去空白、富文本清洗后才落库、开发周期按付款模式给 `undefined`；
 * 3. 担保需求必填开发周期（R014）与无担保需求忽略它。
 */

function form(patch: Partial<RequirementPublishFormValues> = {}): RequirementPublishFormValues {
  return {
    title: '小程序订单页改版',
    description: '<p>需要重做订单列表与详情页，支持批量操作。</p>',
    budget: '3000',
    acceptance: '<p>订单列表可翻页，详情页字段齐全。</p>',
    paymentMode: 'self_managed',
    developmentCycleDays: '',
    ...patch,
  }
}

describe('validateRequirementPublishForm', () => {
  it('无担保需求：校验通过并归一化载荷', () => {
    const check = validateRequirementPublishForm(form())

    expect(check.ok).toBe(true)
    expect(check.ok && check.payload).toEqual({
      title: '小程序订单页改版',
      description: '<p>需要重做订单列表与详情页，支持批量操作。</p>',
      budget: 3000,
      acceptance_criteria: '<p>订单列表可翻页，详情页字段齐全。</p>',
      payment_mode: 'self_managed',
      development_cycle_days: undefined,
    })
  })

  it('标题去首尾空白后仍按「至少 4 个字符」判', () => {
    expect(validateRequirementPublishForm(form({ title: '  改版  ' }))).toEqual({
      ok: false,
      error: '需求标题至少 4 个字符',
    })
    expect(validateRequirementPublishForm(form({ title: '  订单改版  ' })).ok).toBe(true)
  })

  it('描述不足 10 个字符时报描述错', () => {
    expect(validateRequirementPublishForm(form({ description: '<p>太短了</p>' }))).toEqual({
      ok: false,
      error: '需求描述至少 10 个字符',
    })
  })

  it('预算为空 / 非数字 / 负数都走同一条文案', () => {
    const error = { ok: false, error: '预算必须是大于等于0的数字' }

    expect(validateRequirementPublishForm(form({ budget: '' }))).toEqual({
      ok: false,
      error: '预算不能为空',
    })
    expect(validateRequirementPublishForm(form({ budget: '   ' }))).toEqual({
      ok: false,
      error: '预算不能为空',
    })
    expect(validateRequirementPublishForm(form({ budget: 'abc' }))).toEqual(error)
    expect(validateRequirementPublishForm(form({ budget: '-1' }))).toEqual(error)
  })

  it('预算为 0 是合法值', () => {
    const check = validateRequirementPublishForm(form({ budget: '0' }))

    expect(check.ok && check.payload.budget).toBe(0)
  })

  it('验收标准不能为空', () => {
    expect(validateRequirementPublishForm(form({ acceptance: '<p>   </p>' }))).toEqual({
      ok: false,
      error: '验收标准不能为空',
    })
  })

  it('报错顺序：标题先于描述、描述先于预算（一次只报一条）', () => {
    const check = validateRequirementPublishForm(
      form({ title: '短', description: '<p>短</p>', budget: '' }),
    )

    expect(check).toEqual({ ok: false, error: '需求标题至少 4 个字符' })
  })

  it('担保需求必填开发周期，且必须是正整数', () => {
    expect(
      validateRequirementPublishForm(
        form({ paymentMode: 'platform_guarantee', developmentCycleDays: '' }),
      ),
    ).toEqual({ ok: false, error: '担保需求必须填写开发周期（天）' })

    expect(
      validateRequirementPublishForm(
        form({ paymentMode: 'platform_guarantee', developmentCycleDays: '7.5' }),
      ),
    ).toEqual({ ok: false, error: '开发周期（天）必须是正整数' })

    expect(
      validateRequirementPublishForm(
        form({ paymentMode: 'platform_guarantee', developmentCycleDays: '0' }),
      ),
    ).toEqual({ ok: false, error: '开发周期（天）必须大于 0' })
  })

  it('担保需求把开发周期归一化成数字提交；无担保需求一律 undefined', () => {
    const guaranteed = validateRequirementPublishForm(
      form({ paymentMode: 'platform_guarantee', developmentCycleDays: ' 30 ' }),
    )
    expect(guaranteed.ok && guaranteed.payload.development_cycle_days).toBe(30)

    const selfManaged = validateRequirementPublishForm(
      form({ paymentMode: 'self_managed', developmentCycleDays: '30' }),
    )
    expect(selfManaged.ok && selfManaged.payload.development_cycle_days).toBeUndefined()
  })

  it('描述与验收标准落库的是清洗后的富文本，不是原始输入', () => {
    const check = validateRequirementPublishForm(
      form({ description: '<p onclick="alert(1)">需要重做订单列表与详情页。</p>' }),
    )

    expect(check.ok && check.payload.description).toBe('<p>需要重做订单列表与详情页。</p>')
  })
})
