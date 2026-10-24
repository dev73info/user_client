import { ref, type Ref } from 'vue'

import {
  getMyRealnameVerification,
  startAsignIdentify,
  startCompanyAsignIdentify,
  submitMyRealnameVerification,
  type StartAsignIdentifyPayload,
  type StartCompanyIdentifyPayload,
  type SubmitRealnameVerificationPayload,
  type UserRealnameVerification,
} from '@/api/realname'
import type { RealnameDraftFields } from '@/shared/realnameForm'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 提交实名认证域：三个提交口（个人走爱签人脸核身、企业走爱签企业实名、个体工商户直接提交）
 * 与它们共用的加载位。
 *
 * 为什么它单独成域：视图里只要还剩一次 `@/api/realname` 的调用，`api-deps` 那 4 个模块
 * （auth / settings / realname / asignAccount）就降不到 3 —— 材料域搬走之后，剩下的正是这三口。
 *
 * 分工：
 * - **校验与载荷**在草稿域（`validate` / `buildPayload` / 表单实例都是注入的），本层不重写规则；
 * - **发起核身**由核身域做（`beginChallenge`：出二维码 + 起轮询），这里只把链接交过去；
 * - **记录落地**由身份域做（`applyRecord`：状态 + 表单回填 + 关掉变更模式），
 *   **回跳业务页**也在身份域（`restoreBusinessPage`：它读 `redirect_to`，路由在那边）。
 *
 * 三口的判断顺序逐字沿用拆分前：`submitRealname` 先按认证类型分流，再轮到「审核中不能改」，
 * 最后才是通用提交——分流放后面会让个人主体的核身被企业那条锁判定挡掉。
 */
export type RealnameSubmitOptions = {
  /** 表单草稿（与草稿域同一份实例）：发起认证要读姓名 / 证件号 / 企业进件资料。 */
  form: RealnameDraftFields
  /** 提交前校验：返回要提示给用户的那句话，空串表示可以提交。 */
  validate: () => string
  /** 个体工商户的提交载荷组装。 */
  buildPayload: () => SubmitRealnameVerificationPayload
  identityCardSelected: Ref<boolean>
  enterpriseSelected: Ref<boolean>
  /** 14~18 周岁：个人认证要带监护人同意与同意书。 */
  isMinor14To18: Ref<boolean>
  approved: Ref<boolean>
  rejected: Ref<boolean>
  /** 只读态（审核中 / 已通过且未进变更）。 */
  locked: Ref<boolean>
  /** 已通过且已点「变更主体」：此时不受 `approved` 的「无需重复核身」拦截。 */
  changing: Ref<boolean>
  /** 记录落地（身份域）。 */
  applyRecord: (record: UserRealnameVerification) => void
  /** 拿到核身链接（核身域）：出二维码 + 起轮询。 */
  beginChallenge: (authUrl: string) => Promise<void>
  /** 认证通过后回跳业务页（身份域，读 `redirect_to`）。 */
  restoreBusinessPage: (record: UserRealnameVerification) => Promise<void>
  /** 核身进行中（核身域的加载位，提交按钮与它共用一个「转圈」）。 */
  faceidStarting: Ref<boolean>
}

