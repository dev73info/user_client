import { onScopeDispose, ref, watch, type Ref } from 'vue'
import QRCode from 'qrcode'

import {
  completeAsignIdentify,
  getMyRealnameVerification,
  resumeAsignIdentify,
  resumeCompanyAsignIdentify,
  withdrawMyRealnameVerification,
  type RealnameAuthType,
  type UserRealnameVerification,
} from '@/api/realname'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 人脸核身（爱签 challenge）域：发起、轮询、查询、恢复、撤回。
 *
 * 三条硬约束，都是测绘时标出的风险点：
 * 1. 轮询定时器以前是模块级 `let`，只在 `onBeforeUnmount` 与关弹窗时停。搬进来后绑到
 *    **`onScopeDispose`**，作用域销毁（= 视图卸载）即清定时器，不会再漏；
 * 2. `faceidAuthUrl` 出现时原本会顺手关掉实名弹窗——那是两个弹窗的可见性耦合，**上提到视图**，
 *    这里只管「要不要开始轮询」；
 * 3. 撤回成功后要复位实名表单与两个弹窗的可见性，同样在视图：这里只调注入的回调。
 *
 * 「发起认证」(`startWechatFaceid` / `startEnterpriseAsign`) 留在视图：它们读的是实名表单
 * 与校验结果，属于提交实名认证那条线，到这里只需调 `beginChallenge(authUrl)` 交出核身链接。
 * 弹窗模板在 `components/account/FaceidDialog.vue`，组件里只 emit。
 */
export type FaceidChallengeOptions = {
  /** 当前实名记录（跨块共用，注入）。 */
  realname: Ref<UserRealnameVerification | null>
  /** 实名记录落地：回写 `current`、清头像失败标记、回填表单（视图那边三件事一起做）。 */
  applyRecord: (record: UserRealnameVerification) => void
  /** 撤回后回到「未提交」：`current` 置空、表单复位成可编辑态。 */
  clearRecord: () => void
  /** 当前表单的认证类型：决定续发企业还是个人的二维码。 */
  formAuthType: () => RealnameAuthType
  /** 认证通过后按 `redirect_to` 回跳业务页（视图那边有路由）。 */
  restoreBusinessPage: (record: UserRealnameVerification) => Promise<void>
  /** 撤回成功后处理两个弹窗的可见性（关核身、开实名表单）。 */
  afterWithdraw: (restored: boolean) => void
}

type FaceidCheckOptions = {
  background?: boolean
  silent?: boolean
}

const FACEID_POLL_INTERVAL_MS = 10_000

