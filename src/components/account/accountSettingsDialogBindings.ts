import AsignDialog from './AsignDialog.vue'
import CloseAccountDialog from './CloseAccountDialog.vue'
import EmailDialog from './EmailDialog.vue'
import PasswordDialog from './PasswordDialog.vue'
import SealDialog from './SealDialog.vue'
import TwoFactorDialog from './TwoFactorDialog.vue'
import { dialog, type AccountDialogEntry } from './accountDialogBindings'

/**
 * 弹窗绑定表之二：**账号设置与第三方绑定**六个弹窗（爱签账户维护 / 印章 / 改邮箱 / 改密码 /
 * 两步验证 / 注销账号）。改用户名那条已按契约删除（不接受自助改登录名）。
 *
 * 与 `accountDialogBindings.ts`（实名与收款那四条）分开只为一件事：`.ts` 的行数预算 300——
 * 一张表写满十二个弹窗会超，按域拆两半谁都不贴上限。表结构与 `dialog()` 在那一半里，
 * 顺序也按这个分法：宿主先渲染实名与收款，再渲染本文件这八条。
 *
 * 本文件的八条只有「注销账号」是破坏性动作（确认词在 `useAccountCloseAccount` 里校验）；
 * 其余都是「输入回写父级草稿，点按钮把草稿交给父级」的老口径，组件内不另存草稿。
 */
export const settingsDialogEntries: AccountDialogEntry[] = [
  // 爱签账户维护：修改手机号 / 法人 / 企业信息 / 姓名共用一套弹窗，`kind` 决定表单
  dialog(
    'asign',
    AsignDialog,
    'visible',
    (d) => ({
      kind: d.asign.asignDialogKind.value,
      mobile: d.asign.asign.mobileByCode.mobile,
      code: d.asign.asign.mobileByCode.code,
      legalPersonName: d.asign.asign.legalPerson.name,
      legalPersonIdCard: d.asign.asign.legalPerson.idCard,
      companyName: d.asign.asign.company.companyName,
      companyLegalName: d.asign.asign.company.legalName,
      companyLegalIdCard: d.asign.asign.company.legalIdCard,
      personalName: d.asign.asign.personal.personalName,
      personalMobile: d.asign.asign.personal.mobile,
      loading: d.asign.asignLoading,
      mobileMasked: d.identity.current.value?.mobile_masked ?? '',
    }),
    (d) => ({
      'update:mobile': (value: string) => (d.asign.asign.mobileByCode.mobile = value),
      'update:code': (value: string) => (d.asign.asign.mobileByCode.code = value),
      'update:legal-person-name': (value: string) => (d.asign.asign.legalPerson.name = value),
      'update:legal-person-id-card': (value: string) => (d.asign.asign.legalPerson.idCard = value),
      'update:company-name': (value: string) => (d.asign.asign.company.companyName = value),
      'update:company-legal-name': (value: string) => (d.asign.asign.company.legalName = value),
      'update:company-legal-id-card': (value: string) =>
        (d.asign.asign.company.legalIdCard = value),
      'update:personal-name': (value: string) => (d.asign.asign.personal.personalName = value),
      'update:personal-mobile': (value: string) => (d.asign.asign.personal.mobile = value),
      'send-code': d.asign.handleSendVerifyCode,
      'modify-mobile': d.asign.handleModifyMobileByCode,
      'modify-legal-person': d.asign.handleModifyLegalPerson,
      'modify-company': d.asign.handleModifyCompanyInfo,
      'modify-user-name': d.asign.handleModifyUserName,
    }),
  ),
  // 印章管理：企业电子印章由爱签生成，用于合同盖章；只读展示 + 在线制章链接
  dialog(
    'seal',
    SealDialog,
    'visible',
    (d) => ({
      loading: d.seal.sealLoading.value,
      error: d.seal.sealError.value,
      data: d.seal.sealData.value,
      making: d.seal.sealMakeLoading.value,
    }),
    (d) => ({
      reload: d.seal.loadMySeals,
      'make-online': d.seal.handleSealMakeOnline,
      'open-company': d.seal.openCompanyFromSeal,
    }),
  ),
  dialog(
    'email',
    EmailDialog,
    'visible',
    (d) => ({
      initialEmail: d.security.newEmail.value,
      initialCode: d.security.emailCode.value,
      saving: d.security.emailLoading.value,
      codeSending: d.security.emailCodeSending.value,
    }),
    (d) => ({
      'update:email': (value: string) => (d.security.newEmail.value = value),
      'update:code': (value: string) => (d.security.emailCode.value = value),
      'send-code': d.security.sendEmailVerificationCode,
      submit: d.security.submitEmailChange,
    }),
  ),
  // 改密码：没绑邮箱时发码与保存都不可用（`emailBound` 决定两个按钮的置灰）
  dialog(
    'password',
    PasswordDialog,
    'visible',
    (d) => ({
      initialOldPassword: d.security.oldPassword.value,
      initialPassword: d.security.newPassword.value,
      initialConfirm: d.security.confirmPassword.value,
      initialCode: d.security.passwordCode.value,
      saving: d.security.passwordLoading.value,
      codeSending: d.security.passwordCodeSending.value,
      emailBound: Boolean(d.page.profileEmail.value),
    }),
    (d) => ({
      'update:password': (value: string) => (d.security.newPassword.value = value),
      'update:old-password': (value: string) => (d.security.oldPassword.value = value),
      'update:confirm': (value: string) => (d.security.confirmPassword.value = value),
      'update:code': (value: string) => (d.security.passwordCode.value = value),
      'send-code': d.security.sendPasswordVerificationCode,
      submit: d.security.submitPasswordChange,
    }),
  ),
  // 两步验证：开关换成目标态时父级自动补发一次验证码（`toggle` 不是纯回写）
  dialog(
    'twoFactor',
    TwoFactorDialog,
    'visible',
    (d) => ({
      targetEnabled: d.twoFactor.twoFactorTargetEnabled.value,
      code: d.twoFactor.twoFactorCode.value,
      saving: d.twoFactor.twoFactorLoading.value,
      codeSending: d.twoFactor.twoFactorCodeSending.value,
      changed: d.twoFactor.twoFactorChanged.value,
      emailBound: Boolean(d.page.profileEmail.value),
      emailLabel: d.twoFactor.accountEmailLabel.value,
    }),
    (d) => ({
      'update:code': (value: string) => (d.twoFactor.twoFactorCode.value = value),
      toggle: d.twoFactor.handleTwoFactorTargetChange,
      'send-code': d.twoFactor.sendTwoFactorVerificationCode,
      submit: d.twoFactor.submitTwoFactorChange,
    }),
  ),
  // 注销账号：整个账号，比「注销结算账户」更重（确认词、退出登录、回首页都在域里）
  dialog(
    'closeAccount',
    CloseAccountDialog,
    'visible',
    (d) => ({
      confirmation: d.closeAccount.accountCloseConfirmation.value,
      ready: d.closeAccount.accountCloseReady.value,
      saving: d.closeAccount.accountClosing.value,
    }),
    (d) => ({
      'update:value': (value: string) => (d.closeAccount.accountCloseConfirmation.value = value),
      submit: d.closeAccount.handleCloseAccount,
    }),
  ),
]
