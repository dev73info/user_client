import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { ResourcePurchaseTargetVersion } from '@/composables/useResourcePurchaseTarget'
import { parseResourcePayChannel, type ResourcePayDeepLinkChannel } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

/** 深链落点：`version` 为空表示整包购买；`null` 表示这条资源不需要购买。 */
export type ResourcePayDeepLinkTarget = {
  version: ResourcePurchaseTargetVersion | null
}

/**
 * 资源详情地址上的支付深链：`/<root>/<entry>?sale=paid&resource=<id>&pay=wechat|alipay`。
 *
 * 契约（别放宽，放宽就是把扣款入口交出去）：
 * 1. **只读渠道偏好**。地址上只认 `pay=wechat|alipay`，`token` / `user` / `open_id` / `ticket`
 *    之类一律不读——身份只来自当前浏览器的登录会话。开发者往链接里塞别人的认证不会生效。
 * 2. **只拉起确认弹窗**。订单仍是 pending 单，真正扣款要用户自己扫码 / 在渠道里确认；
 *    链接本身不能替任何人付钱。
 * 3. **绑定当前资源**。换资源 / 换分区时 `pay` 与 `promo` 一起从地址上摘掉（见
 *    `withoutSelectionQuery`），一条链接的意图不会漂到下一条资源上。
 * 4. **处理即消费**。拉起后把 `pay` 从地址上摘掉，刷新 / 后退不会重复下单；
 *    未登录时保留参数，登录弹窗的 `redirect_to` 会带着它回到本页继续。
 */
export function useResourcePayDeepLink(options: {
  /** 详情与购买闸就绪后返回落点；详情还没到时返回 `undefined`（等下一次） */
  resolveTarget: () => ResourcePayDeepLinkTarget | null | undefined
  /** 已过接口资源闸的打开动作（渠道只是偏好，金额与身份由后端按会话算） */
  openPurchasePanel: (
    version: ResourcePurchaseTargetVersion | null,
    channel: ResourcePayDeepLinkChannel,
  ) => Promise<void>
}) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  /** 已处理的意图（资源 + 渠道）：同一意图只拉起一次，避免刷新弹窗 / 登录回跳后重复下单 */
  let handledKey = ''
  /** 已替这次意图弹过登录：用户关掉登录框后不自动再弹，避免死循环 */
  let promptedKey = ''

  function intentKey(channel: ResourcePayDeepLinkChannel): string {
    return `${String(route.query.resource ?? '')}|${channel}`
  }

  /** 摘掉 `pay`（其余 query 一律保留）；地址里已经没有就不动，避免无意义的 replace */
  function consumeParam() {
    if (!('pay' in route.query)) {
      return
    }
    const query = { ...route.query }
    delete query.pay
    void router.replace({ query })
  }

  watch(
    [() => parseResourcePayChannel(route.query.pay), () => auth.token, options.resolveTarget],
    () => {
      const channel = parseResourcePayChannel(route.query.pay)
      if (!channel) {
        return
      }
      const target = options.resolveTarget()
      // 详情还没到：等资源与购买闸算出来再看
      if (target === undefined) {
        return
      }
      const key = intentKey(channel)
      if (handledKey === key) {
        return
      }
      // 免费 / 已购 / 作者本人 / 接口资源：没有可买的落点，只把参数摘掉
      if (target === null) {
        handledKey = key
        consumeParam()
        return
      }
      if (!auth.isAuthed) {
        if (promptedKey === key) {
          return
        }
        promptedKey = key
        // 保留 `pay`：openLogin 的 redirect_to 是当前整条地址，登录回来继续这次意图
        void options.openPurchasePanel(target.version, channel)
        return
      }
      handledKey = key
      consumeParam()
      void options.openPurchasePanel(target.version, channel)
    },
  )
}
