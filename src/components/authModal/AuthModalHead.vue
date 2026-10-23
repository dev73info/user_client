<script setup lang="ts">
/** 弹窗头部：标题、端内面板切换按钮与三段式模式 Tab。 */
defineProps({
  title: { type: String, required: true },
  preferInAppOauth: { type: Boolean, default: false },
  inAppPanelSwitchLabel: { type: String, default: '' },
  authMode: { type: String, required: true },
})

const emit = defineEmits<{
  (e: 'toggle-panel'): void
  (e: 'change-mode', mode: 'login' | 'register' | 'reset'): void
}>()

function changeMode(mode: 'login' | 'register' | 'reset') {
  emit('change-mode', mode)
}
</script>

<template>
  <div class="auth-modal-head">
    <div class="auth-modal-head__row">
      <h3>{{ title }}</h3>
      <button
        v-if="preferInAppOauth"
        class="auth-inapp-panel-switch"
        type="button"
        :aria-label="`切换到${inAppPanelSwitchLabel}`"
        @click="emit('toggle-panel')"
      >
        {{ inAppPanelSwitchLabel }}
      </button>
    </div>

    <!-- 端内一键登录态不用三段式 Tab；注册/重置走账号面板里的轻链 -->
    <div v-if="!preferInAppOauth" class="auth-mode-switch" role="tablist" aria-label="认证模式切换">
      <button
        class="auth-mode-btn"
        :class="{ active: authMode === 'login' }"
        type="button"
        :aria-pressed="authMode === 'login'"
        :disabled="authMode === 'login'"
        @click="changeMode('login')"
      >
        登录
      </button>
      <button
        class="auth-mode-btn"
        :class="{ active: authMode === 'register' }"
        type="button"
        :aria-pressed="authMode === 'register'"
        :disabled="authMode === 'register'"
        @click="changeMode('register')"
      >
        注册
      </button>
      <button
        class="auth-mode-btn"
        :class="{ active: authMode === 'reset' }"
        type="button"
        :aria-pressed="authMode === 'reset'"
        :disabled="authMode === 'reset'"
        @click="changeMode('reset')"
      >
        重置密码
      </button>
    </div>
  </div>
</template>
