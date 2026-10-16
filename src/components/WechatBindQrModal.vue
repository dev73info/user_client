<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getWechatBindQrStatus } from '@/api/auth'
import { qrPollDelayMs } from '@/utils/qrPollBackoff'

const props = defineProps({
  visible: { type: Boolean, default: false },
  url: { type: String, default: '' },
  state: { type: String, default: '' },
})

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

/**
 * 查询一次绑定状态，返回是否应该继续轮询。
 * 完成后返回 false；上一轮还在请求中时返回 true，交给下一次排期继续。
 */
async function checkBind(): Promise<boolean> {
  if (!props.visible || !props.state) {
    return false
  }
  if (polling.value) {
    return true
  }
  polling.value = true
  try {
    const result = await getWechatBindQrStatus(props.state)
    if (result.done) {
      stopPolling()
      emit('bound', {
        success: result.success,
        error: result.error ?? undefined,
      })
      return false
    }
  } catch {
    // 轮询失败保留二维码，继续下一轮。
  } finally {
    polling.value = false
  }
  return props.visible
}

/** 按「先密后疏」的节奏排下一次轮询；attempt 为已完成的轮询次数。 */
function schedulePoll(attempt: number) {
  pollTimer = setTimeout(() => {
    pollTimer = null
    void pollOnce(attempt)
  }, qrPollDelayMs(attempt))
}

async function pollOnce(attempt: number) {
  const keepPolling = await checkBind()
  if (!keepPolling || !props.visible) {
    return
  }
  schedulePoll(attempt + 1)
}

async function prepare() {
  const currentGeneration = ++generation
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''

  if (!props.visible || !props.url.trim() || !props.state) {
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

  if (currentGeneration !== generation || !props.visible) {
    return
  }

  const keepPolling = await checkBind()
  if (currentGeneration !== generation || !props.visible || !keepPolling) {
    return
  }

  schedulePoll(1)
}

function close() {
  generation += 1
  stopPolling()
  emit('close')
}

watch(
  () => [props.visible, props.url, props.state] as const,
  () => {
    void prepare()
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
      <section class="auth-modal wechat-authorization-modal" aria-label="微信扫码绑定">
        <header class="wechat-authorization-modal__head">
          <span class="wechat-authorization-modal__brand" aria-hidden="true">
            <img src="/icons/wechat.svg" alt="" />
          </span>
          <div class="wechat-authorization-modal__titles">
            <h3>绑定 73Info 微信</h3>
            <p class="wechat-authorization-modal__subtitle">扫码确认授权</p>
          </div>
          <button class="wechat-authorization-modal__close" type="button" aria-label="关闭微信扫码绑定"
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
            请用手机微信扫描二维码，在微信中确认授权后即可完成绑定。
          </span>
        </p>

        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="微信扫码绑定二维码" />
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
            扫码后请保持本页面打开，授权成功后会自动完成绑定。
          </span>
        </p>

        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="close">取消</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
