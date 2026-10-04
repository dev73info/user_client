import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { TSelect } from 'ui_73info'

/**
 * 选项上千时必须截断渲染。
 *
 * 起因（实测）：开发者端「收款银行卡」里的开户银行下拉接的是渠道银行字典 5260 条，
 * 全量渲染时打开弹窗是一个 3.7 秒的 long task、DOM 节点 578 → 11259，每敲一个字 1~2 秒。
 *
 * 面板是 `Teleport` 到 `body` 的，所以这里不 stub teleport，直接查 `document`：
 * stub 掉之后选项组件会被反复挂载/卸载，读不到稳定的结果。
 */

/** 构造 n 条银行：label 是「银行-0000」这样的定长编号，便于用前缀精确命中一条 */
function banks(n: number) {
  return Array.from({ length: n }, (_, index) => ({
    label: `银行-${String(index).padStart(4, '0')}`,
    value: String(index).padStart(8, '0'),
  }))
}

function mountSelect(options: ReturnType<typeof banks>, extra: Record<string, unknown> = {}) {
  return mount(TSelect, {
    props: { options, filterable: true, ...extra },
    attachTo: document.body,
  })
}

/** 当前面板里渲染出来的选项（Teleport 之后挂在 body 上） */
const optionNodes = () => [...document.querySelectorAll('.t73-select-panel__list li')]
const moreHint = () => document.querySelector('.t73-select-panel__more')

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TSelect 大量选项', () => {
  it('默认只渲染前 200 项，并给出继续输入的提示', async () => {
    const wrapper = mountSelect(banks(5260))
    await flushPromises()
    await wrapper.trigger('click')
    await flushPromises()

    expect(optionNodes()).toHaveLength(200)
    expect(moreHint()?.textContent).toContain('缩小范围')
    wrapper.unmount()
  })

  it('输入关键字后只渲染命中的项，提示随之消失', async () => {
    const wrapper = mountSelect(banks(5260))
    await flushPromises()
    await wrapper.trigger('click')
    await wrapper.find('input').setValue('银行-0001')
    await flushPromises()

    const nodes = optionNodes()
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.textContent).toBe('银行-0001')
    expect(moreHint()).toBeNull()
    wrapper.unmount()
  })

  it('不可过滤时不截断：截断会让后面的选项永远选不到', async () => {
    const wrapper = mount(TSelect, {
      props: { options: banks(500), filterable: false },
      attachTo: document.body,
    })
    await flushPromises()

    expect(optionNodes()).toHaveLength(500)
    expect(moreHint()).toBeNull()
    wrapper.unmount()
  })

  it('maxVisibleOptions 传 0 表示不截断', async () => {
    const wrapper = mountSelect(banks(500), { maxVisibleOptions: 0 })
    await flushPromises()
    await wrapper.trigger('click')
    await flushPromises()

    expect(optionNodes()).toHaveLength(500)
    wrapper.unmount()
  })

  it('已选项被截在窗口外时补到最前面，打开面板仍能高亮它', async () => {
    const list = banks(500)
    const wrapper = mountSelect(list, { modelValue: list[list.length - 1]!.value })
    await flushPromises()
    await wrapper.trigger('click')
    await flushPromises()

    const nodes = optionNodes()
    expect(nodes).toHaveLength(200)
    // 已选项补到最前面，其余仍是原顺序的前 199 条
    expect(nodes[0]!.textContent).toBe('银行-0499')
    expect(nodes[1]!.textContent).toBe('银行-0000')
    wrapper.unmount()
  })
})
