import { ref, type Ref } from 'vue'

import {
  getProfile,
  sendProfileEmailChangeCode,
  sendProfilePasswordCode,
  updateProfileEmail,
  updateProfilePassword,
} from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 安全设置域（「登录凭证」两个弹窗）：邮箱 / 密码的草稿、验证码、可见性与提交，
 * 外加 profile 那份初值的加载。
 *
 * **没有「改用户名」**：契约 `UpdateProfileRequest` 不接受自助改登录名（传与当前不同的值一律 400），
 * 改登录名走管理端 `POST /auth/users/username`，所以那条弹窗与动作已删。
 *
 * 两步验证不在这里，见 `useAccountTwoFactorSettings`：它多一份「开关目标值」，拨动时要自动发码，
 * 两块放一个文件都会顶过 300 行预算。
 *
 * 弹窗组件（`components/account/*Dialog.vue`）只 emit：`update:*` 把值落到本域，`submit` /
 * `send-code` 调本域的动作，与拆分前视图里那套一一对应，文案与校验顺序逐字未改。
 *
 * 两件事**故意留在外面**：`profileEmail` 的正本（两步验证域也要读，由调用方持有、本域只写）、
 * `wechatBound` 的落地（归第三方绑定域，正本是 `GET /auth/providers`，档案里没有这个字段）。
 */
export type AccountSecuritySettingsOptions = {
  /** 当前绑定邮箱的**正本**（两步验证域也要读，所以由调用方持有，本域只写）。 */
  profileEmail: Ref<string>
  /** 把 profile 里带出来的两步验证初始开关交给两步验证域（两个开关位一起置）。 */
  applyTwoFactor: (enabled: boolean) => void
}

export function useAccountSecuritySettings(options: AccountSecuritySettingsOptions) {
  const auth = useAuthStore()
  const { profileEmail } = options

  const newEmail = ref('')
  const emailCode = ref('')
  const emailCodeSending = ref(false)
  const emailLoading = ref(false)
  const oldPassword = ref('')
  const newPassword = ref('')
  const confirmPassword = ref('')
  const passwordCode = ref('')
  const passwordCodeSending = ref(false)
  const passwordLoading = ref(false)

  // 三个弹窗的可见性由本域持有，视图只把 `v-model:visible` 接上
  const emailDialogVisible = ref(false)
  const passwordDialogVisible = ref(false)

  /** 拉一次个人资料：三个弹窗的初值（用户名 / 邮箱）都从这里回填。 */
  async function loadProfile() {
    auth.hydrate()
    if (!auth.isAuthed) {
      return
    }
    try {
      const profile = await getProfile(auth.token)
      profileEmail.value = profile.email ?? ''
      options.applyTwoFactor(profile.two_factor_enabled)
      if (!newEmail.value) {
        newEmail.value = profile.email ?? ''
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载个人资料失败')
    }
  }

  /** 两处「发验证码」共用的形状：置加载位 → 调接口 → 成功提示；失败统一报错，加载位一定落下。 */
  async function sendCode(
    loading: Ref<boolean>,
    send: () => Promise<unknown>,
    success: string,
    fallback: string,
  ) {
    loading.value = true
    try {
      await send()
      TMessage.success(success)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : fallback)
    } finally {
      loading.value = false
    }
  }

  /** 邮箱第一步：验证码发到**新**邮箱（所以先拦「和当前邮箱相同」）。 */
  function sendEmailVerificationCode() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后修改邮箱')
      return
    }
    const trimmed = newEmail.value.trim()
    if (!trimmed) {
      TMessage.error('请输入新的邮箱地址')
      return
    }
    if (trimmed === profileEmail.value) {
      TMessage.warning('新邮箱不能与当前邮箱相同')
      return
    }
    return sendCode(
      emailCodeSending,
      () => sendProfileEmailChangeCode(auth.token, trimmed),
      '验证码已发送到新邮箱，请查收',
      '发送邮箱验证码失败',
    )
  }

  /** 邮箱第二步：新邮箱 + 6 位验证码一起提交。 */
  async function submitEmailChange() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后修改邮箱')
      return
    }
    const trimmedEmail = newEmail.value.trim()
    const trimmedCode = emailCode.value.trim()
    if (!trimmedEmail) {
      TMessage.error('请输入新的邮箱地址')
      return
    }
    if (trimmedCode.length !== 6) {
      TMessage.error('请输入 6 位邮箱验证码')
      return
    }
    emailLoading.value = true
    try {
      const profile = await updateProfileEmail(auth.token, trimmedEmail, trimmedCode)
      profileEmail.value = profile.email ?? ''
      newEmail.value = profile.email ?? ''
      emailCode.value = ''
      TMessage.success('邮箱已更新')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '修改邮箱失败')
    } finally {
      emailLoading.value = false
    }
  }

  /** 改密码第一步：验证码只能发到**已绑定**的邮箱，没绑就直说。 */
  function sendPasswordVerificationCode() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后修改密码')
      return
    }
    if (!profileEmail.value) {
      TMessage.error('请先绑定邮箱后再修改密码')
      return
    }
    return sendCode(
      passwordCodeSending,
      () => sendProfilePasswordCode(auth.token),
      '验证码已发送到当前绑定邮箱，请查收',
      '发送密码验证码失败',
    )
  }

  /** 改密码第二步：长度、两次一致、6 位验证码三道校验，顺序与提示原样保留。 */
  async function submitPasswordChange() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后修改密码')
      return
    }
    const trimmedOld = oldPassword.value.trim()
    const trimmedPassword = newPassword.value.trim()
    const trimmedConfirm = confirmPassword.value.trim()
    const trimmedCode = passwordCode.value.trim()
    if (!trimmedOld) {
      TMessage.error('请输入当前密码')
      return
    }
    if (trimmedPassword.length < 6) {
      TMessage.error('新密码至少 6 位')
      return
    }
    if (trimmedPassword !== trimmedConfirm) {
      TMessage.error('两次输入的新密码不一致')
      return
    }
    if (trimmedCode.length !== 6) {
      TMessage.error('请输入 6 位邮箱验证码')
      return
    }
    passwordLoading.value = true
    try {
      // 契约 `UpdatePasswordRequest` 要三个字段：旧密码 + 新密码（都 md5）+ 邮箱验证码
      await updateProfilePassword(auth.token, trimmedOld, trimmedPassword, trimmedCode)
      oldPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      passwordCode.value = ''
      passwordDialogVisible.value = false
      auth.logout()
      TMessage.success('密码已更新，请使用新密码登录')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      passwordLoading.value = false
    }
  }

  return {
    newEmail,
    emailCode,
    emailCodeSending,
    emailLoading,
    oldPassword,
    newPassword,
    confirmPassword,
    passwordCode,
    passwordCodeSending,
    passwordLoading,
    emailDialogVisible,
    passwordDialogVisible,
    loadProfile,
    sendEmailVerificationCode,
    submitEmailChange,
    sendPasswordVerificationCode,
    submitPasswordChange,
  }
}
