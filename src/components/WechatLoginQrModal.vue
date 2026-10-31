<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getWechatMpLoginQrStatus, type WechatLoginQrPollStatus } from '@/api/auth'
import { qrPollDelayMs } from '@/utils/qrPollBackoff'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** 服务号二维码的**图片地址**（后端向微信申领的带参二维码）。 */
  imageUrl: { type: String, default: '' },
  /** 需要前端自己画码时的内容（网页授权扫码；服务号流程留空）。 */
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
/** 服务号二维码图片加载失败：不再显示裂图，退回提示文案。 */
const qrImageBroken = ref(false)
/**
 * 已点「重新扫码」、父级还没拿回新码。
 *
 * 这一段必须把旧码藏起来：旧码已经过期，继续显示只会让人再扫一次同样失效的码。
 */
const awaitingRefresh = ref(false)
const polling = ref(false)
/** 二维码当前阶段：进来是 pending，扫码 / 关注成功后由服务端推到 confirmed。 */
const pollStatus = ref<WechatLoginQrPollStatus>('pending')
let pollTimer: ReturnType<typeof setTimeout> | null = null
let generation = 0

/**
 * 二维码图片源。
 *
 * 服务号登录用它自己的图片地址（微信 `showqrcode`），网页授权扫码才在本地画码——
 * 两种来源共用同一块展示位与同一套轮询，遮罩逻辑只认「有没有码」。
 */
const qrSource = computed(() =>
  awaitingRefresh.value ? '' : props.imageUrl.trim() || qrDataUrl.value,
)

/**
 * 需要盖在二维码上的遮罩：手机端取消、二维码失效。
 *
 * 服务号流程没有「已扫码待确认」这一档——关注事件一到服务端就落登录结果，
 * 令牌由轮询取走，手机侧不需要再点一次。所以 `scanned` 不盖遮罩，继续等就行。
 * 没有二维码（生成中 / 生成失败）时也不盖，否则会把「二维码生成中」也挡住。
 */
const overlayStatus = computed<WechatLoginQrPollStatus | null>(() => {
  if (!qrSource.value || qrImageBroken.value) {
    return null
  }
  if (pollStatus.value === 'cancelled' || pollStatus.value === 'expired') {
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
    const result = await getWechatMpLoginQrStatus(expectedState, expectedSecret)
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
  qrImageBroken.value = false
  awaitingRefresh.value = false
  pollStatus.value = 'pending'

  if (!props.visible || !props.state || !expectedSecret) {
    return
  }

  // 服务号二维码由后端给图片地址，本地不必（也不能）重画：
  // 二维码里是微信侧的带参 ticket，拿到的只是图片而不是可编码的文本。
  if (!props.imageUrl.trim()) {
    if (!props.url.trim()) {
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

/** 服务号二维码图片加载失败：不再显示裂图，给一句能照做的提示。 */
function onQrImageError() {
  qrImageBroken.value = true
  qrError.value = '二维码加载失败，请关闭后重新打开登录'
}

/** 二维码失效后点「重新扫码」：先清掉旧码与遮罩，再让父级重新申领。 */
function refresh() {
  if (pollStatus.value !== 'cancelled' && pollStatus.value !== 'expired') {
    return
  }
  generation += 1
  stopPolling()
  qrDataUrl.value = ''
  qrError.value = ''
  qrImageBroken.value = false
  awaitingRefresh.value = true
  pollStatus.value = 'pending'
  emit('refresh')
}

function close() {
  generation += 1
  stopPolling()
  emit('close')
}

watch(
  () => [props.visible, props.imageUrl, props.url, props.state, props.pollSecret] as const,
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
            <p class="wechat-authorization-modal__subtitle">微信扫码关注登录</p>
          </div>
          <button
            class="wechat-authorization-modal__close"
            type="button"
            aria-label="关闭微信扫码登录"
            @click="close"
          >
            ×
          </button>
        </header>

        <p class="wechat-authorization-modal__intro">
          <svg
            class="wechat-authorization-modal__intro-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M4 8V5.6A1.6 1.6 0 0 1 5.6 4H8M16 4h2.4A1.6 1.6 0 0 1 20 5.6V8M20 16v2.4a1.6 1.6 0 0 1-1.6 1.6H16M8 20H5.6A1.6 1.6 0 0 1 4 18.4V16"
            />
            <path d="M4 12h16" />
          </svg>
          <span class="wechat-authorization-modal__intro-text">
            请用手机微信「扫一扫」扫描二维码，关注服务号后自动登录，无需其它操作。
          </span>
        </p>

        <div class="wechat-authorization-modal__qr" aria-live="polite">
          <img
            v-if="qrSource && !qrImageBroken"
            :src="qrSource"
            alt="微信扫码登录二维码"
            @error="onQrImageError"
          />
          <span v-else>{{ qrError || '二维码生成中...' }}</span>

          <!-- 手机端取消 / 二维码失效：盖上结果遮罩，并给「重新扫码」这条出路 -->
          <div
            v-if="overlayStatus"
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
          <svg
            class="wechat-authorization-modal__hint-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
            <path d="M9.5 12.5l1.8 1.8 3.4-3.6" />
          </svg>
          <span class="wechat-authorization-modal__hint-text">
            请保持本页面打开，扫码关注后电脑会自动登录，登录通知会发到服务号会话。
            <span class="wechat-authorization-modal__hint-warn">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M12 4.5 3.5 19.5h17z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              <span>非本人操作请立即修改密码。</span>
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

<style scoped src="./wechat-login-qr-modal.css"></style>
