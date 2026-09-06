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
          <div>
            <p class="wechat-authorization-modal__eyebrow">PC 端微信支付</p>
            <h3>微信授权</h3>
          </div>
          <button class="wechat-authorization-modal__close" type="button" aria-label="关闭微信授权"
            @click="close">
            ×
          </button>
        </header>

        <p class="wechat-authorization-modal__intro">
          请用手机微信扫描二维码，完成公众号授权。授权成功后，本页面会自动更新。
        </p>

        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="微信授权二维码" />
          <span v-else>{{ qrError || '二维码生成中...' }}</span>
        </div>

        <p class="wechat-authorization-modal__hint">
          扫码后请在微信中确认授权，无需在手机上完成支付。
        </p>

        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="close">取消</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.wechat-authorization-modal-wrap {
  z-index: 1600;
}

.wechat-authorization-modal {
  width: min(420px, calc(100vw - 32px));
  text-align: center;
}

.wechat-authorization-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}

.wechat-authorization-modal__eyebrow {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 12px;
}

.wechat-authorization-modal__head h3 {
  margin: 0;
}

.wechat-authorization-modal__close {
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
  padding: 0 2px;
}

.wechat-authorization-modal__intro,
.wechat-authorization-modal__hint {
  color: #64748b;
  line-height: 1.7;
}

.wechat-authorization-modal__qr {
  align-items: center;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  margin: 20px auto 14px;
  min-height: 280px;
  padding: 12px;
  width: 280px;
}

.wechat-authorization-modal__qr img {
  display: block;
  height: 280px;
  width: 280px;
}

.wechat-authorization-modal__qr span {
  color: #64748b;
  font-size: 14px;
}

.wechat-authorization-modal__hint {
  font-size: 13px;
  margin-bottom: 0;
}
</style>
