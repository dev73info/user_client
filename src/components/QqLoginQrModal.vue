<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

import { getQqLoginQrStatus } from '@/api/auth'

const props = defineProps({
  visible: { type: Boolean, default: false },
  url: { type: String, default: '' },
  state: { type: String, default: '' },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'logged-in', token: string): void
}>()

const qrDataUrl = ref('')
const qrError = ref('')
const polling = ref(false)
const loginMode = ref<'qr' | 'password'>('qr')
let pollTimer: ReturnType<typeof setInterval> | null = null
let generation = 0
const qqConnectLogoImage = 'https://wiki.connect.qq.com/wp-content/uploads/2013/10/01_qq_logo-1.png'
const qqConnectPenguinImage = 'https://wiki.connect.qq.com/wp-content/uploads/2013/10/03_qq_symbol-1.png'
const qqPasswordLoginUrl = computed(() => {
  let clientId = ''
  try {
    clientId = new URL(props.url).searchParams.get('client_id') || ''
  } catch {
    // URL 未准备好时使用没有第三方应用标识的官方登录组件。
  }

  const query = new URLSearchParams({
    appid: '716027609',
    daid: '383',
    style: '33',
    login_text: '登录',
    hide_title_bar: '1',
    hide_border: '1',
    target: 'self',
    s_url: 'https://graph.qq.com/oauth2.0/login_jump',
    pt_feedback_link: 'https://support.qq.com/products/77942?customInfo=.appid101284669',
    theme: '2',
    verify_theme: '',
  })
  if (clientId) {
    query.set('pt_3rd_aid', clientId)
  }
  return `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?${query.toString()}`
})

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function checkLogin() {
  if (!props.visible || !props.state || polling.value) {
    return
  }
  polling.value = true
  try {
    const result = await getQqLoginQrStatus(props.state)
    if (result.token) {
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
      qrError.value = '二维码生成失败，请关闭后重新发起授权'
    }
    return
  }

  if (currentGeneration !== generation || !props.visible) {
    return
  }

  await checkLogin()
  if (currentGeneration !== generation || !props.visible) {
    return
  }

  pollTimer = setInterval(() => {
    void checkLogin()
  }, 2000)
}

function close() {
  generation += 1
  stopPolling()
  loginMode.value = 'qr'
  emit('close')
}

function showPasswordLogin() {
  loginMode.value = 'password'
}

function showQrLogin() {
  loginMode.value = 'qr'
}

