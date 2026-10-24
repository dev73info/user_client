import { computed, ref, type Ref } from 'vue'

import { sendProfileTwoFactorCode, updateProfileTwoFactor } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 两步验证域：`TwoFactorDialog` 的开关目标值、验证码、可见性与提交。
 *
 * 为什么和「登录凭证那三个弹窗」分开（`useAccountSecuritySettings`）：这个弹窗多一个**目标态**
 * ——开关拨到哪、和已保存的值是否不同，决定了发码与保存能不能点；拨开时还要顺手自动发一次码并
 * 清掉旧验证码。这些判断只属于它，摊进那个域里会把两个 composable 都顶过 300 行预算。
 *
 * 注入的只有 `profileEmail`：未绑邮箱时改了也收不到验证码，发码与保存都要拦在门口。
 */
export type AccountTwoFactorSettingsOptions = {
  /** 当前绑定邮箱（空串 = 未绑定）：`emailBound` 与弹窗里那句邮箱文案都读它。 */
  profileEmail: Ref<string>
}

export function useAccountTwoFactorSettings(options: AccountTwoFactorSettingsOptions) {
  const auth = useAuthStore()

  const twoFactorEnabled = ref(false)
  const twoFactorTargetEnabled = ref(false)
  const twoFactorCode = ref('')
  const twoFactorCodeSending = ref(false)
  const twoFactorLoading = ref(false)
  const twoFactorDialogVisible = ref(false)

  /** 弹窗里「验证方式」那一行显示的邮箱（未绑定时说明为什么点不动）。 */
  const accountEmailLabel = computed(() => options.profileEmail.value || '未绑定邮箱')
  /** 目标值 ≠ 已保存值：没变化时发码与保存都拦下来。 */
  const twoFactorChanged = computed(() => twoFactorTargetEnabled.value !== twoFactorEnabled.value)

  /** 用 profile 里的真值刷新两个开关位（`loadProfile` 与保存成功后都走这里）。 */
  function applyTwoFactor(enabled: boolean) {
    twoFactorEnabled.value = enabled
    twoFactorTargetEnabled.value = enabled
  }

  /** 发码：验证码发到当前绑定邮箱，未绑邮箱 / 设置没变化都拦在发码之前。 */
  async function sendTwoFactorVerificationCode() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后修改两步验证')
      return
    }
    if (!options.profileEmail.value) {
      TMessage.error('请先绑定邮箱后再修改两步验证')
      return
    }
    if (!twoFactorChanged.value) {
      TMessage.info('两步验证设置未发生变化')
      return
    }
    twoFactorCodeSending.value = true
    try {
      await sendProfileTwoFactorCode(auth.token)
      TMessage.success('验证码已发送到当前绑定邮箱，请查收')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发送两步验证验证码失败')
    } finally {
      twoFactorCodeSending.value = false
    }
  }

  /// 拨动「邮箱验证码保护」开关：`enabled` 是新勾选状态（由弹窗从 change 事件里取出来回传）。
  /// 第一次打开时顺手发一次验证码，并把上一次填的验证码清掉。
  async function handleTwoFactorTargetChange(enabled: boolean) {
    twoFactorTargetEnabled.value = enabled
    twoFactorCode.value = ''

    if (enabled && !twoFactorEnabled.value && !twoFactorCodeSending.value) {
      await sendTwoFactorVerificationCode()
    }
  }

  /** 保存：把开关目标值与验证码一起提交，成功后同步 `auth` 里那份 profile。 */
  async function submitTwoFactorChange() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后修改两步验证')
      return
    }
    if (!options.profileEmail.value) {
      TMessage.error('请先绑定邮箱后再修改两步验证')
      return
    }
    if (!twoFactorChanged.value) {
      TMessage.info('两步验证设置未发生变化')
      return
    }
    const trimmedCode = twoFactorCode.value.trim()
    if (trimmedCode.length !== 6) {
      TMessage.error('请输入 6 位邮箱验证码')
      return
    }
    twoFactorLoading.value = true
    try {
      const profile = await updateProfileTwoFactor(
        auth.token,
        twoFactorTargetEnabled.value,
        trimmedCode,
      )
      applyTwoFactor(profile.two_factor_enabled)
      twoFactorCode.value = ''
      await auth.fetchProfile(true).catch(() => undefined)
      TMessage.success(twoFactorEnabled.value ? '两步验证已开启' : '两步验证已关闭')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '更新两步验证失败')
    } finally {
      twoFactorLoading.value = false
    }
  }

  return {
    twoFactorEnabled,
    twoFactorTargetEnabled,
    twoFactorCode,
    twoFactorCodeSending,
    twoFactorLoading,
    twoFactorDialogVisible,
    accountEmailLabel,
    twoFactorChanged,
    applyTwoFactor,
    sendTwoFactorVerificationCode,
    handleTwoFactorTargetChange,
    submitTwoFactorChange,
  }
}
