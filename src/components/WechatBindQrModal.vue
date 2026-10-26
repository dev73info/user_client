<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getWechatBindQrStatus } from '@/api/auth'
import { qrPollDelayMs } from '@/utils/qrPollBackoff'

const props = defineProps<{
  visible: boolean
  url: string
  state: string
  pollSecret: string
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'bound', result: { success: boolean; error?: string }): void
}>()

const qrDataUrl = ref('')
const qrError = ref('')
const polling = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let generation = 0

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

async function checkBind(): Promise<boolean> {
  if (!props.visible || !props.state) return false
  if (polling.value) return true
  const currentGeneration = generation
  polling.value = true
  try {
    const result = await getWechatBindQrStatus(props.state, props.pollSecret)
    if (currentGeneration !== generation || !props.visible) return false
    if (result.status === 'confirmed') {
      stopPolling()
      emit('bound', { success: true })
      return false
    }
    if (result.status === 'failed' || result.status === 'expired') {
      stopPolling()
      emit('bound', {
        success: false,
        error:
          result.message ||
          (result.status === 'expired' ? '二维码已过期，请重新发起绑定' : '绑定未完成'),
      })
      return false
    }
  } catch {
    // 临时网络失败保留二维码和当前会话，下一轮继续查询。
  } finally {
    polling.value = false
  }
  return props.visible
}

function schedulePoll(attempt: number) {
  pollTimer = setTimeout(() => {
    pollTimer = null
    void pollOnce(attempt)
  }, qrPollDelayMs(attempt))
}

async function pollOnce(attempt: number) {
  if (!(await checkBind()) || !props.visible) return
  schedulePoll(attempt + 1)
}

async function prepare() {
  const currentGeneration = ++generation
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''
  if (!props.visible || !props.url.trim() || !props.state) return
  if (!props.pollSecret) {
    qrError.value = '绑定会话缺少轮询凭据，请重新发起绑定'
    return
  }

  try {
    qrDataUrl.value = await QRCode.toDataURL(props.url, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
  } catch {
    if (currentGeneration === generation) {
      qrError.value = '二维码生成失败，请关闭后重新发起绑定'
    }
    return
  }
  if (currentGeneration !== generation || !props.visible) return
  if (await checkBind()) {
    if (currentGeneration === generation && props.visible) schedulePoll(1)
  }
}

function close() {
  generation += 1
  stopPolling()
  emit('close')
}

watch(() => [props.visible, props.url, props.state, props.pollSecret] as const, prepare, {
  immediate: true,
})
onBeforeUnmount(() => {
  generation += 1
  stopPolling()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="auth-modal-wrap wechat-authorization-modal-wrap" @click.self="close">
      <section
        class="auth-modal wechat-authorization-modal"
        role="dialog"
        aria-modal="true"
        aria-label="微信扫码绑定"
      >
        <header class="wechat-authorization-modal__head">
          <span class="wechat-authorization-modal__brand" aria-hidden="true">
            <img src="/icons/wechat.svg" alt="" />
          </span>
          <div class="wechat-authorization-modal__titles">
            <h3>绑定 73Info 微信</h3>
            <p class="wechat-authorization-modal__subtitle">扫码确认授权</p>
          </div>
          <button
            class="wechat-authorization-modal__close"
            type="button"
            aria-label="关闭微信扫码绑定"
            @click="close"
          >
            ×
          </button>
        </header>
        <p class="wechat-authorization-modal__intro">
          <span class="wechat-authorization-modal__intro-text"
            >请用手机微信扫描二维码，在微信中确认授权后即可完成绑定。</span
          >
        </p>
        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="微信扫码绑定二维码" />
          <span v-else :role="qrError ? 'alert' : undefined">{{
            qrError || '二维码生成中...'
          }}</span>
        </div>
        <p class="wechat-authorization-modal__hint">
          <span class="wechat-authorization-modal__hint-text"
            >扫码后请保持本页面打开，授权成功后会自动完成绑定。</span
          >
        </p>
        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="close">取消</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
