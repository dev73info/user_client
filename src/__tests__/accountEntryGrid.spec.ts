import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AccountEntryGrid from '@/components/account/AccountEntryGrid.vue'
import type { AccountEntryGroup } from '@/shared/accountEntries'
import { Lock, Postcard, Warning } from 'ui_73info'

/**
 * 入口行组件：两张卡片共用的「分组 + 行」。
 *
 * 组件只做两件事——按 `groups` 渲染、点哪一行就 emit 哪个 key。所以这里只钉这两件：
 * **key 必须原样回传**（视图的 22 分支 switch 全靠它）、禁用/危险态只改视觉不改行为。
 * 点下去打开哪个弹窗由视图的用例验（`accountDialogsInView.spec.ts` 里那条点行的用例）。
 */
const groups: AccountEntryGroup[] = [
  {
    title: '登录凭证',
    entries: [
      { key: 'email', title: '修改邮箱', desc: '当前邮箱：a@b.com', icon: Postcard },
      {
        key: 'twoFactor',
        title: '两步验证',
        desc: '登录时额外校验一次邮箱验证码',
        icon: Lock,
        status: { text: '已开启', tone: 'success' },
      },
    ],
  },
  {
    title: '危险操作',
    entries: [
      { key: 'close', title: '注销账号', desc: '注销后不可恢复', icon: Warning, danger: true },
    ],
  },
  {
    title: '收款与结算',
    entries: [
      {
        key: 'settle',
        title: '结算账户',
        desc: '收款账户正在渠道审核中',
        icon: Lock,
        status: { text: '收款账户：渠道审核中', tone: 'warning' },
        locked: true,
      },
    ],
  },
]

function render(entries: AccountEntryGroup[] = groups) {
  return mount(AccountEntryGrid, {
    props: { groups: entries },
    global: { config: { warnHandler: () => {} } },
  })
}

describe('账户入口行：渲染', () => {
  it('按分组渲染标题与每一行，状态标签照抄传入的文案与语气', () => {
    const wrapper = render()
    const titles = wrapper.findAll('.entry-group__title').map((node) => node.text())
    expect(titles).toEqual(['登录凭证', '危险操作', '收款与结算'])
    expect(wrapper.findAll('.entry-row')).toHaveLength(4)

    const twoFactor = wrapper.findAll('.entry-row')[1]!
    expect(twoFactor.text()).toContain('两步验证')
    expect(twoFactor.text()).toContain('已开启')
    // tone 是 TTag 的语义色，落到 class 上才看得出「审核中」没被写成绿色
    expect(twoFactor.html()).toContain('success')
    expect(wrapper.findAll('.entry-row')[3]!.html()).toContain('warning')
  })

  it('危险 / 禁用只改视觉：danger 上色、locked 变灰但仍可点（拦不拦由视图决定）', () => {
    const wrapper = render()
    const rows = wrapper.findAll('.entry-row')
    expect(rows[2]!.classes()).toContain('entry-row--danger')
    expect(rows[3]!.classes()).toContain('entry-row--locked')
    // 注：行上那个 `:aria-disabled` 目前会被 TButton 自己的 `:aria-disabled` 覆盖掉
    // （组件没收到 disabled，它算 undefined 就把属性去掉了）。这是抽组件之前就有的行为，
    // 本轮纯重构原样保留，所以这里只钉视觉类的开关。
    expect(rows[0]!.classes()).not.toContain('entry-row--locked')
  })
})

describe('账户入口行：分发', () => {
  it('点哪一行就 emit 哪一行的 key，原样不加工', async () => {
    const wrapper = render()
    const rows = wrapper.findAll('.entry-row')

    await rows[0]!.trigger('click')
    await rows[3]!.trigger('click')
    await rows[2]!.trigger('click')

    expect(wrapper.emitted('open')).toEqual([['email'], ['settle'], ['close']])
  })

  it('禁用的行点了照样 emit：入口行只负责回传，拦不拦由视图决定', async () => {
    const wrapper = render()
    await wrapper.findAll('.entry-row')[3]!.trigger('click')
    expect(wrapper.emitted('open')).toEqual([['settle']])
  })

  it('分组为空时什么都不渲染，不会抛错', () => {
    const wrapper = render([])
    expect(wrapper.findAll('.entry-row')).toHaveLength(0)
  })
})