function openAuthorization() {
  if (!props.url.trim()) {
    return
  }
  const authorizationWindow = window.open(
    props.url,
    'TencentLogin',
    'width=450,height=640,menubar=0,scrollbars=1,resizable=1,status=1,titlebar=0,toolbar=0,location=1',
  )
  if (!authorizationWindow) {
    window.location.assign(props.url)
  }
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
    <div v-if="visible" class="auth-modal-wrap qq-authorization-modal-wrap" @click.self="close">
      <section class="auth-modal qq-authorization-modal" aria-label="QQ扫码登录">
        <header class="qq-authorization-modal__head">
          <div class="qq-authorization-modal__brand" aria-label="QQ互联">
            <img :src="qqConnectLogoImage" alt="QQ" />
          </div>
          <button class="qq-authorization-modal__close" type="button" aria-label="关闭QQ扫码登录"
            @click="close">
            ×
          </button>
        </header>

        <div class="qq-authorization-modal__layout">
          <section class="qq-authorization-modal__login-panel" aria-labelledby="qq-login-title">
            <template v-if="loginMode === 'qr'">
              <div class="qq-authorization-modal__title-block">
                <h3 id="qq-login-title">快捷登录</h3>
                <p>
                  使用<a href="http://im.qq.com/mobileqq/#from=login" target="_blank" rel="noreferrer">QQ手机版</a>扫码登录，或点击头像授权登录。
                </p>
              </div>

              <div class="qq-authorization-modal__options">
                <div class="qq-authorization-modal__option qq-authorization-modal__option--qr">
                  <div class="qq-authorization-modal__qr" aria-live="polite">
                    <img v-if="qrDataUrl" :src="qrDataUrl" alt="QQ扫码登录二维码" />
                    <span v-else>{{ qrError || '二维码生成中...' }}</span>
                  </div>
                </div>

                <div class="qq-authorization-modal__option qq-authorization-modal__option--avatar">
                  <button class="qq-authorization-modal__avatar" type="button" aria-label="点击QQ头像授权登录"
                    @click="openAuthorization">
                    <img :src="qqConnectPenguinImage" alt="QQ互联" />
                  </button>
                  <span class="qq-authorization-modal__option-label">QQ互联</span>
                </div>
              </div>

              <nav class="qq-authorization-modal__footer" aria-label="QQ登录选项">
                <a class="qq-authorization-modal__footer-link" href="#qq-password-login"
                  @click.prevent="showPasswordLogin">密码登录</a>
                <span class="qq-authorization-modal__footer-separator" aria-hidden="true">|</span>
                <a class="qq-authorization-modal__footer-link" href="https://ssl.ptlogin2.qq.com/j_newreg_url"
                  target="_blank" rel="noreferrer">注册账号</a>
                <span class="qq-authorization-modal__footer-separator" aria-hidden="true">|</span>
                <a class="qq-authorization-modal__footer-link"
                  href="https://support.qq.com/products/77942?customInfo=.appid101284669" target="_blank"
                  rel="noreferrer">意见反馈</a>
              </nav>
            </template>

            <div v-else id="qq-password-login" class="qq-password-login">
              <iframe class="qq-password-login__frame" :src="qqPasswordLoginUrl" title="QQ账号密码登录"
                width="407" height="331" frameborder="0" scrolling="no" />
              <button class="qq-password-login__back" type="button" @click="showQrLogin">返回快捷登录</button>
            </div>
          </section>

          <aside class="qq-authorization-modal__permissions" aria-label="QQ授权权限">
            <ul class="qq-authorization-modal__permission-list">
              <li class="qq-authorization-modal__permission-title">
                <span class="qq-authorization-modal__check qq-authorization-modal__check--active">✓</span>
                <span>全选</span>
                <p><a href="/" target="_blank" rel="noreferrer">73Info</a>将获取以下权限：</p>
              </li>
              <li class="qq-authorization-modal__permission-item">
                <span class="qq-authorization-modal__check qq-authorization-modal__check--muted">✓</span>
                <span>使用你的QQ头像、昵称信息</span>
              </li>
            </ul>
            <p class="qq-authorization-modal__agreement">
              授权即同意<a href="https://ti.qq.com/agreement/index.html" target="_blank"
                rel="noreferrer">服务协议</a>和<a
                href="https://rule.tencent.com/rule/preview/3fd52bde-6555-453b-9ab8-c5f1f3d22c62" target="_blank"
                rel="noreferrer">QQ隐私保护指引</a>
            </p>
          </aside>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.qq-authorization-modal-wrap {
  z-index: 1600;
}

.qq-authorization-modal {
  width: min(688px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 0;
  border: 1px solid #e3e3e3;
  border-radius: 2px;
  background: #fff;
  color: #555;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
}

.qq-authorization-modal__head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 47px;
  padding: 0 21px;
  border-bottom: 1px solid #f5f5f5;
}

.qq-authorization-modal__brand {
  display: inline-flex;
  align-items: center;
}

.qq-authorization-modal__brand img {
  width: 56px;
  height: 26px;
  object-fit: contain;
}

.qq-authorization-modal__close {
  position: absolute;
  top: 8px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: #a0a0a0;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 0;
}

.qq-authorization-modal__close:hover {
  color: #111;
}

.qq-authorization-modal__layout {
  display: grid;
  grid-template-columns: minmax(0, 433px) minmax(0, 227px);
  min-height: 365px;
}

.qq-authorization-modal__login-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  min-height: 365px;
  padding: 38px 0 22px;
  text-align: center;
}

.qq-authorization-modal__title-block h3 {
  margin: 0;
  color: #222;
  font-size: 24px;
  font-weight: 400;
  line-height: 1.2;
}

.qq-authorization-modal__title-block p {
  margin: 16px 0 0;
  color: #555;
  font-size: 14px;
  line-height: 20px;
}

.qq-authorization-modal__title-block a,
.qq-authorization-modal__permission-list a,
.qq-authorization-modal__agreement a {
  color: #2e77e5;
  text-decoration: none;
}

.qq-authorization-modal__title-block a:hover,
.qq-authorization-modal__permission-list a:hover,
.qq-authorization-modal__agreement a:hover {
  color: #2e77e5;
}

