<script setup lang="ts">
import type { McResourceVersionPayload } from '@/api/mcResources'
import { TButton, TDialog } from 'ui_73info'

/**
 * 「删除版本」弹窗：关联需求时是「提交删除审核」，否则直接删除。
 *
 * 文案与按钮随 `requirementId` 与 `target` 走，关窗与提交都在页面那一层（`useResourceVersionDialogs`）。
 */
const open = defineModel<boolean>('open', { required: true })

defineProps<{
  target: McResourceVersionPayload | null
  /** 资源关联的需求号：有值时删除要走需求方审核 */
  requirementId: string | null
  /** 正在删除：按钮转圈并防重复提交 */
  submitting: boolean
  /** 版本文件名（页面提供的纯展示口径） */
  fileNameOf: (version: McResourceVersionPayload) => string
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <TDialog
    v-model:open="open"
    width="520px"
    class="dev-dialog"
    :title="target ? `删除版本 · ${target.version}` : '删除版本'"
    @close="emit('close')"
  >
    <div class="dev-version-delete-dialog">
      <p>
        {{
          requirementId
            ? '提交后需要需求发起人在用户端审核，同意后该版本才会真正删除。'
            : '删除后该版本文件将被永久移除，且无法恢复。'
        }}
      </p>
      <p v-if="target"><strong>版本号：</strong>{{ target.version }}</p>
      <p v-if="target"><strong>资源文件：</strong>{{ fileNameOf(target) }}</p>
    </div>

    <template #footer>
      <TButton :disabled="submitting" @click="emit('close')">取消</TButton>
      <TButton variant="solid" tone="danger" :loading="submitting" @click="emit('confirm')">
        {{ requirementId ? '确认提交删除审核' : '确认删除版本' }}
      </TButton>
    </template>
  </TDialog>
</template>
