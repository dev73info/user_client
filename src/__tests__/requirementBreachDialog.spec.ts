import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { RequirementBreachCaseItem } from '@/api/afterSales'
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'

/**
 * 开发者侧解除合作弹窗的接线测试：**只钉 props / emits 的逐字对齐**。
 *
 * 搬动时最容易坏的不是样式而是键名：`v-model:reason` 少一个冒号、
 * `emit('submitDecision')` 的参数拼错，界面照旧渲染，只是按钮点了没反应。
 *
 * 契约口径：表态只有 `approve` / `reject` 两支；「申请平台介入」与「AI 判定后接受 / 不接受」
 * 在契约里没有端点，那两段按钮与对应用例一起删了。
 */

function breachCase(patch: Partial<RequirementBreachCaseItem> = {}): RequirementBreachCaseItem {
  return {
    case_no: 'BC-20261028153000-AB12',
    kind: 'mutual_unbind',
    kind_label: '协商解除',
    status: 'negotiating',
    status_label: '协商中',
    is_open: true,
    filed_by: 'client_a',
    respondent: 'dev_flow',
    claim_amount_fen: 0,
    claim_amount_cny: 0,
    opened_at: '2026-10-28 15:30:00',
    turn: 'respondent',
    turn_label: '等待 dev_flow 表态',
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
      breachCaseDetail: null,
      caseLoading: false,
      newRound: false,
      reportLoading: false,
      withdrawLoading: false,
      withdrawConfirm: false,
      decisionLoading: false,
      withdrawnByMe: false,
      canStartNewRound: true,
      canRespond: false,
      canWithdraw: false,
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

  it('在办案件：同意 / 不同意各走自己的表态动作，且没有「申请平台介入」', async () => {
    const wrapper = render({ breachCase: breachCase(), canRespond: true, canWithdraw: false })
    // 契约里没有这个端点：按钮不许再出现
    expect(buttonTexts(wrapper)).not.toContain('申请平台介入')

    await buttonByText(wrapper, '同意解除')!.trigger('click')
    expect(lastEmitted(wrapper, 'submitDecision')).toEqual(['approve'])

    await buttonByText(wrapper, '不同意')!.trigger('click')
    expect(lastEmitted(wrapper, 'submitDecision')).toEqual(['reject'])
    wrapper.unmount()
  })

  it('不是对方当事人时只显示进展，不给表态按钮', () => {
    const wrapper = render({ breachCase: breachCase(), canRespond: false, canWithdraw: true })
    expect(wrapper.text()).toContain('等待 dev_flow 表态')
    expect(buttonTexts(wrapper)).not.toContain('同意解除')
    // 立案人能看到撤回入口
    expect(buttonTexts(wrapper)).toContain('撤回申请')
    wrapper.unmount()
  })

  it('结案且没有生效合同时只给说明，不给「发起新的解除合作」', async () => {
    const blocked = render({
      breachCase: breachCase({ status: 'closed', status_label: '已结案', is_open: false }),
      canStartNewRound: false,
    })
    expect(buttonTexts(blocked)).not.toContain('发起新的解除合作')
    expect(blocked.text()).toContain('需重新接单并签约后才能再次发起解除合作')
    blocked.unmount()

    const allowed = render({
      breachCase: breachCase({ status: 'closed', status_label: '已结案', is_open: false }),
      canStartNewRound: true,
    })
    await buttonByText(allowed, '发起新的解除合作')!.trigger('click')
    expect(allowed.emitted('reopen')).toHaveLength(1)
    allowed.unmount()
  })

  it('上一轮由我方撤回时，立案人写「我方」、按钮写「重新发起」', async () => {
    const wrapper = render({
      breachCase: breachCase({ status: 'withdrawn', status_label: '已撤回', is_open: false }),
      withdrawnByMe: true,
    })
    // 案件还在（不是在填新一轮表单）：标题仍是「进展」
    expect(wrapper.text()).toContain('解除合作进展')

    await buttonByText(wrapper, '重新发起')!.trigger('click')
    expect(wrapper.emitted('reopen')).toHaveLength(1)
    wrapper.unmount()

    // 点过「重新发起」之后（newRound）标题才换成「重新发起解除合作」
    const form = render({
      breachCase: breachCase({ status: 'withdrawn', status_label: '已撤回', is_open: false }),
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