export function useRealnameSubmit(options: RealnameSubmitOptions) {
  const auth = useAuthStore()
  const { form } = options

  const submitting = ref(false)

  /** 登录态守卫：三口共用一段提示。 */
  function ensureToken(): boolean {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return false
    }
    return true
  }

  /** 发起个人实名（爱签扫码核身）：后端自动按证件分流大陆 / 港澳台。 */
  async function startWechatFaceid() {
    if (!ensureToken()) return

    if (options.approved.value && !options.changing.value) {
      TMessage.success('实名认证已通过，无需重复核身')
      return
    }

    if (options.locked.value && !options.rejected.value) {
      TMessage.warning('实名认证正在处理中，请稍后查询结果')
      return
    }

    const msg = options.validate()
    if (msg) {
      TMessage.warning(msg)
      return
    }

    options.faceidStarting.value = true
    try {
      const payload: StartAsignIdentifyPayload = {
        real_name: form.realName.trim(),
        id_card_no: form.idCardNo.trim(),
        mobile: form.mobile.trim() || null,
      }
      if (options.isMinor14To18.value) {
        payload.guardian_consent = form.guardianConsent
        payload.guardian_consent_file = form.guardianConsentFile.trim()
      }
      const result = await startAsignIdentify(auth.token, payload)
      if (result.manual_review || !result.auth_url) {
        // 非大陆身份证个人证件：爱签不提供实名认证服务，后端已转入人工审核。
        options.applyRecord(await getMyRealnameVerification(auth.token))
        TMessage.success('个人实名认证已提交，等待管理员审核')
        return
      }
      // 核身链接交给核身域：出二维码、开始轮询都在那边
      await options.beginChallenge(result.auth_url)
      // 重新加载当前实名状态（后端已创建 pending 记录）
      options.applyRecord(await getMyRealnameVerification(auth.token))
      TMessage.success('爱签实名认证已发起')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起爱签实名认证失败')
    } finally {
      options.faceidStarting.value = false
    }
  }

  /** 发起企业实名（爱签企业开户）：企业进件资料逐项带上，缺一项渠道就拒。 */
  async function startEnterpriseAsign() {
    if (!ensureToken()) return

    if (options.locked.value && !options.rejected.value) {
      TMessage.warning('实名认证正在处理中，请稍后查询结果')
      return
    }

    const msg = options.validate()
    if (msg) {
      TMessage.warning(msg)
      return
    }

    options.faceidStarting.value = true
    try {
      const payload: StartCompanyIdentifyPayload = {
        company_name: form.companyName.trim(),
        unified_social_credit_code: form.unifiedSocialCreditCode.trim(),
        operator_name: form.operatorName.trim(),
        operator_id_card_no: form.operatorIdCardNo.trim(),
        mobile: form.mobile.trim(),
        business_license_file: form.businessLicenseFile.trim(),
        company_prov_code: form.companyProvCode.trim(),
        company_area_code: form.companyAreaCode.trim(),
        company_address: form.companyAddress.trim(),
        business_scope: form.businessScope.trim(),
        business_license_expires_on: form.businessLicenseExpiresOn.trim(),
        legal_cert_begin_on: form.legalCertBeginOn.trim(),
        legal_cert_expires_on: form.legalCertExpiresOn.trim(),
      }
      const result = await startCompanyAsignIdentify(auth.token, payload)
      await options.beginChallenge(result.auth_url)
      options.applyRecord(await getMyRealnameVerification(auth.token))
      TMessage.success('企业实名认证已发起，请完成认证')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起爱签企业实名认证失败')
    } finally {
      options.faceidStarting.value = false
    }
  }

  /**
   * 提交实名认证的唯一入口（表单主按钮打的就是它）。
   *
   * 认证类型的分流在最前面，顺序与拆分前逐字一致：
   * 个人 → 爱签扫码核身；企业 → 爱签企业认证；其余（个体工商户）→ 直接提交给后端审核。
   */
  async function submitRealname() {
    if (!ensureToken()) return

    // 个人走爱签人脸核身（后端自动分流大陆/港澳台）；企业走爱签企业实名认证。
    if (options.identityCardSelected.value) {
      await startWechatFaceid()
      return
    }

    if (options.enterpriseSelected.value) {
      await startEnterpriseAsign()
      return
    }

    if (options.locked.value) {
      TMessage.warning('实名认证审核中或已通过时不能修改')
      return
    }

    const msg = options.validate()
    if (msg) {
      TMessage.warning(msg)
      return
    }

    submitting.value = true
    try {
      const updated = await submitMyRealnameVerification(auth.token, options.buildPayload())
      options.applyRecord(updated)
      TMessage.success(
        updated.status === 'approved' ? '实名认证信息已更新' : '实名认证信息已提交，请等待审核',
      )
      await options.restoreBusinessPage(updated)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '提交实名认证失败')
    } finally {
      submitting.value = false
    }
  }

  return { submitting, startWechatFaceid, startEnterpriseAsign, submitRealname }
}
