import { computed, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { ContractDetail } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'
import {
  agreementRedirectKey,
  API_USAGE_AGREEMENT_REDIRECT_KEY,
  clearSessionValue,
  DEVELOPER_AGREEMENT_REDIRECT_KEY,
  normalizeRedirectTarget,
  readSessionValue,
  requirementSignReturnTarget as resolveRequirementSignReturnTarget,
  REQUIREMENT_SIGN_FROM_KEY,
  REQUIREMENT_SIGN_PENDING_RETURN_KEY,
  writeSessionValue,
} from '@/shared/contractSignRedirect'

/**
 * 合同签署页的**路由身份与回跳**（R047 从 `ContractSignView` 迁出）。
 *
 * 三个入口共用同一个视图：工作台签署详情（`workbench-signature-detail`）、
 * 需求合同（`/contract-sign?requirement_id=`）、平台内置协议（`?agreement=developer|api`）。
 * 入口决定标题、回跳目标与「签署完成后去哪」，全部收敛在这里。
 */
type UseContractSignNavigationOptions = {
  contract: Ref<ContractDetail | null>
  /** 离开签署页前先停掉轮询（轮询本身在 `useContractSignPolling`）。 */
  stopPolling: () => void
}

export function useContractSignNavigation(options: UseContractSignNavigationOptions) {
  const route = useRoute()
  const router = useRouter()

  const requirementId = String(route.query.requirement_id ?? '')
  /** 工作台签署详情路由上的合同 id（`/workbench/signatures/:contractId`）。 */
  const contractId = Number(route.params.contractId ?? 0)
  const isWorkbenchSignature = computed(() => route.name === 'workbench-signature-detail')
  const isDeveloperAgreement = computed(
    () =>
      route.query.agreement === 'developer' ||
      options.contract.value?.template_name === 'developer_agreement',
  )
  const isApiUsageAgreement = computed(
    () =>
      route.query.agreement === 'api' ||
      options.contract.value?.template_name === 'api_usage_agreement',
  )
  /** 平台与用户之间的内置协议：平台为甲方、用户为乙方，没有需求编号，也没有自定义附件。 */
  const isPlatformAgreement = computed(
    () => isDeveloperAgreement.value || isApiUsageAgreement.value,
  )

  const redirectTarget = computed(() => {
    const queryTarget = normalizeRedirectTarget(route.query.redirect_to)
    if (queryTarget) {
      return queryTarget
    }
    return normalizeRedirectTarget(
      readSessionValue(agreementRedirectKey(isApiUsageAgreement.value)),
    )
  })

  function rememberRedirectTarget() {
    const target = normalizeRedirectTarget(route.query.redirect_to)
    if (!target) {
      return
    }
    writeSessionValue(agreementRedirectKey(isApiUsageAgreement.value), target)
  }

  function clearRememberedRedirectTarget() {
    clearSessionValue(DEVELOPER_AGREEMENT_REDIRECT_KEY)
    clearSessionValue(API_USAGE_AGREEMENT_REDIRECT_KEY)
  }

  function rememberRequirementSignContext() {
    if (isWorkbenchSignature.value || isPlatformAgreement.value) {
      return
    }
    const from = typeof route.query.from === 'string' ? route.query.from.trim() : ''
    if (from === 'user' || from === 'dev') {
      writeSessionValue(REQUIREMENT_SIGN_FROM_KEY, from)
    }
  }

  function markRequirementSignPendingReturn() {
    writeSessionValue(REQUIREMENT_SIGN_PENDING_RETURN_KEY, '1')
  }

  function clearRequirementSignPendingReturn() {
    clearSessionValue(REQUIREMENT_SIGN_PENDING_RETURN_KEY)
  }

  function requirementSignReturnTarget(): string | { name: string } {
    return resolveRequirementSignReturnTarget({
      queryRedirectTo: route.query.redirect_to,
      rememberedRedirect: redirectTarget.value,
      queryFrom: route.query.from,
      sessionFrom: readSessionValue(REQUIREMENT_SIGN_FROM_KEY),
      isWorkbenchSignature: isWorkbenchSignature.value,
    })
  }

  /** 签署完成（本地已是「已签约 2」）后的去向：入驻协议与需求合同分流。 */
  function continueAfterSignCompleted() {
    if (options.contract.value?.status !== CONTRACT_STATUS.signed) {
      return
    }

    if (isPlatformAgreement.value) {
      if (isWorkbenchSignature.value) {
        return
      }
      options.stopPolling()
      // 平台协议签署完成后回到来源页；来源丢失时，入驻协议回收益钱包，接口协议回接口资源创建页。
      const target =
        redirectTarget.value ||
        (isApiUsageAgreement.value ? { name: 'dev-plugins-api' } : { name: 'dev-wallet' })
      clearRememberedRedirectTarget()
      void router.replace(target)
      return
    }

    // 需求合同：只有「刚从爱签签署流程回来」才自动离开。
    // 主动打开已签合同详情（我的合同 / 查看合同回退）时不要踢走。
    if (readSessionValue(REQUIREMENT_SIGN_PENDING_RETURN_KEY) !== '1') {
      return
    }

    options.stopPolling()
    clearRequirementSignPendingReturn()
    clearSessionValue(REQUIREMENT_SIGN_FROM_KEY)
    clearRememberedRedirectTarget()
    void router.replace(requirementSignReturnTarget())
  }

  /** 缺需求编号的需求合同入口没有可签的东西，回工作台首页。 */
  function goHome() {
    void router.replace('/')
  }

  /** 返回上一层级：优先浏览器历史回退，无历史时回工作台。 */
  function goBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }
    if (isWorkbenchSignature.value) {
      router.push({ name: 'workbench-signatures' })
      return
    }
    if (isPlatformAgreement.value) {
      router.push({ name: 'workbench' })
      return
    }
    router.push({ name: 'workbench-requirements' })
  }

  /** 未实名认证时引导用户去完成实名认证，认证通过后回到签署页。 */
  function goRealname() {
    void router.push({
      name: 'workbench-realname',
      query: { redirect_to: route.fullPath },
    })
  }

  function goBecomeDeveloper() {
    // 跳转到开发者资源初始化入口路由（devArea + requiresDevAccess + requiresRealname），
    // 触发 dev 路由守卫中的 ensureDevAccess → requestDevRole，从而授予开发者角色并刷新 profile。
    // ⚠️ 不能直接跳 /workbench#developer-overview：它只匹配 workbench 路由，
    //    不会触发 dev 守卫，开发者角色申请不会执行，前端 profile 会停留在旧角色。
    // ⚠️ 也不能跳 dev-overview（开发概览）：该页面已废弃，开发者入口应指向资源初始化。
    const target = redirectTarget.value || { name: 'dev-plugins' }
    clearRememberedRedirectTarget()
    void router.replace(target)
  }

  return {
    requirementId,
    contractId,
    isWorkbenchSignature,
    isDeveloperAgreement,
    isApiUsageAgreement,
    isPlatformAgreement,
    redirectTarget,
    rememberRedirectTarget,
    clearRememberedRedirectTarget,
    rememberRequirementSignContext,
    markRequirementSignPendingReturn,
    clearRequirementSignPendingReturn,
    requirementSignReturnTarget,
    continueAfterSignCompleted,
    goHome,
    goBack,
    goRealname,
    goBecomeDeveloper,
  }
}
