<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getQqUnbindQrStatus, getWechatBindQrStatus, getWechatUnbindQrStatus } from '@/api/auth'
import { qrPollDelayMs } from '@/utils/qrPollBackoff'

const props = withDefaults(
  defineProps<{
    visible: boolean
    url: string
    state: string
    pollSecret: string
    provider?: 'wechat' | 'qq'
    mode?: 'bind' | 'unbind'
  }>(),
  { provider: 'wechat', mode: 'bind' },
)
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'completed', result: { success: boolean; error?: string }): void
}>()

const qrDataUrl = ref('')
const qrError = ref('')
const polling = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let generation = 0

const providerText = computed(() => (props.provider === 'qq' ? 'QQ' : '微信'))
const actionText = computed(() => (props.mode === 'unbind' ? '解绑' : '绑定'))
const brandIcon = computed(() =>
  props.provider === 'qq' ? '/icons/qq_loge.png' : '/icons/wechat.svg',
)

function readQrStatus(state: string, pollSecret: string) {
  if (props.provider === 'qq') {
    return getQqUnbindQrStatus(state, pollSecret)
  }
  if (props.mode === 'unbind') {
    return getWechatUnbindQrStatus(state, pollSecret)
  }
  return getWechatBindQrStatus(state, pollSecret)
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

async function checkStatus(): Promise<boolean> {
  if (!props.visible || !props.state) return false
  if (polling.value) return true
  const currentGeneration = generation
  polling.value = true
  try {
    const result = await readQrStatus(props.state, props.pollSecret)
    if (currentGeneration !== generation || !props.visible) return false
    if (result.status === 'confirmed') {
      stopPolling()
      emit('completed', { success: true })
      return false
    }
    if (result.status === 'failed' || result.status === 'expired') {
      stopPolling()
      emit('completed', {
        success: false,
        error:
          result.message ||
          (result.status === 'expired'
            ? `二维码已过期，请重新发起${actionText.value}`
            : `${actionText.value}未完成`),
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
  if (!(await checkStatus()) || !props.visible) return
  schedulePoll(attempt + 1)
}

async function prepare() {
  const currentGeneration = ++generation
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''
  if (!props.visible || !props.url.trim() || !props.state) return
  if (!props.pollSecret) {
    qrError.value = `${actionText.value}会话缺少轮询凭据，请重新发起${actionText.value}`
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
      qrError.value = `二维码生成失败，请关闭后重新发起${actionText.value}`
    }
    return
  }
  if (currentGeneration !== generation || !props.visible) return
  if (await checkStatus()) {
    if (currentGeneration === generation && props.visible) schedulePoll(1)
  }
}

function close() {
  generation += 1
  stopPolling()
  emit('close')
}

watch(
  () =>
    [props.visible, props.url, props.state, props.pollSecret, props.provider, props.mode] as const,
  prepare,
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
      <section
        class="auth-modal wechat-authorization-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`${providerText}扫码${actionText}`"
      >
        <header class="wechat-authorization-modal__head">
          <span class="wechat-authorization-modal__brand" aria-hidden="true">
            <img :src="brandIcon" alt="" />
          </span>
          <div class="wechat-authorization-modal__titles">
            <h3>{{ actionText }} 73Info {{ providerText }}</h3>
            <p class="wechat-authorization-modal__subtitle">
              {{ mode === 'unbind' ? '扫码确认当前绑定' : '扫码确认授权' }}
            </p>
          </div>
          <button
            class="wechat-authorization-modal__close"
            type="button"
            :aria-label="`关闭${providerText}扫码${actionText}`"
            @click="close"
          >
            ×
          </button>
        </header>
        <p class="wechat-authorization-modal__intro">
          <span class="wechat-authorization-modal__intro-text"
            >请用手机{{ providerText }}扫描二维码，在{{ providerText }}中确认{{
              mode === 'unbind' ? '这是当前绑定的账号' : '授权'
            }}后即可完成{{ actionText }}。</span
          >
        </p>
        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`${providerText}扫码${actionText}二维码`" />
          <span v-else :role="qrError ? 'alert' : undefined">{{
            qrError || '二维码生成中...'
          }}</span>
        </div>
        <p class="wechat-authorization-modal__hint">
          <span class="wechat-authorization-modal__hint-text"
            >扫码后请保持本页面打开，{{ actionText }}成功后会自动同步。</span
          >
        </p>
        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="close">取消</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
