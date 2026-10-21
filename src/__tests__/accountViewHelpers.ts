import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { Component } from 'vue'

/**
 * 账号与安全页**视图级**测试的公共挂载工具。
 *
 * 这一页只能整页挂起来验证父子接线（父级持有可见性、草稿与加载态，弹窗只回传），
 * 而挂载前的 mock（`@/stores/auth`、`vue-router`、几个 api 模块）必须写在各 spec 里
 * （`vi.mock` 按文件提升），能共享的只有挂载之后这几步，所以单独放这里，
 * 免得两个 spec 各抄一份、又双双超过单文件行数预算。
 */

/** 视图 `setupState` 里本页测试用到的入口。 */
export type ViewSetup = {
  openAccountEntry: (key: string) => void
}

export function setupState(wrapper: VueWrapper): ViewSetup {
  return (wrapper.vm.$ as unknown as { setupState: ViewSetup }).setupState
}

/** 按可见文案找按钮（弹窗里的按钮没有稳定 class，文案才是用户看得到的那一层）。 */
export function buttonByText(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) {
    throw new Error(`弹窗里找不到按钮：${text}`)
  }
  return found
}

/** 挂整页：TDialog 默认 teleport 到 body，这里就地渲染以便按选择器定位弹窗内容。 */
export async function renderView(component: Component): Promise<VueWrapper> {
  const wrapper = mount(component, {
    global: {
      stubs: { Teleport: true, RealnameHero: true, WechatBindQrModal: true },
      config: { warnHandler: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

/** 打开某个「账号与安全」入口（与点入口行走同一个分发函数）。 */
export async function openEntry(wrapper: VueWrapper, key: string): Promise<void> {
  setupState(wrapper).openAccountEntry(key)
  await nextTick()
}

/** jsdom 没有 matchMedia，而视图在 `onMounted` 里用它判移动端。 */
export function stubMatchMedia(): void {
  window.matchMedia = (() => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
