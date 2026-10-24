import type { Component } from 'vue'

import type { AccountDialogDomains, AccountDialogKey } from '@/composables/useAccountDialogRegistry'

import CloseSettleDialog from './CloseSettleDialog.vue'
import FaceidDialog from './FaceidDialog.vue'
import RealnameDialog from './RealnameDialog.vue'
import SettlementDialog from './SettlementDialog.vue'

/**
 * 弹窗绑定表之一：**实名认证与收款**四个弹窗（提交认证信息 / 核对与修改收款银行卡 /
 * 注销结算账户 / 人脸核身），以及十二个弹窗共用的表结构。
 *
 * 十二个弹窗的表分成两个文件只为一件事：`check-frontend` 的 `.ts` 行数预算 300——一张表
 * 写满十二个弹窗要三百多行，拆成「实名与收款」「账号设置」两半各一百多行，谁都不贴上限。
 * 顺序也按这个分法：`AccountDialogHost` 先渲染本文件的四条，再渲染另一半。
 *
 * **v-model 的键名由 `model` 一个字段派生**，不手写 `@update:xxx`：
 * - `RealnameDialog` 是 `defineModel('open')` → `:open` + `@update:open`；
 * - 其余是 `:visible` + `@update:visible`。
 *
 * 项目里踩过的坑：键名写成驼峰（`updateChannel` / `onUpdateOpen`）既不报错也不生效，
 * 表现是「弹窗点得动、什么都没发生」。所以可见性 prop 与回写事件**不许各写一遍**，
 * 只能从 `model` 派生；`visible[key]` 也是同一个 ref，读写同一份。
 */
export type DialogHandlers = Record<string, (...args: never[]) => void>

/** 弹窗组件的 props 类型：`$props` 里同时带着 `open` / `visible` 与 `onUpdate:xxx`。 */
type DialogProps<C> = C extends abstract new (...args: never[]) => { $props: infer P } ? P : never

export interface AccountDialogEntry {
  key: AccountDialogKey
  component: Component
  /** v-model 的键名：`open`（RealnameDialog）/ `visible`（其余）/ `null`（不是 v-model）。 */
  model: 'open' | 'visible' | null
  props: (domains: AccountDialogDomains) => Record<string, unknown>
  on: (domains: AccountDialogDomains) => DialogHandlers
}

/** 登记一条弹窗：props 逐个对得上组件的 `defineProps`，写错字段名在编译期就报错。 */
export function dialog<C extends abstract new (...args: never[]) => { $props: object }>(
  key: AccountDialogKey,
  component: C,
  model: 'open' | 'visible' | null,
  props: (domains: AccountDialogDomains) => Partial<DialogProps<C>>,
  on: (domains: AccountDialogDomains) => DialogHandlers,
): AccountDialogEntry {
  return {
    key,
    component: component as unknown as Component,
    model,
    props,
    on,
  } as AccountDialogEntry
}

/** 提交按钮为什么是灰的：只读态、各主体的必填、年龄禁区，少一条都会让用户点了没反应。 */
function submitBlocked(d: AccountDialogDomains): boolean {
  return (
    d.identity.realnameLocked.value ||
    d.draft.identityCardRequiredMissing.value ||
    d.draft.enterpriseRequiredMissing.value ||
    d.draft.isUnder14.value ||
    d.draft.minorGuardianRequiredMissing.value
  )
}

/** 提交按钮的文案：随实名状态、变更中、主体类型换话术（点不动时也要说清为什么）。 */
function submitText(d: AccountDialogDomains): string {
  if (d.identity.realnameChanging.value) return '提交变更，重新认证'
  if (d.identity.realnameApproved.value) return '已通过认证'
  if (d.identity.realnameLocked.value && d.draft.identityCardSelected.value) return '认证处理中'
  if (d.draft.identityCardSelected.value) {
    return d.identity.current.value ? '重新发起实名认证' : '实名认证'
  }
  if (!d.identity.current.value || d.identity.realnameRejected.value) {
    return d.identity.current.value ? '重新提交认证' : '提交认证'
  }
  return '已提交，不能修改'
}

