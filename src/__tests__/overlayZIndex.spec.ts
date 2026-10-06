import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { TDialog, TSelect } from 'ui_73info'

/**
 * 浮层层级：谁后打开谁在上面。
 *
 * 起因（实测）：下拉写死 `--73-z-dropdown`(2000)、弹窗遮罩写死 `--73-z-dialog`(3000)，
 * 于是弹窗里打开下拉时面板被整块压在弹窗下面——`document.elementFromPoint` 在选项位置上
 * 命中的是弹窗表单，选项既看不见也点不到。修法是两层都从 `useZIndex` 取号。
 *
 * 面板与遮罩都 Teleport 到 body，所以这里不 stub teleport，直接查 `document`。
 */

const options = Array.from({ length: 5 }, (_, index) => ({
  label: `银行-${index}`,
  value: `bank-${index}`,
}))

/**
 * 下拉实例：要拿到 `TSelect` 通过 `defineExpose` 暴露的 `open()`，ref 必须按**组件实例类型**声明。
 * 写成 `ComponentPublicInstance` 就只有公共实例成员，`open()` 不在里面（`vue-tsc` 会报 TS2339）。
 */
const selectRef = ref<InstanceType<typeof TSelect> | null>(null)

/** 弹窗里放一个下拉：用 `h` 而不是模板字符串，避免依赖运行时的模板编译器 */
const Host = defineComponent({
  setup() {
    return () =>
      h(
        TDialog,
        { open: true, title: '收款银行卡' },
        {
          default: () =>
            h(TSelect, {
              ref: selectRef,
              options,
              filterable: true,
              placeholder: '搜索或选择银行名称',
            }),
        },
      )
  },
})

function mountHost() {
  selectRef.value = null
  return mount(Host, { attachTo: document.body })
}

const overlayEl = () => document.querySelector<HTMLElement>('.t73-dialog-overlay')
const openPanelEl = () => document.querySelector<HTMLElement>('.t73-select-panel--open')

describe('浮层层级', () => {
  it('弹窗里的下拉面板层级高于遮罩', async () => {
    const wrapper = mountHost()
    await flushPromises()

    const overlay = overlayEl()
    expect(overlay).toBeTruthy()
    const dialogZ = Number(overlay!.style.zIndex)
    expect(dialogZ).toBeGreaterThan(0)

    selectRef.value!.open()
    await flushPromises()

    const panel = openPanelEl()
    expect(panel).toBeTruthy()
    expect(Number(panel!.style.zIndex)).toBeGreaterThan(dialogZ)
    wrapper.unmount()
  })

  it('浮层都关掉后层级号回到起点，不会一路涨上去', async () => {
    const first = mountHost()
    await flushPromises()
    const firstZ = Number(overlayEl()!.style.zIndex)
    first.unmount()
    await flushPromises()

    const second = mountHost()
    await flushPromises()
    expect(Number(overlayEl()!.style.zIndex)).toBe(firstZ)
    second.unmount()
  })
})
