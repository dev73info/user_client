<script setup lang="ts">
/**
 * 「提交认证信息」弹窗：实名表单本体（个人 / 企业 / 个体工商户三套字段）+ 四份材料的上传行。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：请求、校验、toast、路由全在外面（组件不碰
 * `@/api/*`、`TMessage`、`router`）。`open` 归父级——`watch(realnameDialogVisible)`（关掉即丢弃
 * 变更草稿、打开即补一次有效期识别）是草稿的生命周期开关，必须留在视图。`form` 用 `defineModel`
 * 透传父级草稿域的**同一个 reactive 实例**：不逐个开 22 个 `update:xxx`，那只会多出 22 处键名
 * 对不齐就静默失效的机会（本页踩过 `updateChannel` vs `@update:channel`）。其余布尔位与文案都是
 * 父级算好的结果，这里只决定显示什么；四个上传行只把选好的 `File` emit 出去（上传在材料域）。
 *
 * 样式随组件走：`.realname-form` / `.realname-date-row` / `.realname-form__actions` /
 * `.realname-consent-upload__derived` 原来在视图 scoped 块里（父级 scoped 打不到子组件节点），
 * `.realname-consent-upload*` 那几档在 `RealnameMaterialUpload.vue`。本轮没有新增断点。
 */
import { toRef } from 'vue'

import type { RealnameDraftFields } from '@/shared/realnameForm'
import {
  TAlert,
  TButton,
  TCheckbox,
  TDatePicker,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TOption,
  TRadio,
  TRadioGroup,
  TSelect,
  Promotion,
} from 'ui_73info'

import RealnameMaterialUpload from './RealnameMaterialUpload.vue'

/** 弹窗开合（`realnameDialogVisible` 的正本在视图）。 */
const open = defineModel<boolean>('open', { required: true })
/** 表单草稿：与父级草稿域同一个 reactive 实例，`v-model` 直连各字段。 */
const form = defineModel<RealnameDraftFields>('form', { required: true })

const props = defineProps<{
  // ── 只读与模式 ──
  locked: boolean
  changing: boolean
  changeInReview: boolean
  // ── 底部三个按钮 ──
  canWithdraw: boolean
  changeBacked: boolean
  withdrawing: boolean
  submitting: boolean
  faceidStarting: boolean
  submitDisabled: boolean
  submitText: string
  idCardPlaceholder: string
  mobileMasked: string
  identityCardSelected: boolean
  businessSelected: boolean
  soleProprietorSelected: boolean
  isUnder14: boolean
  isMinor14To18: boolean
  isAdult: boolean
  // ── 营业执照识别摘要（有缺项时那行用警示色） ──
  derivedNote: string
  derivedMissing: boolean
  businessLicenseUploading: boolean
  licenseOcrLoading: boolean
  legalCertFrontUploading: boolean
  legalCertBackUploading: boolean
  legalCertOcrLoading: boolean
  consentUploading: boolean
}>()

const emit = defineEmits<{
  /** TDialog 自己关掉（遮罩 / Esc / 右上角）：父级回写可见性并丢弃变更草稿。 */
  'update:open': [open: boolean]
  // ── 按钮 ──
  submit: []
  'cancel-change': []
  withdraw: []
  // ── 四份材料选好了文件（校验与上传在材料域） ──
  'business-license-picked': [file: File]
  'legal-cert-front-picked': [file: File]
  'legal-cert-back-picked': [file: File]
  'consent-picked': [file: File]
  'mark-begin-edited': []
  'mark-expires-edited': []
  'long-term': []
}>()

/** 只读态在模板里出现十来次，用 `toRef` 取个短名（解构 `props` 会丢掉响应性），也顺手压住行数预算。 */
const locked = toRef(props, 'locked')

/** 手机号提示带出当前脱敏号：企业填经办人、个人填本人，两句文案只差一个称呼。 */
const mobileHint = (role: '经办人' | '本人') =>
  `请输入${role}手机号（${props.mobileMasked ? `当前 ${props.mobileMasked}` : '用于电子签署'}）`
</script>

