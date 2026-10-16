<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getWechatLoginQrStatus, type WechatLoginQrPollStatus } from '@/api/auth'
import { qrPollDelayMs } from '@/utils/qrPollBackoff'

const props = defineProps({
  visible: { type: Boolean, default: false },
  url: { type: String, default: '' },
  state: { type: String, default: '' },
  pollSecret: { type: String, default: '' },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'logged-in', token: string): void
  /** 手机端取消、或二维码失效后，用户点「重新扫码」：请父级重新申领一个二维码。 */
  (e: 'refresh'): void
}>()

const qrDataUrl = ref('')
const qrError = ref('')
const polling = ref(false)
/** 二维码当前阶段：进来是 pending，手机端扫码 / 确认 / 取消都会推着它往前走。 */
const pollStatus = ref<WechatLoginQrPollStatus>('pending')
let pollTimer: ReturnType<typeof setTimeout> | null = null
let generation = 0

/**
 * 需要盖在二维码上的遮罩：已扫码待确认、手机端取消了、二维码失效。
 * 没有二维码（生成中 / 生成失败）时不盖，否则会把「二维码生成中」也挡住。
 */
const overlayStatus = computed<WechatLoginQrPollStatus | null>(() => {
  if (!qrDataUrl.value) {
    return null
  }
  if (
    pollStatus.value === 'scanned' ||
    pollStatus.value === 'cancelled' ||
    pollStatus.value === 'expired'
  ) {
    return pollStatus.value
  }
  return null
})

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/**
 * 查询一次扫码状态，返回是否应该继续轮询。
 * 拿到令牌、手机端取消、二维码失效（或凭据/弹窗已失效）返回 false；上一轮还在请求中时返回 true，
 * 交给下一次排期继续，不打断已有请求。
 */
async function checkLogin(
  expectedGeneration = generation,
  expectedState = props.state,
  expectedSecret = props.pollSecret,
): Promise<boolean> {
  if (
    !props.visible ||
    !expectedState ||
    !expectedSecret ||
    expectedGeneration !== generation ||
    props.state !== expectedState ||
    props.pollSecret !== expectedSecret
  ) {
    return false
  }
  if (polling.value) {
    return true
  }
  polling.value = true
  try {
    const result = await getWechatLoginQrStatus(expectedState, expectedSecret)
    if (
      props.visible &&
      expectedGeneration === generation &&
      props.state === expectedState &&
      props.pollSecret === expectedSecret
    ) {
      if (result.token) {
        stopPolling()
        emit('logged-in', result.token)
        return false
      }
      // 旧后端不带 status，缺省按「等待扫码」处理，弹窗行为与以前一致。
      const status = result.status ?? 'pending'
      pollStatus.value = status
      if (status === 'cancelled' || status === 'expired') {
        // 这两个状态不会再变回可登录，停轮询、盖上遮罩，等用户点「重新扫码」。
        stopPolling()
        return false
      }
    }
  } catch {
    // 轮询失败保留二维码，继续下一轮。
  } finally {
    polling.value = false
  }
  return expectedGeneration === generation && props.visible
}

/** 按「先密后疏」的节奏排下一次轮询；attempt 为已完成的轮询次数。 */
function schedulePoll(
  expectedGeneration: number,
  expectedState: string,
  expectedSecret: string,
  attempt: number,
) {
  pollTimer = setTimeout(() => {
    pollTimer = null
    void pollOnce(expectedGeneration, expectedState, expectedSecret, attempt)
  }, qrPollDelayMs(attempt))
}

async function pollOnce(
  expectedGeneration: number,
  expectedState: string,
  expectedSecret: string,
  attempt: number,
) {
  const keepPolling = await checkLogin(expectedGeneration, expectedState, expectedSecret)
  if (!keepPolling || expectedGeneration !== generation || !props.visible) {
    return
  }
  schedulePoll(expectedGeneration, expectedState, expectedSecret, attempt + 1)
}

async function prepare() {
  const currentGeneration = ++generation
  const expectedState = props.state
  const expectedSecret = props.pollSecret
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''
  pollStatus.value = 'pending'

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

  const keepPolling = await checkLogin(currentGeneration, expectedState, expectedSecret)
  if (currentGeneration !== generation || !props.visible || !keepPolling) {
    return
  }

  schedulePoll(currentGeneration, expectedState, expectedSecret, 1)
}

