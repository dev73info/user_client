<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { TButton, TDialog, TForm, TFormItem, TInput, TSelect } from 'ui_73info'

import type { CommunityPost, CommunityTag, CreateCommunityPostPayload } from '@/api/community'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { COMMUNITY_REALNAME_REQUIRED } from '@/shared/api/errorCodes'

const props = defineProps<{
  post: CommunityPost | null
  tags: CommunityTag[]
  submitting: boolean
  error: string
  errorCode: string
}>()

const emit = defineEmits<{
  submit: [payload: CreateCommunityPostPayload]
  realname: []
}>()
const open = defineModel<boolean>('open', { required: true })
const form = reactive({ title: '', tagNames: [] as string[], content: '', bountyPoints: '0' })
const validationError = ref('')
const tagOptions = computed(() => {
  const options = props.tags.map((item) => ({ label: item.name, value: item.name }))
  for (const name of form.tagNames) {
    if (!options.some((item) => item.value === name)) options.push({ label: name, value: name })
  }
  return options
})

watch(open, (visible) => {
  if (!visible) return
  form.title = props.post?.title ?? ''
  form.tagNames = props.post?.tags.map((item) => item.name) ?? []
  form.content = props.post?.content_html ?? ''
  form.bountyPoints = String(props.post?.bounty_points ?? 0)
  validationError.value = ''
})

function submit() {
  const title = form.title.trim()
  const content = form.content.trim()
  const text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  const bounty = Number(form.bountyPoints)
  validationError.value = ''
  if (!title) validationError.value = '请输入帖子标题'
  else if (Array.from(title).length > 80) validationError.value = '标题不能超过 80 个字符'
  else if (!form.tagNames.length) validationError.value = '至少选择一个标签'
  else if (form.tagNames.length > 6) validationError.value = '最多选择 6 个标签'
  else if (!text) validationError.value = '请输入帖子内容'
  else if (!Number.isSafeInteger(bounty) || bounty < 0) {
    validationError.value = '悬赏积分必须是大于等于 0 的整数'
  }
  if (validationError.value) return

  emit('submit', {
    title,
    tag_names: form.tagNames,
    content_html: content,
    origin_type: props.post?.origin_type ?? 'original',
    origin_author: props.post?.origin_author ?? null,
    origin_url: props.post?.origin_url ?? null,
    origin_org: props.post?.origin_org ?? null,
    origin_note: props.post?.origin_note ?? null,
    bounty_points: props.post ? undefined : bounty,
  })
}
</script>

<template>
  <TDialog
    v-model:open="open"
    :title="post ? '编辑帖子' : '发布帖子'"
    width="760px"
    class="community-post-dialog"
    :mask-closable="!submitting"
  >
    <TForm label-position="top" @submit.prevent="submit">
      <TFormItem label="标题" required>
        <TInput v-model="form.title" :maxlength="80" placeholder="输入帖子标题" />
      </TFormItem>
      <TFormItem label="标签" required>
        <TSelect
          v-model="form.tagNames"
          multiple
          filterable
          :options="tagOptions"
          placeholder="选择 1–6 个标签"
          aria-label="帖子标签"
        />
      </TFormItem>
      <TFormItem label="正文" required>
        <RichTextEditor
          v-model="form.content"
          :floating-toolbar="false"
          min-height="240px"
          max-height="460px"
        />
      </TFormItem>
      <TFormItem v-if="!post" label="悬赏积分">
        <TInput v-model="form.bountyPoints" type="number" min="0" step="1" />
      </TFormItem>
      <p v-if="validationError || error" class="community-form-error" role="alert">
        {{ validationError || error }}
      </p>
      <TButton
        v-if="errorCode === COMMUNITY_REALNAME_REQUIRED"
        type="button"
        @click="emit('realname')"
      >
        去实名认证
      </TButton>
    </TForm>
    <template #footer>
      <TButton :disabled="submitting" @click="open = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">
        {{ post ? '保存并重新送审' : '提交审核' }}
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.community-form-error {
  margin: 0 0 12px;
  color: var(--73-danger);
  font-size: 13px;
  line-height: 1.6;
}
@media (max-width: 640px) {
  .community-post-dialog :deep(.t73-dialog__footer button) {
    min-height: 44px;
  }
}
</style>