export function useFaceidChallenge(options: FaceidChallengeOptions) {
  const auth = useAuthStore()

  const faceidAuthUrl = ref('')
  const faceidQrDataUrl = ref('')
  const faceidStarting = ref(false)
  const faceidChecking = ref(false)
  const faceidRestoring = ref(false)
  const withdrawing = ref(false)
  let faceidPollTimer: number | null = null
  let faceidCheckInFlight = false

  /** 二维码必须真白底 + 深模块，套主题色手机会扫不出来。 */
  async function renderFaceidQrCode(url: string) {
    faceidQrDataUrl.value = await QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
  }

  function stopFaceidAutoPolling() {
    if (faceidPollTimer === null) {
      return
    }
    window.clearInterval(faceidPollTimer)
    faceidPollTimer = null
  }

  function startFaceidAutoPolling() {
    stopFaceidAutoPolling()
    if (!faceidAuthUrl.value || options.realname.value?.status === 'approved') {
      return
    }
    faceidPollTimer = window.setInterval(() => {
      void checkWechatFaceidResult({ background: true, silent: true })
    }, FACEID_POLL_INTERVAL_MS)
  }

  function clearFaceidChallenge() {
    stopFaceidAutoPolling()
    faceidAuthUrl.value = ''
    faceidQrDataUrl.value = ''
  }

  function openWechatFaceidPage() {
    if (!faceidAuthUrl.value) {
      return
    }
    window.open(faceidAuthUrl.value, '_blank', 'noopener,noreferrer')
  }

  /** 拿到核身链接：出二维码，轮询由下面那条 watch 统一开始。 */
  async function beginChallenge(authUrl: string) {
    faceidAuthUrl.value = authUrl
    await renderFaceidQrCode(authUrl)
  }

  async function checkWechatFaceidResult(check: FaceidCheckOptions = {}) {
    if (faceidCheckInFlight) {
      return
    }
    auth.hydrate()
    if (!auth.token.trim()) {
      stopFaceidAutoPolling()
      if (!check.silent) {
        TMessage.error('登录状态已失效，请重新登录')
      }
      return
    }

    faceidCheckInFlight = true
    if (!check.background) {
      faceidChecking.value = true
    }
    // 记下调用前的状态：只有「本次真的从处理中变成已通过」才值得弹提示。
    const previousStatus = options.realname.value?.status ?? null
    try {
      const updated = await completeAsignIdentify(auth.token)
      if (check.background && updated.status === 'rejected') {
        return
      }
      options.applyRecord(updated)
      if (updated.status === 'approved') {
        clearFaceidChallenge()
        // 静默轮询（进页面、回跳、后台定时）每次都弹会变成噪音：只在状态真的发生转变、
        // 且不是静默调用时提示。
        if (previousStatus === 'pending' && !check.silent) {
          TMessage.success('爱签实名认证已通过')
        }
        await options.restoreBusinessPage(updated)
      } else if (updated.status === 'rejected') {
        clearFaceidChallenge()
        if (previousStatus === 'pending') {
          TMessage.error(updated.review_note || '爱签实名认证未通过')
        }
      } else if (!check.silent) {
        // 结果仍为处理中：如实提示，避免误导为「已更新」
        if (faceidAuthUrl.value) {
          TMessage.warning('认证仍在处理中，请先完成人脸核身后再查询')
        } else {
          TMessage.warning('实名认证正在处理中，请稍后查询结果')
        }
      }
    } catch (err) {
      if (!check.silent) {
        TMessage.error(err instanceof Error ? err.message : '查询爱签实名认证结果失败')
      }
    } finally {
      faceidCheckInFlight = false
      if (!check.background) {
        faceidChecking.value = false
      }
    }
  }

  async function resumeFaceid() {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    faceidRestoring.value = true
    try {
      const result = await resumeAsignIdentify(auth.token)
      if (result.manual_review || !result.auth_url) {
        // 非大陆证件走人工审核，无需二维码
        TMessage.success('个人实名认证已提交，等待管理员审核')
        return
      }
      await beginChallenge(result.auth_url)
      TMessage.success('认证二维码已恢复，请继续完成人脸核身')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '恢复实名认证二维码失败')
    } finally {
      faceidRestoring.value = false
    }
  }

  async function resumeEnterpriseFaceid() {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    faceidRestoring.value = true
    try {
      const result = await resumeCompanyAsignIdentify(auth.token)
      await beginChallenge(result.auth_url)
      TMessage.success('企业认证二维码已恢复，请继续完成认证')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '恢复企业认证二维码失败')
    } finally {
      faceidRestoring.value = false
    }
  }

  async function restoreFaceidChallengeIfNeeded() {
    // 刷新页面后：爱签认证链接仅存于内存，会丢失。
    if (options.realname.value?.status !== 'pending') return
    if (faceidAuthUrl.value) return
    const authType = options.formAuthType()
    // 企业与个体工商户都走企业认证链接。
    if (authType === 'ENTERPRISE' || authType === 'SOLE_PROPRIETOR') {
      await resumeEnterpriseFaceid()
      return
    }
    // 个人：仅大陆身份证（走爱签扫码人脸核身）
    if (authType !== 'IDENTITY_CARD') return
    // 流水号在后端，这里直接静默问一次结果；没有进行中的记录会静默失败，不影响续发。
    await checkWechatFaceidResult({ silent: true })
    // 查询后状态可能已更新（通过/驳回），此时无需再续发
    if (options.realname.value?.status !== 'pending' || faceidAuthUrl.value) return
    await resumeFaceid()
  }

  async function handleWithdraw() {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    withdrawing.value = true
    try {
      const result = await withdrawMyRealnameVerification(auth.token)
      clearFaceidChallenge()
      if (result.restored) {
        // 取消主体变更：后端已把账号还原成变更前那份主体，这里只需刷新回「已通过」。
        options.applyRecord(await getMyRealnameVerification(auth.token))
        options.afterWithdraw(true)
        TMessage.success('已取消主体变更，账号还原为变更前的实名主体')
        return
      }
      options.clearRecord()
      options.afterWithdraw(false)
      TMessage.success('已撤回实名认证，可重新提交')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '撤回实名认证失败')
    } finally {
      withdrawing.value = false
    }
  }

  /** 核身链接一变就调轮询：有链接开始、没链接停。弹窗可见性归视图（见文件头第 2 条）。 */
  watch(faceidAuthUrl, (url) => {
    if (url) {
      startFaceidAutoPolling()
      return
    }
    stopFaceidAutoPolling()
  })

  // 定时器绑作用域：视图卸载即清，不依赖任何人记得调 stopFaceidAutoPolling
  onScopeDispose(() => {
    stopFaceidAutoPolling()
  })

  return {
    faceidAuthUrl,
    faceidQrDataUrl,
    faceidStarting,
    faceidChecking,
    faceidRestoring,
    withdrawing,
    beginChallenge,
    checkWechatFaceidResult,
    resumeFaceid,
    resumeEnterpriseFaceid,
    restoreFaceidChallengeIfNeeded,
    handleWithdraw,
    clearFaceidChallenge,
    openWechatFaceidPage,
    stopFaceidAutoPolling,
  }
}
