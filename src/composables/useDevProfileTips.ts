/**
 * 主页打赏入口：他人视角打开打赏弹窗（未登录先要求登录，登录后回到本页），
 * 本人视角进开发者工作台的打赏设置页。
 *
 * 打赏弹窗本身（档位、留言、现金 / 积分通道）在 `DevTipDialog`，这里只管入口与登录闸门。
 */
import { ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { useAuthStore } from '@/stores/auth'

export function useDevProfileTips(options: {
  /** 只有「他人 + 开发者开启」时才允许打开弹窗 */
  canTip: Ref<boolean>
  /** 打赏成功后重载主页（累计与留言会变） */
  reload: () => Promise<void>
}) {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const dialogOpen = ref(false)

  function openTipDialog() {
    if (!options.canTip.value) {
      return
    }
    if (!auth.isAuthed || !auth.token.trim()) {
      TMessage.info('请先登录后再打赏')
      void router.push({
        name: 'home',
        query: { modal: 'auth', mode: 'login', redirect_to: route.fullPath },
      })
      return
    }
    dialogOpen.value = true
  }

  function openTipSettings() {
    void router.push({ name: 'dev-tip-settings' })
  }

  function onTipSuccess() {
    void options.reload()
  }

  return {
    dialogOpen,
    openTipDialog,
    openTipSettings,
    onTipSuccess,
  }
}
