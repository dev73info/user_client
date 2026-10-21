import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { HttpError } from '@/api/http'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import {
  realnameEntryCopy as buildEntryCopy,
  realnameStatusText,
  realnameStatusTone,
  realnameSubjectLabel,
} from '@/shared/realnameDisplay'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 实名身份域：**全页唯一一份** `current`（实名记录）与它的加载、回填、派生状态，
 * 外加「变更主体」模式的开关与入口卡文案。
 *
 * `current` 由本 composable 持有，视图拿返回值注入给另外两个域（`useFaceidChallenge`
 * 的 `realname`、`useSettlementAccount` 的 `realname`）——同一个 `ref` 传三处，
 * 就是「全页只有一份实例」；不注入而是各请求一遍的话，hero / 入口卡 / 结算会各看各的。
 *
 * 三件**不**在这里的事：
 * 1. `redirect_to` 回跳要 `router`，看着像路由域，但它只在「实名通过」时才需要回跳，
 *    跟着状态走才不会出现「状态没变却跳走」。所以它在这里，视图不再碰 router 做这件事；
 * 2. 表单回填（`prefill`）由草稿域注入，本层只管什么时候调；
 * 3. 弹窗可见性归视图——`watch(realnameDialogVisible)`（关闭即丢弃变更草稿）必须留在视图。
 */
export type RealnameIdentityOptions = {
  /** 实名记录落地时回填表单（`useRealnameFormDraft().prefill`）。 */
  prefillForm: (record: UserRealnameVerification) => void
}

export function useRealnameIdentity(options: RealnameIdentityOptions) {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const current = ref<UserRealnameVerification | null>(null)
  // 已通过认证后，只有进入「变更主体」模式才解锁表单，用新主体重新认证一遍。
  const realnameChangeMode = ref(false)

  /**
   * 认证通过后要回跳的业务页：只接受站内绝对路径（`//host` 与外部 URL 一律丢弃），
   * 指向 `/realname` 本身的也忽略——那就是本页。
   */
  const redirectTarget = computed(() => {
    const raw = typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''
    if (!raw || raw === '/realname') {
      return ''
    }

    if (!raw.startsWith('/') || raw.startsWith('//')) {
      return ''
    }

    return raw
  })

  const statusText = computed(() => realnameStatusText(current.value?.status))
  const statusTone = computed(() => realnameStatusTone(current.value?.status))

  const realnameApproved = computed(() => current.value?.status === 'approved')
  const realnameRejected = computed(() => current.value?.status === 'rejected')
  const realnamePending = computed(() => current.value?.status === 'pending')
  // 当前认证主体是否为「企业」（用于爱签账户管理按身份区分功能）
  const assignEnterprise = computed(
    () =>
      current.value?.auth_type === 'ENTERPRISE' || current.value?.auth_type === 'SOLE_PROPRIETOR',
  )
  // 已通过且已点「变更主体」：表单解锁，填的是新主体。
  const realnameChanging = computed(() => realnameApproved.value && realnameChangeMode.value)
  const realnameLocked = computed(
    () =>
      current.value?.status === 'pending' || (realnameApproved.value && !realnameChangeMode.value),
  )
  // 本行带着上一份主体的快照：撤回在这个状态下是「取消主体变更、还原原主体」，
  // 而不是把账号退回「未提交」。
  const realnameChangeBacked = computed(() => Boolean(current.value?.changing_subject))
  // 有东西可撤：认证/审核中，或主体变更被驳回后仍可撤回还原成原主体。
  const realnameCanWithdraw = computed(
    () => realnamePending.value || (realnameRejected.value && realnameChangeBacked.value),
  )
  // 当前生效主体的一句话描述，用于「变更认证类型」提示用户换掉的是哪一份资料。
  const currentSubjectLabel = computed(() => realnameSubjectLabel(current.value))
  // 实名认证入口的文案：按当前状态说清点进去能做什么。
  const realnameEntryCopy = computed(() => buildEntryCopy(current.value))

  /**
   * 实名记录落地：状态、表单回填一起做。
   *
   * 人脸核身域里的查询 / 撤回也会走这里（以回调注入 composable），所以两件事必须同进同退——
   * 少做一件就会出现「状态已通过、表单还是旧主体」这类错位。服务端数据一落地，
   * 表单就不再是「变更主体」草稿态（变更已提交或已取消），所以这里顺手关掉那个模式。
   */
  function applyRealnameRecord(record: UserRealnameVerification) {
    current.value = record
    realnameChangeMode.value = false
    options.prefillForm(record)
  }

  /** 撤回后回到「未提交」：记录清空（表单复位由视图接线，见其内注释）。 */
  function clearCurrent() {
    current.value = null
  }

  /**
   * 只有已通过才自动回跳业务页：审核中需要停留，让用户看到提示与撤回入口。
   * 传入记录时按传入的那份判断（刚提交 / 刚查到的结果可能比 `current` 新）。
   */
  async function tryRestoreBusinessPage(record?: UserRealnameVerification | null) {
    const target = redirectTarget.value
    if (!target) {
      return
    }

    const status = record?.status ?? current.value?.status
    if (status !== 'approved') {
      return
    }

    await router.replace(target)
  }

  /** 拉当前实名记录：没有记录（404）是正常状态，静默留在「未提交」。 */
  async function loadCurrentRealname() {
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }

    try {
      const record = await getMyRealnameVerification(auth.token)
      applyRealnameRecord(record)
      await tryRestoreBusinessPage(record)
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return
      }

      TMessage.error(err instanceof Error ? err.message : '加载实名认证状态失败')
    }
  }

  /** 进入「变更主体」模式（表单解锁与字段清空由视图接线：它还要读草稿域与两个弹窗）。 */
  function startChangeMode() {
    realnameChangeMode.value = true
  }

  /** 退出「变更主体」模式（放弃变更 / 关掉弹窗都走到这儿）。 */
  function exitChangeMode() {
    realnameChangeMode.value = false
  }

  return {
    current,
    redirectTarget,
    statusText,
    statusTone,
    realnameApproved,
    realnameRejected,
    realnamePending,
    realnameChanging,
    realnameLocked,
    realnameChangeBacked,
    realnameCanWithdraw,
    realnameChangeMode,
    assignEnterprise,
    currentSubjectLabel,
    realnameEntryCopy,
    applyRealnameRecord,
    clearCurrent,
    tryRestoreBusinessPage,
    loadCurrentRealname,
    startChangeMode,
    exitChangeMode,
  }
}
