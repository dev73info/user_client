<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getWechatLoginQrStatus } from '@/api/auth'

const props = defineProps({
  visible: { type: Boolean, default: false },
  url: { type: String, default: '' },
  state: { type: String, default: '' },
  pollSecret: { type: String, default: '' },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'logged-in', token: string): void
}>()

const qrDataUrl = ref('')
const qrError = ref('')
const polling = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let generation = 0

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function checkLogin(
  expectedGeneration = generation,
  expectedState = props.state,
  expectedSecret = props.pollSecret,
) {
  if (
    !props.visible ||
    !expectedState ||
    !expectedSecret ||
    expectedGeneration !== generation ||
    props.state !== expectedState ||
    props.pollSecret !== expectedSecret ||
    polling.value
  ) {
    return
  }
  polling.value = true
  try {
    const result = await getWechatLoginQrStatus(expectedState, expectedSecret)
    if (
      result.token &&
      props.visible &&
      expectedGeneration === generation &&
      props.state === expectedState &&
      props.pollSecret === expectedSecret
    ) {
      stopPolling()
      emit('logged-in', result.token)
    }
  } catch {
    // 轮询失败保留二维码，继续下一轮。
  } finally {
    polling.value = false
  }
}

async function prepare() {
  const currentGeneration = ++generation
  const expectedState = props.state
  const expectedSecret = props.pollSecret
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''

  if (!props.visible || !props.url.trim() || !props.state || !expectedSecret) {
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
      qrError.value = '二维码生成失败，请关闭后重新发起授权'
    }
    return
  }

  if (currentGeneration !== generation || !props.visible) {
    return
  }

  await checkLogin(currentGeneration, expectedState, expectedSecret)
  if (currentGeneration !== generation || !props.visible) {
    return
  }

  pollTimer = setInterval(() => {
    void checkLogin(currentGeneration, expectedState, expectedSecret)
  }, 2000)
}

function close() {
  generation += 1
  stopPolling()
  emit('close')
}

watch(
  () => [props.visible, props.url, props.state, props.pollSecret] as const,
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
      <section class="auth-modal wechat-authorization-modal" aria-label="微信扫码登录">
        <header class="wechat-authorization-modal__head">
          <div>
            <h3>登录 73Info</h3>
          </div>
          <button class="wechat-authorization-modal__close" type="button" aria-label="关闭微信扫码登录"
            @click="close">
            ×
          </button>
        </header>

        <p class="wechat-authorization-modal__intro">
          请用手机微信扫码并授权，核对电脑 IP 和登录时间后，点击“确认登录”。
        </p>

        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="微信扫码登录二维码" />
          <span v-else>{{ qrError || '二维码生成中...' }}</span>
        </div>

        <p class="wechat-authorization-modal__hint">
          请保持本页面打开，手机确认后电脑才会登录。非本人操作请在手机上取消。
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
  width: 256px;
  height: 256px;
}
</style>
