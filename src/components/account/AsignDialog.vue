<script setup lang="ts">
/**
 * 「爱签账户管理」弹窗：按 `kind` 切四套表单（改手机号 / 改法人 / 企业信息 / 改姓名）。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：请求、校验、toast 都在视图
 * （组件不碰 `@/api/*`、`TMessage`、`router`）。
 *
 * 状态归属：
 * - `visible` / `kind`：弹窗开合与当前是哪一套表单都由父级持有（入口分发在视图里）；
 * - 九个输入框的草稿 + 一组 `update:xxx`：父级的四个提交处理器读的是自己那份 `asign`，
 *   所以草稿留在视图，这里只做受控输入（不在组件内另存，避免两份草稿打架）；
 * - `loading`：各按钮的加载位由父级持有（请求在视图）；
 * - `mobileMasked`：「请输入本人手机号（当前 138****0000）」那句提示用的脱敏手机号。
 *
 * 样式：`.asign-row` / `.asign-hint` 是**全局**样式（`src/styles/profile.css` 的
 * 「账号弹窗的共用样式」一节）——它同时被「印章管理」用，两个弹窗各带一份副本只会让同一个
 * 规格有两处正本，所以 R047 收口时收回了全局样式表。
 */
import { computed } from 'vue'

import { TButton, TDialog, TInput } from 'ui_73info'

/** 每个按钮各自的加载位。 */
type AsignLoading = {
  sendCode: boolean
  mobileByCode: boolean
  legalPerson: boolean
  company: boolean
  personal: boolean
}

/** 四套表单各自的标题；认不出来时回落到通用标题。 */
const TITLES: Record<string, string> = {
  mobile: '修改手机号',
  legalPerson: '修改法人',
  company: '企业信息',
  personal: '修改姓名',
}

const props = defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 当前要改什么：`mobile` / `legalPerson` / `company` / `personal`。 */
  kind: string
  /** 改手机号：新手机号。 */
  mobile: string
  /** 改手机号：短信验证码。 */
  code: string
  /** 改法人：新法人姓名。 */
  legalPersonName: string
  /** 改法人：新法人身份证号。 */
  legalPersonIdCard: string
  /** 企业信息：新企业名称。 */
  companyName: string
  /** 企业信息：法人姓名。 */
  companyLegalName: string
  /** 企业信息：法人身份证号。 */
  companyLegalIdCard: string
  /** 改姓名：新姓名。 */
  personalName: string
  /** 改姓名：本人手机号。 */
  personalMobile: string
  /** 各按钮的加载位（父级那份 `asignLoading`）。 */
  loading: AsignLoading
  /** 当前实名主体的脱敏手机号，用于「修改姓名」里的提示文案。 */
  mobileMasked: string
}>()

const emit = defineEmits<{
  /** 关闭弹窗，父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  'update:mobile': [mobile: string]
  'update:code': [code: string]
  'update:legal-person-name': [name: string]
  'update:legal-person-id-card': [idCard: string]
  'update:company-name': [name: string]
  'update:company-legal-name': [name: string]
  'update:company-legal-id-card': [idCard: string]
  'update:personal-name': [name: string]
  'update:personal-mobile': [mobile: string]
  /** 改手机号：点了「发送验证码」。 */
  'send-code': []
  /** 改手机号：点了「确认修改」。 */
  'modify-mobile': []
  /** 改法人：点了「确认修改」。 */
  'modify-legal-person': []
  /** 企业信息：点了「确认修改」。 */
  'modify-company': []
  /** 改姓名：点了「确认修改」。 */
  'modify-user-name': []
}>()

const title = computed(() => TITLES[props.kind] ?? '爱签账户管理')

/** 「修改姓名」里手机号输入框的提示：带上当前脱敏号，让人知道自己现在的号是多少。 */
const personalMobilePlaceholder = computed(() =>
  props.mobileMasked ? `请输入本人手机号（当前 ${props.mobileMasked}）` : '请输入本人手机号',
)

