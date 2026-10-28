import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ResourcePurchaseDialog from '@/components/resource-detail/ResourcePurchaseDialog.vue'

// 样式契约要读组件源码本身（CSS 不进 DOM，只能按文本断言）；vitest 的 root 就是仓根
const dialogSource = readFileSync(
  resolve(process.cwd(), 'src/components/resource-detail/ResourcePurchaseDialog.vue'),
  'utf8',
)

/**
 * 购买确认弹窗（R047 从 `ResourceDetailPanel` 拆出的第三块）。
 *
 * 这一块是纯展示：下单队列 / 支付面世代号 / 轮询都在 `useResourcePurchase` 里，
 * 所以这里只钉「渲染」与「两个出口各 emit 一次」——拆分最容易坏的就是出口接线。
 *
 * Teleport 就地渲染（`stubs: { teleport: true }`），否则节点会跑到 body 上、
 * 只能按 `document` 查，断言写法与现有弹窗测试不一致。
 */
function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ResourcePurchaseDialog, {
    props: {
      open: true,
      title: '红石自动化整合包',
      priceLabel: '¥9.90',
      showPromoHint: false,
      channel: 'alipay',
      pointsMode: false,
      error: '',
      submitting: false,
      orderNo: '',
      orderStatus: '',
      qrDataUrl: '',
      ...props,
    },
    global: { stubs: { teleport: true } },
  })
}

describe('ResourcePurchaseDialog', () => {
  it('渲染标题、金额与两个渠道；点微信只 emit 一次选渠道', async () => {
    const wrapper = mountDialog()

    expect(wrapper.get('.resource-purchase-modal__subject').text()).toContain('红石自动化整合包')
    expect(wrapper.get('.resource-purchase-modal__amount').text()).toContain('¥9.90')
    expect(wrapper.findAll('.payment-option')).toHaveLength(2)

    const wechat = wrapper.findAll('.payment-option')[1]
    await wechat?.trigger('click')

    expect(wrapper.emitted('select-channel')).toHaveLength(1)
    expect(wrapper.emitted('select-channel')?.[0]).toEqual(['wechat'])
  })

  it('点 × 与点遮罩都各 emit 一次 close', async () => {
    const wrapper = mountDialog()
    await wrapper.get('.resource-purchase-modal__close').trigger('click')
    await wrapper.get('.resource-purchase-modal-wrap').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('推广轻提示只在 showPromoHint 为真时出现', async () => {
    expect(mountDialog().find('.resource-purchase-modal__promo-hint').exists()).toBe(false)
    expect(
      mountDialog({ showPromoHint: true }).get('.resource-purchase-modal__promo-hint').text(),
    ).toContain('推广者')
  })

  it('关闭态不渲染任何弹窗节点', () => {
    const wrapper = mountDialog({ open: false })
    expect(wrapper.find('.resource-purchase-modal').exists()).toBe(false)
  })
})

describe('ResourcePurchaseDialog 的样式契约（层级别在拆分时丢了）', () => {
  /**
   * 全站 `modal.css` 里有 `.pay-modal .actions`（0,2,0）与 `.modal-wrap .pay-modal .actions`（0,3,0）。
   * 组件这边必须保持**两段式** `.resource-purchase-modal .actions`（scoped 再补一个属性选择器，
   * 实际 0,3,0 / 0,4,0），才能继续压住全站样式；写成单类 `.actions` 只有 0,2,0，
   * 会与 `.pay-modal .actions` 打平、按导入顺序输掉——640 档「按钮铺满」就静默失效。
   */
  it('`.actions` 规则必须带 `.resource-purchase-modal` 前缀，不许写成单类', () => {
    const styleBlock = dialogSource.slice(dialogSource.indexOf('<style scoped>'))
    const bareRule = /^[ \t]*\.actions[^{]*\{/

    expect(styleBlock).toContain('.resource-purchase-modal .actions {')
    // 没有任何一条规则以裸 `.actions` 起头（否则等于把胜负交给导入顺序）
    expect(styleBlock.split('\n').filter((line) => bareRule.test(line))).toEqual([])
  })
})
