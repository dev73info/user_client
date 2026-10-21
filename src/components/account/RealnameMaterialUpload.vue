<script setup lang="ts">
/**
 * 证照 / 同意书的上传行：隐藏的原生文件选择框 + 「选择文件上传」按钮 + 一行状态说明。
 *
 * 从 `RealnameDialog` 里再拆一层的唯一原因：企业开户进件要传三张证照加一份同意书，
 * 四段几乎一样的标记会让实名弹窗自己顶到行数预算线上。四处的差别只有「收什么格式」
 * 「没传时怎么提示」「文件名的兜底叫法」，正好是 `kind` 一张表。
 *
 * **点开文件选择框留在这里**：`<input>` 节点在本组件里，`ref` 拿不到跨组件边界，
 * 「点按钮 → 弹系统选择框」只能跟着节点走。校验 / 上传 / OCR 全在
 * `composables/useRealnameMaterials.ts`，本组件只把选好的 `File` emit 出去，
 * 不碰 `@/api/*`、`TMessage`、`router`。
 *
 * 样式：`.realname-consent-upload*` / `.realname-consent-template` 整组随节点搬进来
 * （父级 scoped 对子组件节点不命中，留在父级会整组失效）。
 */
import { computed, ref } from 'vue'

import { TButton } from 'ui_73info'

/** 四份材料的收件口径（accept / 未上传时的说明 / 文件名兜底）。 */
const KINDS = {
  businessLicense: {
    fallbackName: '营业执照',
    accept: '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf',
    hint: '请上传营业执照扫描件或照片（图片或 PDF，10MB 以内）',
  },
  legalCertFront: {
    fallbackName: '法人身份证人像面',
    accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
    hint: '请上传法人身份证人像面照片（图片，10MB 以内）',
  },
  legalCertBack: {
    fallbackName: '法人身份证国徽面',
    accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
    hint: '请上传法人身份证国徽面照片（图片，10MB 以内）',
  },
  consent: {
    fallbackName: '同意书',
    accept: '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf',
    hint: '请上传监护人签署的同意书（图片或 PDF，5MB 以内）',
  },
} as const

const props = defineProps<{
  /** 上传的是哪一份：决定 accept、说明文案与文件名兜底。 */
  kind: keyof typeof KINDS
  /** 上传（或随之而来的识别）进行中：按钮转圈。 */
  uploading: boolean
  /** 只读态：审核中或已通过后不许再传。 */
  disabled: boolean
  /** 已上传的文件路径（父级草稿里的那一项）；空串表示还没传。 */
  fileName: string
  /** 有值时顶掉文件名 / 说明的位置（营业执照识别中那句「正在识别…」）。 */
  statusHint?: string
}>()

const emit = defineEmits<{
  /** 选好了文件（原生 input 已清空，同一个文件选第二次也会触发）。 */
  picked: [file: File]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const kindConfig = computed(() => KINDS[props.kind])

function openPicker() {
  inputRef.value?.click()
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 先清空：不清的话同一个文件第二次选不会触发 change
  input.value = ''
  if (!file) return
  emit('picked', file)
}

/** 只回显文件名，不暴露目录（路径由后端给，前缀长度不稳定）。 */
function displayName(): string {
  return props.fileName.split('/').pop() || kindConfig.value.fallbackName
}
</script>

<template>
  <div class="realname-consent-upload">
    <input
      ref="inputRef"
      class="realname-consent-upload__native"
      type="file"
      :accept="kindConfig.accept"
      @change="onChange"
    />
    <TButton
      variant="outline"
      :loading="props.uploading"
      :disabled="props.disabled"
      @click="openPicker"
    >
      选择文件上传
    </TButton>
    <span v-if="props.statusHint" class="realname-consent-upload__hint">
      {{ props.statusHint }}
    </span>
    <span v-else-if="props.fileName" class="realname-consent-upload__name">
      已上传：{{ displayName() }}
    </span>
    <span v-else class="realname-consent-upload__hint">{{ kindConfig.hint }}</span>
    <!-- 监护人同意书那一行后面还挂着一个「下载模板」链接 -->
    <slot />
  </div>
</template>

<style scoped>
.realname-consent-upload {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.realname-consent-upload__native {
  display: none;
}

.realname-consent-upload__name {
  color: #15803d;
  font-size: 13px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.realname-consent-upload__hint {
  color: #64748b;
  font-size: 12px;
}

.realname-consent-template {
  color: #d97706;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.realname-consent-template:hover {
  color: #b45309;
  opacity: 1;
}
</style>