/** 受控输入：取值来自父级，写入立刻回传（九个字段同一套写法）。 */
const mobile = computed({
  get: () => props.mobile,
  set: (next: string) => emit('update:mobile', next),
})

const code = computed({
  get: () => props.code,
  set: (next: string) => emit('update:code', next),
})

const legalPersonName = computed({
  get: () => props.legalPersonName,
  set: (next: string) => emit('update:legal-person-name', next),
})

const legalPersonIdCard = computed({
  get: () => props.legalPersonIdCard,
  set: (next: string) => emit('update:legal-person-id-card', next),
})

const companyName = computed({
  get: () => props.companyName,
  set: (next: string) => emit('update:company-name', next),
})

const companyLegalName = computed({
  get: () => props.companyLegalName,
  set: (next: string) => emit('update:company-legal-name', next),
})

const companyLegalIdCard = computed({
  get: () => props.companyLegalIdCard,
  set: (next: string) => emit('update:company-legal-id-card', next),
})

const personalName = computed({
  get: () => props.personalName,
  set: (next: string) => emit('update:personal-name', next),
})

const personalMobile = computed({
  get: () => props.personalMobile,
  set: (next: string) => emit('update:personal-mobile', next),
})
</script>

<template>
  <TDialog
    :open="props.visible"
    :title="title"
    class="asign-dialog"
    width="520px"
    @update:open="emit('update:visible', $event)"
  >
    <template v-if="props.kind === 'mobile'">
      <p class="asign-hint">换绑后，合同签署短信会发到新手机号。</p>
      <div class="asign-row">
        <TInput v-model="mobile" placeholder="新手机号" />
        <TButton variant="outline" :loading="props.loading.sendCode" @click="emit('send-code')"
          >发送验证码</TButton
        >
      </div>
      <div class="asign-row">
        <TInput v-model="code" placeholder="短信验证码" />
        <TButton
          variant="solid"
          tone="accent"
          :loading="props.loading.mobileByCode"
          @click="emit('modify-mobile')"
          >确认修改</TButton
        >
      </div>
    </template>

    <template v-else-if="props.kind === 'legalPerson'">
      <p class="asign-hint">变更法人需重新核验：请填写新法人的姓名与身份证号。</p>
      <div class="asign-row">
        <TInput v-model="legalPersonName" placeholder="法人姓名" />
      </div>
      <div class="asign-row">
        <TInput v-model="legalPersonIdCard" placeholder="法人身份证号" />
      </div>
      <TButton
        variant="solid"
        tone="accent"
        :loading="props.loading.legalPerson"
        @click="emit('modify-legal-person')"
        >确认修改</TButton
      >
    </template>

    <template v-else-if="props.kind === 'company'">
      <p class="asign-hint">修改企业名称将自动生成新印章，法人信息请配合身份证号填写。</p>
      <div class="asign-row">
        <TInput v-model="companyName" placeholder="新企业名称（可选）" />
      </div>
      <div class="asign-row">
        <TInput v-model="companyLegalName" placeholder="法人姓名（可选）" />
      </div>
      <div class="asign-row">
        <TInput v-model="companyLegalIdCard" placeholder="法人身份证号（可选）" />
      </div>
      <TButton
        variant="solid"
        tone="accent"
        :loading="props.loading.company"
        @click="emit('modify-company')"
        >确认修改</TButton
      >
    </template>

    <template v-else-if="props.kind === 'personal'">
      <div class="asign-row">
        <TInput v-model="personalName" placeholder="新姓名" />
      </div>
      <div class="asign-row">
        <TInput
          v-model="personalMobile"
          inputmode="numeric"
          :maxlength="11"
          :placeholder="personalMobilePlaceholder"
        />
      </div>
      <TButton
        variant="solid"
        tone="accent"
        :loading="props.loading.personal"
        @click="emit('modify-user-name')"
        >确认修改</TButton
      >
    </template>
  </TDialog>
</template>
