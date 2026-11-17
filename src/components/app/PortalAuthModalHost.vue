<script setup lang="ts">
import AuthModal from '@/components/AuthModal.vue'
import WechatLoginQrModal from '@/components/WechatLoginQrModal.vue'
import { useHomeAuthQuery } from '@/composables/useHomeAuthQuery'
import { useHomePortalAuth } from '@/composables/useHomePortalAuth'

/**
 * 非首页的登录弹窗宿主。
 *
 * 首页的登录弹窗仍由 `HomeView` 渲染（发布 / 押金等流程与首页数据刷新绑在一起）；
 * 其余页面统一挂在这一层，`modal=auth` 出现在当前页地址时原地弹出，不再跳回首页。
 */
const { routeQueryValue } = useHomeAuthQuery()
const { authModalBindings, wechatQrBindings } = useHomePortalAuth({
  routeQueryValue,
  refreshPortalData: async () => {},
})
</script>

<template>
  <AuthModal v-bind="authModalBindings" />
  <WechatLoginQrModal v-bind="wechatQrBindings" />
</template>
