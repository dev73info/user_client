<script setup lang="ts">
import { TButton, TIcon, Back, Check, Refresh, View } from 'ui_73info'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

/**
 * 资源主页编辑页的顶部读数条与页面级操作。
 *
 * 形态与其余菜单页一致（读数在左、操作在右，刷新标签固定在 __action 槽）。
 * 这一页原来自己写了一条蓝调渐变横幅（封面缩略图 + 大标题 + 一行胶囊），与其它菜单页
 * 两套外观；标题与封面在下方「预览摘要」卡片里已有，这里不重复，只留可读的口径与操作。
 */
defineProps<{
  /** 接口资源固定不进大厅，可见性没有可操作的信息，读数条不展示。 */
  isApiKind: boolean
  visibilityLabel: string
  saving: boolean
  /** 到期锁定 / 协议未签时保存入口置灰。 */
  saveDisabled: boolean
  /** 接口资源没有对外主页，预览入口一并不放。 */
  showPreview: boolean
  previewUrl: string
  previewDisabled?: boolean
  previewDisabledReason?: string
  isLoadingTags: boolean
}>()

const emit = defineEmits<{
  back: []
  save: []
  refreshTags: []
}>()
</script>

<template>
  <WorkbenchBarSlot>
    <div class="dev-meta-strip">
      <!-- 接口资源固定不进大厅，可见性没有可操作的信息，读数条不展示 -->
      <template v-if="!isApiKind">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">可见性</span>
          <span class="dev-meta-strip__value">{{ visibilityLabel }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
      </template>
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">类别</span>
        <span class="dev-meta-strip__value">
          {{ isApiKind ? '接口资源' : '资源项目' }}
        </span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton variant="outline" @click="emit('back')"
          ><template #prefix
            ><TIcon><Back /></TIcon></template
          >返回</TButton
        >
        <!-- 不可预览时保留状态按钮但移除链接，避免打开无权访问的详情页。 -->
        <TButton
          variant="outline"
          v-if="showPreview"
          :as="previewDisabled ? 'button' : 'a'"
          :href="previewDisabled ? undefined : previewUrl"
          :target="previewDisabled ? undefined : '_blank'"
          :rel="previewDisabled ? undefined : 'noopener noreferrer'"
          :disabled="previewDisabled"
          :title="previewDisabledReason || undefined"
          ><template #prefix
            ><TIcon><View /></TIcon></template
          >预览</TButton
        >
        <TButton
          variant="solid"
          tone="accent"
          :loading="saving"
          :disabled="saveDisabled"
          @click="emit('save')"
          ><template #prefix
            ><TIcon><Check /></TIcon
          ></template>
          保存
        </TButton>
        <TButton
          icon-only
          aria-label="刷新标签"
          :loading="isLoadingTags"
          @click="emit('refreshTags')"
        >
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
