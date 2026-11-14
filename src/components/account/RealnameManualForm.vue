<script setup lang="ts">
/**
 * 手动填写认证的表单：证件信息 / 企业进件资料由用户自己填，提交后走平台人工审核。
 *
 * 与 OCR 路径的差别只有「信息来源」：OCR 路径上传证件后由爱签识别并回填，
 * 这条路径把同一批字段直接摆出来。个人不要求身份证照片，企业仍要上传营业执照
 * （后端 `POST /api/realname/` 对企业强制校验）。
 */
import { computed } from 'vue'

import {
  TCheckbox,
  TDatePicker,
  TForm,
  TFormItem,
  TInput,
  TOption,
  TSelect,
  type DatePickerRangeValue,
  type DatePickerValue,
} from 'ui_73info'

import { getSettlementCities, settlementProvinces } from '@/utils/settlementAccount'
import type { RealnameDraftFields } from '@/shared/realnameForm'

import RealnameMaterialUpload from './RealnameMaterialUpload.vue'

const form = defineModel<RealnameDraftFields>('form', { required: true })

const props = defineProps<{
  businessSelected: boolean
  disabled: boolean
  consentUploading: boolean
}>()

const emit = defineEmits<{
  'consent-picked': [file: File]
}>()

const cities = computed(() => getSettlementCities(form.value.companyProvCode))

/** 日期控件的空值是 null，草稿字段统一按空串存（区间值这里用不上）。 */
function dateField(key: 'businessLicenseExpiresOn' | 'legalCertBeginOn' | 'legalCertExpiresOn') {
  return computed({
    get: () => form.value[key],
    set: (value: DatePickerValue | DatePickerRangeValue) => {
      form.value[key] = value == null || Array.isArray(value) ? '' : String(value)
    },
  })
}

const businessLicenseExpiresOn = dateField('businessLicenseExpiresOn')
const legalCertBeginOn = dateField('legalCertBeginOn')
const legalCertExpiresOn = dateField('legalCertExpiresOn')

function onProvinceChange() {
  form.value.companyAreaCode = ''
}
</script>

<template>
  <TForm label-position="top" class="realname-manual-form">
    <template v-if="props.businessSelected">
      <TFormItem label="企业名称" required>
        <TInput
          v-model="form.companyName"
          :disabled="props.disabled"
          placeholder="请输入营业执照上的企业名称"
        />
      </TFormItem>
      <TFormItem label="统一社会信用代码" required>
        <TInput
          v-model="form.unifiedSocialCreditCode"
          :disabled="props.disabled"
          :maxlength="18"
          placeholder="请输入营业执照上的统一社会信用代码"
        />
      </TFormItem>
      <TFormItem label="经办人姓名" required>
        <TInput
          v-model="form.operatorName"
          :disabled="props.disabled"
          placeholder="请输入经办人姓名"
        />
      </TFormItem>
      <TFormItem label="经办人身份证号" required>
        <TInput
          v-model="form.operatorIdCardNo"
          :disabled="props.disabled"
          :maxlength="18"
          placeholder="请输入经办人身份证号"
        />
      </TFormItem>
      <TFormItem label="企业所在省市" required>
        <div class="realname-manual-form__region">
          <TSelect
            v-model="form.companyProvCode"
            :disabled="props.disabled"
            placeholder="省份"
            style="width: 100%"
            @change="onProvinceChange"
          >
            <TOption
              v-for="province in settlementProvinces"
              :key="province.value"
              :label="province.title"
              :value="province.value"
            />
          </TSelect>
          <TSelect
            v-model="form.companyAreaCode"
            :disabled="props.disabled || !form.companyProvCode"
            placeholder="城市"
            style="width: 100%"
          >
            <TOption
              v-for="city in cities"
              :key="city.value"
              :label="city.title"
              :value="city.value"
            />
          </TSelect>
        </div>
      </TFormItem>
      <TFormItem label="企业注册地址" required>
        <TInput
          v-model="form.companyAddress"
          :disabled="props.disabled"
          :maxlength="200"
          placeholder="请输入营业执照上的注册地址"
        />
      </TFormItem>
      <TFormItem label="经营范围" required>
        <TInput
          v-model="form.businessScope"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          :disabled="props.disabled"
          :maxlength="200"
          placeholder="请输入营业执照上的经营范围"
        />
      </TFormItem>
      <TFormItem label="营业执照有效期" required>
        <TDatePicker
          v-model="businessLicenseExpiresOn"
          type="date"
          value-format="YYYYMMDD"
          format="YYYY-MM-DD"
          :disabled="props.disabled"
          placeholder="请选择有效期截止日"
          style="width: 100%"
        />
      </TFormItem>
      <TFormItem label="法人证件有效期" required>
        <div class="realname-manual-form__dates">
          <TDatePicker
            v-model="legalCertBeginOn"
            type="date"
            value-format="YYYYMMDD"
            format="YYYY-MM-DD"
            :disabled="props.disabled"
            placeholder="开始日期"
            style="width: 100%"
          />
          <span>至</span>
          <TDatePicker
            v-model="legalCertExpiresOn"
            type="date"
            value-format="YYYYMMDD"
            format="YYYY-MM-DD"
            :disabled="props.disabled"
            placeholder="截止日期"
            style="width: 100%"
          />
        </div>
      </TFormItem>
      <TFormItem label="法定代表人手机号" required>
        <TInput
          v-model="form.mobile"
          inputmode="tel"
          :maxlength="11"
          :disabled="props.disabled"
          placeholder="请输入法定代表人手机号"
        />
      </TFormItem>
    </template>

    <template v-else>
      <TFormItem label="姓名" required>
        <TInput
          v-model="form.realName"
          :disabled="props.disabled"
          placeholder="请输入身份证上的姓名"
        />
      </TFormItem>
      <TFormItem label="身份证号" required>
        <TInput
          v-model="form.idCardNo"
          :maxlength="18"
          :disabled="props.disabled"
          placeholder="请输入身份证号"
        />
      </TFormItem>
      <TFormItem label="手机号" required>
        <TInput
          v-model="form.mobile"
          inputmode="tel"
          :maxlength="11"
          :disabled="props.disabled"
          placeholder="请输入本人手机号"
        />
      </TFormItem>
    </template>

    <template v-if="form.guardianRequired">
      <TFormItem required>
        <TCheckbox v-model="form.guardianConsent" :disabled="props.disabled">
          我已取得监护人同意
        </TCheckbox>
      </TFormItem>
      <TFormItem label="监护人同意书" required>
        <RealnameMaterialUpload
          kind="consent"
          :uploading="props.consentUploading"
          :disabled="props.disabled"
          :file-name="form.guardianConsentFile"
          @picked="emit('consent-picked', $event)"
        >
          <a href="/guardian-consent-template.html" target="_blank" rel="noopener noreferrer">
            下载监护人同意书模板
          </a>
        </RealnameMaterialUpload>
      </TFormItem>
    </template>
  </TForm>
</template>

<style scoped>
.realname-manual-form {
  min-width: 0;
}

.realname-manual-form__region {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.realname-manual-form__dates {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
}

@media (max-width: 640px) {
  .realname-manual-form__region,
  .realname-manual-form__dates {
    grid-template-columns: 1fr;
  }
}
</style>
