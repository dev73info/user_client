import { reactive, ref } from 'vue'

import {
  modifyCompanyInfo,
  modifyMobileByCode,
  modifyUserName,
  sendVerifyCode,
} from '@/api/asignAccount'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 爱签账户维护域：修改手机号（验证码方式）、修改法人、修改企业信息、修改姓名，
 * 加上它们共用的四份草稿、五个加载位与弹窗可见性。弹窗模板在 `components/account/AsignDialog.vue`。
 *
 * 为什么它离开视图：九个 `update:*` 草稿 + 五个动作合计一百多行，全是「校验 → 打接口 → 改本域
 * 草稿」，与页面编排无关；留在视图里会把行数预算一直压在 1000 以上。
 *
 * 两条口径（拆分前后未改）：
 * - 手机号只保留短信验证码方式（运营商三要素那条路 2026-10-04 已删）；
 * - 「修改法人」与「修改企业信息」同接口（`/user/modifyCompanyInfo`），区别只是前者要求法人
 *   三要素齐全（姓名 + 身份证号 + 证件类型 1=身份证）。
 *
 * 一个入口同时被两处调用：入口行（`mobile` / `legalPerson` / `company` / `personal`）与印章弹窗
 * 的「修改企业信息」（`openCompanyFromSeal` 在视图里，走同一个 `openAsignDialog('company')`）。
 */
export function useAsignAccount() {
  const auth = useAuthStore()

  const asignDialogVisible = ref(false)
  const asignDialogKind = ref('')

  const asign = reactive({
    mobileByCode: { mobile: '', code: '', ctoken: '' },
    legalPerson: { name: '', idCard: '' },
    company: { companyName: '', legalName: '', legalIdCard: '' },
    personal: { personalName: '', mobile: '' },
  })
  const asignLoading = reactive({
    sendCode: false,
    mobileByCode: false,
    legalPerson: false,
    company: false,
    personal: false,
  })

  /** 登录态守卫：五个动作共用一段提示。 */
  function requireToken(): boolean {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return false
    }
    return true
  }

  /** 打开弹窗：`kind` 决定表单（mobile / legalPerson / company / personal）。 */
  function openAsignDialog(kind: string) {
    asignDialogKind.value = kind
    asignDialogVisible.value = true
  }

  /// 修改手机号：只保留短信验证码方式（运营商三要素那条路 2026-10-04 已删）。
  function openMobileDialog() {
    openAsignDialog('mobile')
  }

  async function handleSendVerifyCode() {
    if (!requireToken()) return
    if (!asign.mobileByCode.mobile.trim()) {
      TMessage.warning('请先填写新手机号')
      return
    }
    asignLoading.sendCode = true
    try {
      const res = await sendVerifyCode(auth.token, { mobile: asign.mobileByCode.mobile.trim() })
      if (res.success) {
        // data 是 codeToken 字符串本身（见 api/asignAccount.ts 的说明）。
        asign.mobileByCode.ctoken = res.data ?? ''
        TMessage.success('验证码已发送，请查收短信')
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发送验证码失败')
    } finally {
      asignLoading.sendCode = false
    }
  }

  async function handleModifyMobileByCode() {
    if (!requireToken()) return
    if (
      !asign.mobileByCode.mobile.trim() ||
      !asign.mobileByCode.code.trim() ||
      !asign.mobileByCode.ctoken.trim()
    ) {
      TMessage.warning('请填写手机号与验证码（需先发送验证码）')
      return
    }
    asignLoading.mobileByCode = true
    try {
      const res = await modifyMobileByCode(auth.token, {
        mobile: asign.mobileByCode.mobile.trim(),
        code: asign.mobileByCode.code.trim(),
        ctoken: asign.mobileByCode.ctoken.trim(),
      })
      if (res.success) {
        TMessage.success('手机号已修改')
        asign.mobileByCode.mobile = ''
        asign.mobileByCode.code = ''
        asign.mobileByCode.ctoken = ''
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '修改手机号失败')
    } finally {
      asignLoading.mobileByCode = false
    }
  }

  async function handleModifyLegalPerson() {
    if (!requireToken()) return
    if (!asign.legalPerson.name.trim() || !asign.legalPerson.idCard.trim()) {
      TMessage.warning('请填写法人姓名与身份证号')
      return
    }
    asignLoading.legalPerson = true
    try {
      const res = await modifyCompanyInfo(auth.token, {
        name: asign.legalPerson.name.trim(),
        idCard: asign.legalPerson.idCard.trim(),
        idCardType: 1,
      })
      if (res.success) {
        TMessage.success('法人信息已修改')
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '修改法人失败')
    } finally {
      asignLoading.legalPerson = false
    }
  }

  async function handleModifyCompanyInfo() {
    if (!requireToken()) return
    if (!asign.company.companyName.trim() && !asign.company.legalName.trim()) {
      TMessage.warning('请填写企业名称或法人信息')
      return
    }
    asignLoading.company = true
    try {
      const res = await modifyCompanyInfo(auth.token, {
        companyName: asign.company.companyName.trim() || undefined,
        name: asign.company.legalName.trim() || undefined,
        idCard: asign.company.legalIdCard.trim() || undefined,
        idCardType: 1,
      })
      if (res.success) {
        TMessage.success(res.data ? '企业信息已修改，新印章已生成' : '企业信息已修改')
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '修改企业信息失败')
    } finally {
      asignLoading.company = false
    }
  }

  async function handleModifyUserName() {
    if (!requireToken()) return
    if (!asign.personal.personalName.trim()) {
      TMessage.warning('请填写姓名')
      return
    }
    if (!asign.personal.mobile.trim()) {
      TMessage.warning('请填写本人手机号（用于运营商三要素核验）')
      return
    }
    asignLoading.personal = true
    try {
      // 核验方式固定三要素；手机号用用户本次输入的（不再让他选四要素）
      const res = await modifyUserName(auth.token, {
        name: asign.personal.personalName.trim(),
        identifyType: 2,
        mobile: asign.personal.mobile.trim(),
      })
      if (res.success) {
        TMessage.success('姓名已修改')
        asign.personal.personalName = ''
        asign.personal.mobile = ''
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '修改姓名失败')
    } finally {
      asignLoading.personal = false
    }
  }

  return {
    asign,
    asignLoading,
    asignDialogVisible,
    asignDialogKind,
    openAsignDialog,
    openMobileDialog,
    handleSendVerifyCode,
    handleModifyMobileByCode,
    handleModifyLegalPerson,
    handleModifyCompanyInfo,
    handleModifyUserName,
  }
}