<template>
  <TDialog v-model:open="open" title="提交认证信息" class="realname-dialog" width="620px">
    <TAlert
      v-if="props.changeInReview"
      tone="info"
      :closable="false"
      show-icon
      title="主体变更认证中"
    >
      认证通过前账号实名状态为「认证中」，可点下方「取消变更，还原原主体」回到变更前的实名主体。
    </TAlert>

    <TForm label-position="top" class="realname-form">
      <TFormItem label="证件类型">
        <TRadioGroup v-model="form.authType" :disabled="locked">
          <TRadio value="IDENTITY_CARD">个人</TRadio>
          <TRadio value="ENTERPRISE">企业认证</TRadio>
          <TRadio value="SOLE_PROPRIETOR">个体工商户</TRadio>
        </TRadioGroup>
      </TFormItem>

      <template v-if="props.businessSelected">
        <TFormItem :label="props.soleProprietorSelected ? '个体工商户名称' : '企业名称'" required>
          <TInput
            v-model="form.companyName"
            :maxlength="120"
            placeholder="请输入企业名称"
            :disabled="locked"
          />
        </TFormItem>
        <TFormItem label="统一社会信用代码" required>
          <TInput
            v-model="form.unifiedSocialCreditCode"
            :maxlength="64"
            placeholder="请输入统一社会信用代码"
            :disabled="locked"
          />
        </TFormItem>
        <TFormItem label="营业执照号">
          <TInput
            v-model="form.businessLicenseNo"
            :maxlength="64"
            placeholder="请输入营业执照号（可选）"
            :disabled="locked"
          />
        </TFormItem>
        <!-- 识别结果（或缺失项）挂在上传行下面：企业进件有四项不在表单里，只能从这张照片识别。 -->
        <TFormItem label="营业执照文件" required>
          <RealnameMaterialUpload
            kind="businessLicense"
            :uploading="props.businessLicenseUploading"
            :disabled="locked"
            :file-name="form.businessLicenseFile"
            :status-hint="props.licenseOcrLoading ? '正在识别营业执照，自动填写企业信息…' : ''"
            @picked="emit('business-license-picked', $event)"
          />
          <p
            v-if="form.businessLicenseFile && !props.licenseOcrLoading && props.derivedNote"
            class="realname-consent-upload__derived"
            :class="{ 'is-missing': props.derivedMissing }"
          >
            {{ props.derivedNote }}
          </p>
        </TFormItem>
        <!-- 进件三张证照：营业执照 + 法人身份证人像面 / 国徽面（后两张上传即落库，不进 payload）。 -->
        <TFormItem label="法人身份证人像面" required>
          <RealnameMaterialUpload
            kind="legalCertFront"
            :uploading="props.legalCertFrontUploading"
            :disabled="locked"
            :file-name="form.legalCertFrontFile"
            @picked="emit('legal-cert-front-picked', $event)"
          />
        </TFormItem>
        <TFormItem label="法人身份证国徽面" required>
          <RealnameMaterialUpload
            kind="legalCertBack"
            :uploading="props.legalCertBackUploading"
            :disabled="locked"
            :file-name="form.legalCertBackFile"
            @picked="emit('legal-cert-back-picked', $event)"
          />
        </TFormItem>
        <TFormItem label="经办人姓名" required>
          <TInput
            v-model="form.operatorName"
            :maxlength="120"
            placeholder="请输入经办人姓名"
            :disabled="locked"
          />
        </TFormItem>
        <TFormItem label="经办人身份证号" required>
          <TInput
            v-model="form.operatorIdCardNo"
            :maxlength="64"
            placeholder="请输入经办人身份证号"
            :disabled="locked"
          />
        </TFormItem>
        <TFormItem label="手机号" required>
          <TInput
            v-model="form.mobile"
            :maxlength="11"
            :placeholder="mobileHint('经办人')"
            :disabled="locked"
          />
        </TFormItem>
        <!-- 「所在省市 / 注册地址 / 经营范围 / 营业执照有效期」不再让用户手填（都能从营业执照识别），
             这里只剩上传入口与识别摘要。法人证件有效期同样由证件照 OCR 回填，手填或改过的保留。 -->
        <TFormItem label="法人证件有效期" required>
          <div class="realname-date-row">
            <TDatePicker
              v-model="form.legalCertBeginOn"
              type="date"
              value-format="YYYYMMDD"
              format="YYYY-MM-DD"
              placeholder="证件有效期起始日"
              :disabled="locked"
              @change="emit('mark-begin-edited')"
            />
            <TDatePicker
              v-model="form.legalCertExpiresOn"
              type="date"
              value-format="YYYYMMDD"
              format="YYYY-MM-DD"
              placeholder="证件有效期截止日"
              :disabled="locked"
              @change="emit('mark-expires-edited')"
            />
            <TButton variant="text" tone="accent" :disabled="locked" @click="emit('long-term')">
              长期有效
            </TButton>
          </div>
          <p v-if="props.legalCertOcrLoading" class="realname-consent-upload__derived">
            正在按法人身份证识别证件有效期，自动填写起止日期…
          </p>
        </TFormItem>
        <TFormItem>
          <TAlert
            tone="info"
            :closable="false"
            show-icon
            title="企业认证信息提交后将由平台审核，审核通过后可用于合同签署。"
          />
        </TFormItem>
      </template>

      <template v-else>
        <TFormItem label="证件类型">
          <TSelect v-model="form.idCardType" :disabled="locked" style="width: 100%">
            <TOption label="居民身份证" :value="1" />
            <TOption label="台湾居民来往大陆通行证" :value="2" disabled />
            <TOption label="港澳居民来往内地通行证" :value="3" disabled />
          </TSelect>
        </TFormItem>
        <TFormItem label="姓名" required>
          <TInput
            v-model="form.realName"
            :maxlength="120"
            placeholder="请输入真实姓名"
            :disabled="locked"
          />
        </TFormItem>
        <TFormItem label="证件号" required>
          <TInput
            v-model="form.idCardNo"
            :maxlength="64"
            :placeholder="props.idCardPlaceholder"
            :disabled="locked"
          />
        </TFormItem>
        <TFormItem label="手机号" required>
          <TInput
            v-model="form.mobile"
            :maxlength="11"
            :placeholder="mobileHint('本人')"
            :disabled="locked"
          />
        </TFormItem>
      </template>

      <TFormItem v-if="props.isUnder14">
        <TAlert
          tone="danger"
          :closable="false"
          show-icon
          title="未满 14 周岁的未成年人不能进行实名认证"
        />
      </TFormItem>

      <TFormItem v-if="props.isMinor14To18">
        <TCheckbox v-model="form.guardianConsent" :disabled="locked">
          我已取得监护人同意
        </TCheckbox>
      </TFormItem>

      <TFormItem v-if="props.isMinor14To18 && form.guardianConsent" label="监护人同意书" required>
        <RealnameMaterialUpload
          kind="consent"
          :uploading="props.consentUploading"
          :disabled="locked"
          :file-name="form.guardianConsentFile"
          @picked="emit('consent-picked', $event)"
        >
          <a
            class="realname-consent-template"
            href="/guardian-consent-template.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            下载监护人同意书模板
          </a>
        </RealnameMaterialUpload>
      </TFormItem>

      <TFormItem v-if="props.isAdult">
        <TAlert
          tone="info"
          :closable="false"
          show-icon
          title="您已年满 18 周岁，无需上传监护人同意书"
        />
      </TFormItem>

      <div class="realname-form__actions">
        <TButton
          variant="outline"
          tone="danger"
          v-if="props.canWithdraw"
          :loading="props.withdrawing"
          @click="emit('withdraw')"
        >
          {{ props.changeBacked ? '取消变更，还原原主体' : '撤回认证' }}
        </TButton>
        <TButton
          variant="outline"
          v-if="props.changing"
          :disabled="props.submitting || props.faceidStarting"
          @click="emit('cancel-change')"
        >
          放弃变更
        </TButton>
        <TButton
          variant="solid"
          tone="accent"
          class="realname-submit-btn"
          :loading="props.submitting || props.faceidStarting"
          :disabled="props.submitDisabled"
          @click="emit('submit')"
        >
          <TIcon v-if="props.identityCardSelected">
            <Promotion />
          </TIcon>
          {{ props.submitText }}
        </TButton>
      </div>
    </TForm>
  </TDialog>
</template>

<style scoped>
.realname-form {
  min-width: 0;
}

.realname-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

/* 两个日期选择器并排：让它们能收缩到比内容窄，否则 TDatePicker 的 100% 宽会把行顶出去。 */
.realname-date-row > * {
  min-width: 0;
}

.realname-form__actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* 营业执照识别结果那一行（识别出什么 / 缺了什么）：不在上传按钮那一行里，所以要自己带外边距。 */
.realname-consent-upload__derived {
  display: block;
  margin: 6px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.6;
}

/* 有缺项时用警示色：这一行同时是「提交按钮为什么点不了」的原因。 */
.realname-consent-upload__derived.is-missing {
  color: var(--73-warning);
}
</style>