.qq-authorization-modal__options {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

.qq-authorization-modal__option {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100px;
  height: 120px;
}

.qq-authorization-modal__option--qr {
  width: 120px;
}

.qq-authorization-modal__qr,
.qq-authorization-modal__avatar {
  align-items: center;
  display: flex;
  justify-content: center;
  width: 120px;
  height: 120px;
  border: 0;
  background: transparent;
}

.qq-authorization-modal__qr {
  padding: 0;
}

.qq-authorization-modal__qr img {
  width: 120px;
  height: 120px;
}

.qq-authorization-modal__qr span {
  color: #a0a0a0;
  font-size: 12px;
  line-height: 16px;
}

.qq-authorization-modal__avatar {
  position: relative;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  background: transparent;
  cursor: pointer;
  outline: 0;
  text-decoration: none;
  transition: opacity 140ms ease;
}

.qq-authorization-modal__avatar:hover {
  opacity: 0.86;
}

.qq-authorization-modal__avatar img {
  width: 80px;
  height: 80px;
  margin: 0 auto;
  object-fit: contain;
}

.qq-authorization-modal__option-label {
  display: block;
  width: 100%;
  height: 20px;
  overflow: hidden;
  color: #a0a0a0;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qq-authorization-modal__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: auto;
  padding-top: 44px;
  color: #333;
  font-size: 14px;
  line-height: 20px;
}

.qq-authorization-modal__footer-link {
  display: inline-block;
  border: 0;
  background: transparent;
  color: #333;
  cursor: pointer;
  font-size: 14px;
  line-height: 20px;
  padding: 0 12px;
  text-decoration: none;
}

.qq-authorization-modal__footer-link:hover {
  color: #2e77e5;
}

.qq-authorization-modal__footer-separator {
  color: #e3e3e3;
}

.qq-password-login {
  display: flex;
  width: 100%;
  min-height: 365px;
  flex-direction: column;
  align-items: center;
  padding-top: 0;
}

.qq-password-login__frame {
  display: block;
  width: 407px;
  max-width: 100%;
  height: 331px;
  border: 0;
  background: #fff;
}

.qq-password-login__back {
  margin-top: 4px;
  border: 0;
  background: transparent;
  color: #2e77e5;
  cursor: pointer;
  font-size: 12px;
  line-height: 20px;
  padding: 0 8px;
}

.qq-password-login__back:hover {
  opacity: 0.8;
}

.qq-authorization-modal__permissions {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-width: 0;
  min-height: 298px;
  margin-top: 32px;
  padding: 76px 12px 0;
  border-left: 1px solid #f5f5f5;
  color: #666;
  font-size: 12px;
  line-height: 16px;
}

.qq-authorization-modal__permission-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.qq-authorization-modal__permission-title,
.qq-authorization-modal__permission-item {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  margin: 0;
  gap: 8px;
  color: #666;
  line-height: 16px;
}

.qq-authorization-modal__permission-title p {
  display: inline;
  margin: 0;
  white-space: nowrap;
}

.qq-authorization-modal__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
}

.qq-authorization-modal__check--active {
  background: #51b7ec;
}

.qq-authorization-modal__check--muted {
  background: #d0d0d0;
}

.qq-authorization-modal__agreement {
  margin: 1px 0 0;
  color: #666;
  font-size: 12px;
  line-height: 16px;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .qq-authorization-modal__layout {
    grid-template-columns: 1fr;
  }

  .qq-authorization-modal__login-panel {
    min-height: 365px;
    padding: 30px 16px 24px;
  }

  .qq-password-login {
    min-height: 365px;
  }

  .qq-password-login__frame {
    width: 100%;
  }

  .qq-authorization-modal__permissions {
    min-height: auto;
    margin-top: 0;
    padding: 24px 22px 30px;
    border-top: 1px solid #eeeeee;
    border-left: 0;
  }

  .qq-authorization-modal__options {
    gap: 12px;
  }

  .qq-authorization-modal__option {
    width: 100px;
  }

  .qq-authorization-modal__option--qr {
    width: 110px;
  }

  .qq-authorization-modal__qr {
    width: 110px;
    height: 110px;
  }

  .qq-authorization-modal__qr img {
    width: 110px;
    height: 110px;
  }

  .qq-authorization-modal__avatar img {
    width: 80px;
    height: 80px;
  }

  .qq-authorization-modal__agreement,
  .qq-authorization-modal__permission-title p {
    white-space: normal;
  }
}
</style>
