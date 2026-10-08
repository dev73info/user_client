import { ref } from 'vue'

/** 工作台移动端顶栏里给页面 Teleport 进来的插槽（UserWorkbenchView 里那个元素的 id）。 */
export const WORKBENCH_BAR_SLOT_ID = 'workbench-mobile-bar-extra'

/** 与工作台顶栏出现的断点一致：900px 及以下才有移动端顶栏。 */
export const WORKBENCH_BAR_MEDIA = '(max-width: 900px)'

/**
 * 当前有几个页面块正挂在顶栏插槽里。顶栏据此隐藏标题、让出位置；
 * 页面切换的 out-in 过渡里旧页先卸载再挂新页，计数不会叠加。
 */
export const workbenchBarSlotCount = ref(0)