export const verifyDialogEntries: AccountDialogEntry[] = [
  dialog(
    'realname',
    RealnameDialog,
    'open',
    (d) => ({
      form: d.draft.form,
      locked: d.identity.realnameLocked.value,
      changing: d.identity.realnameChanging.value,
      changeInReview: d.identity.realnamePending.value && d.identity.realnameChangeBacked.value,
      canWithdraw: d.identity.realnameCanWithdraw.value,
      changeBacked: d.identity.realnameChangeBacked.value,
      withdrawing: d.faceid.withdrawing.value,
      submitting: d.submit.submitting.value,
      faceidStarting: d.faceid.faceidStarting.value,
      submitDisabled: submitBlocked(d),
      submitText: submitText(d),
      idCardPlaceholder: d.identity.current.value?.id_card_no_masked || '请输入证件号',
      mobileMasked: d.identity.current.value?.mobile_masked ?? '',
      identityCardSelected: d.draft.identityCardSelected.value,
      businessSelected: d.draft.businessSelected.value,
      soleProprietorSelected: d.draft.soleProprietorSelected.value,
      isUnder14: d.draft.isUnder14.value,
      isMinor14To18: d.draft.isMinor14To18.value,
      isAdult: d.draft.isAdult.value,
      derivedNote: d.draft.businessLicenseDerivedNote.value,
      derivedMissing: d.draft.businessLicenseDerivedMissing.value.length > 0,
      businessLicenseUploading: d.materials.businessLicenseUploading.value,
      licenseOcrLoading: d.materials.businessLicenseOcrLoading.value,
      legalCertFrontUploading: d.materials.legalCertFrontUploading.value,
      legalCertBackUploading: d.materials.legalCertBackUploading.value,
      legalCertOcrLoading: d.legalCert.legalCertOcrLoading.value,
      consentUploading: d.materials.consentUploading.value,
    }),
    (d) => ({
      submit: d.submit.submitRealname,
      'cancel-change': d.page.cancelRealnameChange,
      withdraw: d.faceid.handleWithdraw,
      'business-license-picked': d.materials.handleBusinessLicenseFile,
      'legal-cert-front-picked': d.materials.handleLegalCertFrontFile,
      'legal-cert-back-picked': d.materials.handleLegalCertBackFile,
      'consent-picked': d.materials.handleConsentFile,
      'mark-begin-edited': d.legalCert.markLegalCertBeginEdited,
      'mark-expires-edited': d.legalCert.markLegalCertExpiresEdited,
      'long-term': d.legalCert.applyLongTermLegalCert,
    }),
  ),
  dialog(
    'settle',
    SettlementDialog,
    'visible',
    (d) => ({
      loading: d.settle.settleLoading.value,
      saving: d.settle.settleSaving.value,
      bound: d.settle.settleBound.value,
      corporateLocked: d.settle.settleCorporateLocked.value,
      subjectMismatch: d.settle.settleSubjectMismatch.value,
      subjectLabel: d.settle.settleSubjectLabel.value,
      materialMissing: d.settle.settleMaterialMissing.value,
      materialMissingText: d.settle.settleMaterialMissingText.value,
      providerError: d.settle.settleProviderError.value,
      rejected: d.settle.settleRejected.value,
      cardPlaceholder: d.settle.settleCardPlaceholder.value,
      cardId: d.settle.settleForm.card_id,
      bankCode: d.settle.settleForm.bank_code,
      bankAcctType: d.settle.settleForm.bank_acct_type,
    }),
    (d) => ({
      'update:card-id': (value: string) => (d.settle.settleForm.card_id = value),
      'update:bank-code': (value: string) => (d.settle.settleForm.bank_code = value),
      'update:bank-acct-type': (value: string) => (d.settle.settleForm.bank_acct_type = value),
      submit: d.settle.saveSettleAccount,
      cancel: d.settle.closeSettleDialog,
      'fix-material': d.page.goFixSettleMaterial,
    }),
  ),
  dialog(
    'closeSettle',
    CloseSettleDialog,
    'visible',
    (d) => ({
      confirmation: d.settle.closeSettleConfirmation.value,
      ready: d.settle.closeSettleReady.value,
      saving: d.settle.closeSettleLoading.value,
    }),
    (d) => ({
      'update:value': (value: string) => (d.settle.closeSettleConfirmation.value = value),
      submit: d.settle.handleCloseSettleAccount,
    }),
  ),
  dialog(
    'faceid',
    FaceidDialog,
    'visible',
    (d) => ({
      enterprise: d.draft.enterpriseSelected.value,
      mobile: d.page.isMobile.value,
      qrDataUrl: d.faceid.faceidQrDataUrl.value,
      checking: d.faceid.faceidChecking.value,
      withdrawing: d.faceid.withdrawing.value,
      changeBacked: d.identity.realnameChangeBacked.value,
    }),
    (d) => ({
      withdraw: d.faceid.handleWithdraw,
      'open-page': d.faceid.openWechatFaceidPage,
      check: () => {
        void d.faceid.checkWechatFaceidResult()
      },
    }),
  ),
]