/** 手机端取消 / 二维码失效后点「重新扫码」：先清掉旧码与遮罩，再让父级重新申领。 */
function refresh() {
  if (pollStatus.value !== 'cancelled' && pollStatus.value !== 'expired') {
    return
  }
  generation += 1
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''
  pollStatus.value = 'pending'
  emit('refresh')
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
          <span class="wechat-authorization-modal__brand" aria-hidden="true">
            <img src="/icons/wechat.svg" alt="" />
          </span>
          <div class="wechat-authorization-modal__titles">
            <h3>登录 73Info</h3>
            <p class="wechat-authorization-modal__subtitle">微信扫码登录</p>
          </div>
          <button class="wechat-authorization-modal__close" type="button" aria-label="关闭微信扫码登录"
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
            请用手机微信扫码并授权，核对电脑 IP 和登录时间后，点击“确认登录”。
          </span>
        </p>

        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="微信扫码登录二维码" />
          <span v-else>{{ qrError || '二维码生成中...' }}</span>

          <!-- 手机端扫过码但还没确认：同步盖一层「待确认」遮罩，别再让人对着二维码干等 -->
          <div
            v-if="overlayStatus === 'scanned'"
            class="wechat-authorization-modal__overlay is-scanned"
            role="status"
          >
            <span class="wechat-authorization-modal__spinner" aria-hidden="true"></span>
            <p class="wechat-authorization-modal__overlay-title">已扫码，等待手机确认</p>
            <p class="wechat-authorization-modal__overlay-text">
              请在手机上核对电脑 IP 和登录时间，再点击“确认登录”
            </p>
          </div>

          <!-- 手机端取消 / 二维码失效：盖上结果遮罩，并给「重新扫码」这条出路 -->
          <div
            v-else-if="overlayStatus"
            class="wechat-authorization-modal__overlay"
            :class="`is-${overlayStatus}`"
            role="status"
          >
            <span class="wechat-authorization-modal__overlay-mark" aria-hidden="true">
              <svg
                v-if="overlayStatus === 'cancelled'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                focusable="false"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                focusable="false"
              >
                <path d="M12 6v8M12 18h.01" />
              </svg>
            </span>
            <p class="wechat-authorization-modal__overlay-title">
              {{ overlayStatus === 'cancelled' ? '登录已取消' : '二维码已过期' }}
            </p>
            <p class="wechat-authorization-modal__overlay-text">
              {{
                overlayStatus === 'cancelled'
                  ? '手机上已取消本次登录，重新扫码即可再试'
                  : '二维码已失效，重新扫码即可再试'
              }}
            </p>
            <button
              class="auth-btn solid wechat-authorization-modal__overlay-action"
              type="button"
              @click="refresh"
            >
              重新扫码
            </button>
          </div>
        </div>

        <p class="wechat-authorization-modal__hint">
          <svg class="wechat-authorization-modal__hint-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true" focusable="false">
            <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
            <path d="M9.5 12.5l1.8 1.8 3.4-3.6" />
          </svg>
          <span class="wechat-authorization-modal__hint-text">
            请保持本页面打开，手机确认后电脑才会登录。
            <span class="wechat-authorization-modal__hint-warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M12 4.5 3.5 19.5h17z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              <span>非本人操作请在手机上取消。</span>
            </span>
          </span>
        </p>

        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="close">取消</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 外壳样式在 `styles/modal.css`（三个微信扫码弹窗共用），这里只留扫码登录特有的部分 */

/* 二维码遮罩：盖住整块二维码区，白色蒙层 + 轻微毛玻璃 */
.wechat-authorization-modal__overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 22px 20px;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(4px);
  animation: wechat-qr-overlay-in 200ms ease-out;
}

/* 待确认态：二维码还在，蒙层留一点透明度、毛玻璃也轻一档，
   让底下的码还认得出形状——表明「扫的就是这一张」 */
.wechat-authorization-modal__overlay.is-scanned {
  background: rgba(237, 243, 245, 0.86);
  backdrop-filter: blur(2px);
}

.wechat-authorization-modal__spinner {
  width: 34px;
  height: 34px;
  border: 3px solid rgba(31, 74, 209, 0.16);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: wechat-qr-spin 900ms linear infinite;
}

.wechat-authorization-modal__overlay-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: #b42318;
  background: rgba(239, 68, 68, 0.1);
  box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.14);
}

.wechat-authorization-modal__overlay.is-expired .wechat-authorization-modal__overlay-mark {
  color: #92400e;
  background: rgba(251, 191, 36, 0.16);
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.24);
}

.wechat-authorization-modal__overlay-mark svg {
  width: 26px;
  height: 26px;
}

.wechat-authorization-modal__overlay-title {
  margin: 0;
  color: var(--text-main);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.4;
}

.wechat-authorization-modal__overlay-text {
  margin: 0;
  max-width: 17em;
  color: var(--text-sub);
  font-size: 12.5px;
  line-height: 1.7;
  text-wrap: pretty;
}

.wechat-authorization-modal__overlay-action {
  margin-top: 6px;
  padding: 0 22px;
  min-height: 40px;
  border-radius: 999px;
}

@keyframes wechat-qr-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes wechat-qr-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wechat-authorization-modal__overlay {
    animation: none;
  }

  .wechat-authorization-modal__spinner {
    animation-duration: 2.4s;
  }
}
</style>
