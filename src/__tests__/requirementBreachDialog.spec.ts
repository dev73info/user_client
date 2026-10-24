import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { AdapayBreachCase } from '@/api/adapay'
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'

/**
 * 开发者侧解除合作弹窗的接线测试：**只钉 props / emits 的逐字对齐**。
 *
 * 这个弹窗是从 2780 行的视图里整块搬出来的，搬动时最容易坏的不是样式而是键名：
 * `v-model:reason` 少一个冒号、`emit('submitPlatformReview')` 拼错一个字母，
 * 界面照旧渲染，只是按钮点了没反应——视图侧没有任何测试会发现。
 * 文案与判定口径（谁该表态、能不能再发起）在 `shared/requirementBreach` 的测试里。
 */

function breachCase(patch: Partial<AdapayBreachCase> = {}): AdapayBreachCase {
  return {
    id: 11,
    caseNo: 'BREACH_11',
    requirementId: 'REQ-1',
    paymentId: 'pay_1',
    reportedBy: 'client_a',
    reason: '交付内容与合同不符',
    status: 'submitted',
    depositAmountFen: 200000,
    depositAmountCny: '2000.00',
    refundAmountFen: 0,
    refundAmountCny: '0.00',
    compensationAmountFen: 0,
    compensationAmountCny: '0.00',
    extraCompensationFen: 0,
    extraCompensationCny: '0.00',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    ...patch,
  }
}

/** 最近一次发出的事件参数（`Array.prototype.at` 不在本仓 tsconfig 的 lib 里）。 */
function lastEmitted(wrapper: ReturnType<typeof render>, event: string) {
  const all = wrapper.emitted(event)
  return all?.[all.length - 1]
}

type Props = InstanceType<typeof RequirementBreachDialog>['$props']

function render(patch: Partial<Props> = {}) {
  return mount(RequirementBreachDialog, {
    props: {
      visible: true,
      breachCase: null,
      caseLoading: false,
      newRound: false,
      reportLoading: false,
      platformReviewLoading: false,
      withdrawLoading: false,
      withdrawConfirm: false,
      decisionLoading: false,
      rejectPanel: false,
      withdrawnByMe: false,
      canStartNewRound: true,
      canRespond: false,
      canWithdraw: false,
      canDecide: false,
      reason: '',
      decisionNote: '',
      ...patch,
    } as Props,
    // 弹窗内容 teleport 到 body：测试里就地渲染，断言不必去查 document。
    global: { stubs: { teleport: true } },
  })
}

const buttonTexts = (wrapper: ReturnType<typeof render>) =>
  wrapper.findAll('.t73-dialog button').map((button) => button.text())

const buttonByText = (wrapper: ReturnType<typeof render>, text: string) =>
  wrapper.findAll('.t73-dialog button').find((button) => button.text() === text)

describe('解除合作弹窗：props / emits 接线', () => {
  it('没有案件时出申报表单：理由走 v-model:reason，提交 emit submitReport', async () => {
    const wrapper = render()
    expect(wrapper.text()).toContain('解除合作')

    const textarea = wrapper.findAll('textarea')[0]!
    await textarea.setValue('对方 9 月 3 日后再无回应')
    // 带冒号的键必须逐字对上，父组件的 `v-model:reason` 才收得到
    expect(lastEmitted(wrapper, 'update:reason')).toEqual(['对方 9 月 3 日后再无回应'])

    await buttonByText(wrapper, '提交解除合作申请')!.trigger('click')
    expect(wrapper.emitted('submitReport')).toHaveLength(1)
    wrapper.unmount()
  })

  it('协商中：同意 / 不同意与申请平台介入各走自己的动作', async () => {
    const wrapper = render({ breachCase: breachCase(), canRespond: true, canWithdraw: false })

    await buttonByText(wrapper, '同意解除')!.trigger('click')
    expect(lastEmitted(wrapper, 'submitDecision')).toEqual(['accepted'])

    await buttonByText(wrapper, '不同意')!.trigger('click')
    expect(lastEmitted(wrapper, 'submitDecision')).toEqual(['rejected'])

    await buttonByText(wrapper, '申请平台介入')!.trigger('click')
    expect(wrapper.emitted('submitPlatformReview')).toHaveLength(1)
    wrapper.unmount()
  })

  it('AI 判定后只有我方还没表态才出「接受判定」', async () => {
    const deciding = render({
      breachCase: breachCase({ status: 'ai_judged' }),
      canDecide: true,
    })
    expect(buttonTexts(deciding)).toContain('接受判定')
    await buttonByText(deciding, '不接受')!.trigger('click')
    // 先展开原因输入框，再让「确认不接受」出现（同一份 decisionNote 草稿）
    expect(deciding.emitted('openRejectPanel')).toHaveLength(1)
    deciding.unmount()

    // 我方已表态：这段表态区整块不出现，只剩「关闭」
    const decided = render({
      breachCase: breachCase({ status: 'ai_judged', developerDecision: 'accepted' }),
      canDecide: false,
    })
    expect(buttonTexts(decided)).not.toContain('接受判定')
    decided.unmount()
  })

  it('结案且没有生效合同时只给说明，不给「发起新的解除合作」', async () => {
    const blocked = render({
      breachCase: breachCase({ status: 'succeeded' }),
      canStartNewRound: false,
    })
    expect(buttonTexts(blocked)).not.toContain('发起新的解除合作')
    expect(blocked.text()).toContain('需重新接单并签约后才能再次发起解除合作')

    const allowed = render({
      breachCase: breachCase({ status: 'succeeded' }),
      canStartNewRound: true,
    })
    await buttonByText(allowed, '发起新的解除合作')!.trigger('click')
    expect(allowed.emitted('reopen')).toHaveLength(1)
    allowed.unmount()
  })

  it('上一轮由我方撤回时，申请人写「我方」、按钮写「重新发起」', async () => {
    const wrapper = render({
      breachCase: breachCase({ status: 'withdrawn' }),
      withdrawnByMe: true,
    })
    // 案件还在（不是在填新一轮表单）：标题仍是「进展」，申请人那行由 withdrawnByMe 决定
    expect(wrapper.text()).toContain('解除合作进展')
    expect(wrapper.text()).toContain('我方')

    await buttonByText(wrapper, '重新发起')!.trigger('click')
    expect(wrapper.emitted('reopen')).toHaveLength(1)
    wrapper.unmount()

    // 点过「重新发起」之后（newRound）标题才换成「重新发起解除合作」
    const form = render({
      breachCase: breachCase({ status: 'withdrawn' }),
      withdrawnByMe: true,
      newRound: true,
    })
    expect(form.find('.t73-dialog__title').text()).toContain('重新发起解除合作')
    form.unmount()
  })

  it('关闭由 TDialog 的关闭动作转发出来，编辑理由不会顺手关掉弹窗', async () => {
    const wrapper = render({ breachCase: breachCase() })
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.emitted('update:visible')).toBeUndefined()

    await buttonByText(wrapper, '关闭')!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
