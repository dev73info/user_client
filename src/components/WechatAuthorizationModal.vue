<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getWechatPaymentAuthorizationStatus } from '@/api/auth'

const props = defineProps({
  visible: { type: Boolean, default: false },
  authorizationUrl: { type: String, default: '' },
  token: { type: String, default: '' },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'authorized'): void
}>()

const qrDataUrl = ref('')
const qrError = ref('')
const checking = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let generation = 0

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function checkAuthorization() {
  if (!props.visible || !props.token || checking.value) {
    return
  }

  checking.value = true
  try {
    const result = await getWechatPaymentAuthorizationStatus(props.token)
    if (result.authorized) {
      stopPolling()
      emit('authorized')
    }
  } catch {
    // 授权轮询失败时保留二维码，下一次轮询继续尝试。
  } finally {
    checking.value = false
  }
}

async function prepareAuthorization() {
  const currentGeneration = ++generation
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''

  if (!props.visible || !props.authorizationUrl.trim() || !props.token) {
    return
  }

  try {
    qrDataUrl.value = await QRCode.toDataURL(props.authorizationUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
  } catch {
    if (currentGeneration === generation) {
      qrError.value = '二维码生成失败，请关闭后重新发起授权'
    }
    return
  }

  if (currentGeneration !== generation || !props.visible) {
    return
  }

  await checkAuthorization()
  if (currentGeneration !== generation || !props.visible) {
    return
  }

  pollTimer = setInterval(() => {
    void checkAuthorization()
  }, 2000)
}

function close() {
  generation += 1
  stopPolling()
  emit('close')
}

watch(
  () => [props.visible, props.authorizationUrl, props.token] as const,
  () => {
    void prepareAuthorization()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  generation += 1
  stopPolling()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="auth-modal-wrap wechat-authorization-modal-wrap" @click.self="close">
      <section class="auth-modal wechat-authorization-modal" aria-label="微信授权">
        <header class="wechat-authorization-modal__head">
          <span class="wechat-authorization-modal__brand" aria-hidden="true">
            <img src="/icons/wechat.svg" alt="" />
          </span>
          <div class="wechat-authorization-modal__titles">
            <h3>微信授权</h3>
            <p class="wechat-authorization-modal__subtitle">公众号授权</p>
          </div>
          <button class="wechat-authorization-modal__close" type="button" aria-label="关闭微信授权"
            @click="close">
            ×
          </button>
        </header>

        <p class="wechat-authorization-modal__intro">
          <svg class="wechat-authorization-modal__intro-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true" focusable="false">
            <path d="M4 8V5.6A1.6 1.6 0 0 1 5.6 4H8M16 4h2.4A1.6 1.6 0 0 1 20 5.6V8M20 16v2.4a1.6 1.6 0 0 1-1.6 1.6H16M8 20H5.6A1.6 1.6 0 0 1 4 18.4V16" />
            <path d="M4 12h16" />
          </svg>
          <span class="wechat-authorization-modal__intro-text">
            请用手机微信扫描二维码，完成公众号授权。授权成功后，本页面会自动更新。
          </span>
        </p>

        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="微信授权二维码" />
          <span v-else>{{ qrError || '二维码生成中...' }}</span>
        </div>

        <p class="wechat-authorization-modal__hint">
          <svg class="wechat-authorization-modal__hint-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span class="wechat-authorization-modal__hint-text">
            扫码后请在微信中确认授权，无需在手机上完成支付。
          </span>
        </p>

        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="close">取消</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
