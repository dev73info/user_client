<script setup lang="ts">
import { watch } from 'vue'

import type { RealnameDraftFields } from '@/shared/realnameForm'
import {
  TAlert,
  TButton,
  TCheckbox,
  TDialog,
  TForm,
  TFormItem,
  TInput,
  TOption,
  TRadio,
  TRadioGroup,
  TSelect,
} from 'ui_73info'

import RealnameMaterialUpload from './RealnameMaterialUpload.vue'

const open = defineModel<boolean>('open', { required: true })
const form = defineModel<RealnameDraftFields>('form', { required: true })

const props = defineProps<{
  locked: boolean
  changing: boolean
  changeInReview: boolean
  canWithdraw: boolean
  changeBacked: boolean
  withdrawing: boolean
  submitting: boolean
  submitDisabled: boolean
  submitText: string
  businessSelected: boolean
  businessLicenseUploading: boolean
  legalCertFrontUploading: boolean
  legalCertBackUploading: boolean
  operatorCertFrontUploading: boolean
  consentUploading: boolean
}>()

const emit = defineEmits<{
  submit: []
  'cancel-change': []
  withdraw: []
  'business-license-picked': [file: File]
  'legal-cert-front-picked': [file: File]
  'legal-cert-back-picked': [file: File]
  'operator-cert-front-picked': [file: File]
  'consent-picked': [file: File]
}>()

watch(
  () => form.value.authType,
  (authType) => {
    form.value.identifyType = authType === 'IDENTITY_CARD' ? 153 : 369
  },
  { immediate: true },
)
</script>

<template>
  <TDialog v-model:open="open" title="实名认证" class="realname-dialog" width="620px">
    <TAlert
      v-if="props.changeInReview"
      tone="info"
      :closable="false"
      show-icon
      title="主体变更认证中"
    />

    <TForm label-position="top" class="realname-form">
      <TFormItem label="认证类型" required>
        <TRadioGroup v-model="form.authType" :disabled="props.locked || props.submitting">
          <TRadio value="IDENTITY_CARD">个人</TRadio>
          <TRadio value="ENTERPRISE">企业认证</TRadio>
          <TRadio value="SOLE_PROPRIETOR">个体工商户</TRadio>
        </TRadioGroup>
      </TFormItem>

      <TFormItem label="认证方式" required>
        <TSelect
          v-model="form.identifyType"
          :disabled="props.locked || props.submitting"
          style="width: 100%"
        >
          <template v-if="form.authType === 'IDENTITY_CARD'">
            <TOption label="个人运营商三要素" :value="151" />
            <TOption label="个人银行卡四要素" :value="152" />
            <TOption label="个人人脸活体认证" :value="153" />
          </template>
          <template v-else>
            <TOption label="法定代表人认证" :value="351" />
            <TOption label="企业线下盖章授权认证" :value="369" />
          </template>
        </TSelect>
      </TFormItem>

      <TFormItem v-if="props.businessSelected" label="经办人认证方式" required>
        <TSelect
          v-model="form.operatorIdentifyType"
          :disabled="props.locked || props.submitting"
          style="width: 100%"
        >
          <TOption label="运营商三要素认证" :value="151" />
          <TOption label="银行卡四要素认证" :value="152" />
          <TOption label="人脸活体认证" :value="153" />
        </TSelect>
      </TFormItem>

      <TFormItem :label="props.businessSelected ? '法人身份证人像面' : '身份证人像面'" required>
        <RealnameMaterialUpload
          kind="legalCertFront"
          :uploading="props.legalCertFrontUploading"
          :disabled="props.locked || props.submitting"
          :file-name="form.legalCertFrontFile"
          @picked="emit('legal-cert-front-picked', $event)"
        />
      </TFormItem>

      <template v-if="props.businessSelected">
        <TFormItem label="法人身份证国徽面" required>
          <RealnameMaterialUpload
            kind="legalCertBack"
            :uploading="props.legalCertBackUploading"
            :disabled="props.locked || props.submitting"
            :file-name="form.legalCertBackFile"
            @picked="emit('legal-cert-back-picked', $event)"
          />
        </TFormItem>
        <TFormItem label="营业执照" required>
          <RealnameMaterialUpload
            kind="businessLicense"
            :uploading="props.businessLicenseUploading"
            :disabled="props.locked || props.submitting"
            :file-name="form.businessLicenseFile"
            @picked="emit('business-license-picked', $event)"
          />
        </TFormItem>
        <TFormItem label="经办人身份证人像面" required>
          <RealnameMaterialUpload
            kind="operatorCertFront"
            :uploading="props.operatorCertFrontUploading"
            :disabled="props.locked || props.submitting"
            :file-name="form.operatorCertFrontFile"
            @picked="emit('operator-cert-front-picked', $event)"
          />
        </TFormItem>
      </template>

      <TFormItem :label="props.businessSelected ? '法定代表人手机号' : '手机号'" required>
        <TInput
          v-model="form.mobile"
          inputmode="tel"
          :maxlength="11"
          :disabled="props.locked || props.submitting"
          :placeholder="props.businessSelected ? '请输入法定代表人手机号' : '请输入本人手机号'"
        />
      </TFormItem>
      <TFormItem v-if="props.businessSelected" label="经办人手机号" required>
        <TInput
          v-model="form.operatorMobile"
          inputmode="tel"
          :maxlength="11"
          :disabled="props.locked || props.submitting"
          placeholder="请输入经办人手机号"
        />
      </TFormItem>

      <template v-if="form.guardianRequired">
        <TFormItem required>
          <TCheckbox v-model="form.guardianConsent">我已取得监护人同意</TCheckbox>
        </TFormItem>
        <TFormItem label="监护人同意书" required>
          <RealnameMaterialUpload
            kind="consent"
            :uploading="props.consentUploading"
            :disabled="props.locked || props.submitting"
            :file-name="form.guardianConsentFile"
            @picked="emit('consent-picked', $event)"
          >
            <a href="/guardian-consent-template.html" target="_blank" rel="noopener noreferrer">
              下载监护人同意书模板
            </a>
          </RealnameMaterialUpload>
        </TFormItem>
      </template>

      <div class="realname-form__actions">
        <TButton
          v-if="props.canWithdraw"
          variant="outline"
          tone="danger"
          :loading="props.withdrawing"
          @click="emit('withdraw')"
        >
          {{ props.changeBacked ? '取消变更，还原原主体' : '撤回认证' }}
        </TButton>
        <TButton
          v-if="props.changing"
          variant="outline"
          :disabled="props.submitting"
          @click="emit('cancel-change')"
        >
          放弃变更
        </TButton>
        <TButton
          variant="solid"
          tone="accent"
          :loading="props.submitting"
          :disabled="props.submitDisabled"
          @click="emit('submit')"
        >
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

.realname-form__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}
</style>
