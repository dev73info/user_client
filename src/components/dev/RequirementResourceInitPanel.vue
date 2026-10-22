<script setup lang="ts">
import { TButton, TFormItem, TIcon, TInput, TOption, TSelect, Refresh } from 'ui_73info'
import type { SelectModelValue } from 'ui_73info'
import type { TagEntryView, TagGroupView, TagRootView } from '@/shared/devRequirementDetail'

/**
 * 「初始化新资源项目」这一支的表单：标题 / 作者 / 转载信息 + 一级二级分类 + 标签勾选。
 *
 * 手上没有现成的私有资源时，接需求会先建一个草稿资源再绑定。分类是两级 chip（不是下拉），
 * 勾选就放在当前分类的标签组里；点任何一项都要回传父级——改了内容，上一层的二次确认就失效了。
 *
 * 组件只回传「点了哪一级的哪个 key / 哪一组勾了什么」，标签树本身与提交口径在
 * `useDevResourceInitForm`（底层复用 `useResourceTagCatalog`）。
 */
const props = defineProps<{
  roots: TagRootView[]
  entries: TagEntryView[]
  rootKey: string
  entryKey: string
  entryLabel: string
  groups: TagGroupView[]
  selectedTagIdsByGroup: Record<number, number[]>
  isLoadingTags: boolean
}>()

const emit = defineEmits<{
  /** 表单任何一处被手改：父级据此把二次确认作废。 */
  change: []
  selectRoot: [rootKey: string]
  selectEntry: [entryKey: string]
  refreshTags: []
  groupTags: [groupId: number, value: SelectModelValue]
}>()

const title = defineModel<string>('title', { required: true })
const author = defineModel<string>('author', { required: true })
const originType = defineModel<'original' | 'repost'>('originType', { required: true })
const originAuthor = defineModel<string>('originAuthor', { required: true })
const originUrl = defineModel<string>('originUrl', { required: true })
const originOrg = defineModel<string>('originOrg', { required: true })
const originNote = defineModel<string>('originNote', { required: true })

/** 标签组里某组被选中几个（读数「已选/总数」）。 */
function selectedCount(group: TagGroupView): number {
  return (props.selectedTagIdsByGroup[group.group_id] ?? []).length
}
</script>

<template>
  <section class="dev-requirement-hall__init-panel">
    <div class="dev-upload-grid dev-upload-grid--two">
      <TFormItem label="资源标题" required>
        <TInput
          show-count
          v-model="title"
          :maxlength="200"
          placeholder="例如 Better Combat Reloaded"
          @input="emit('change')"
        />
      </TFormItem>

      <TFormItem label="作者名称" required>
        <TInput
          v-model="author"
          :maxlength="100"
          placeholder="默认使用当前开发者账号"
          @input="emit('change')"
        />
      </TFormItem>

      <TFormItem label="类型">
        <TSelect v-model="originType" style="width: 100%" @change="emit('change')">
          <TOption label="原创" value="original" />
          <TOption label="转载" value="repost" />
        </TSelect>
      </TFormItem>

      <template v-if="originType === 'repost'">
        <TFormItem label="原作者">
          <TInput
            v-model="originAuthor"
            :maxlength="80"
            placeholder="原始资源的作者"
            @input="emit('change')"
          />
        </TFormItem>
        <TFormItem label="原始出处链接" required>
          <TInput
            v-model="originUrl"
            :maxlength="500"
            placeholder="原始出处 URL，例如原贴/来源页"
            @input="emit('change')"
          />
        </TFormItem>
        <TFormItem label="来源站点">
          <TInput
            v-model="originOrg"
            :maxlength="80"
            placeholder="例如：苦力怕论坛、CurseForge"
            @input="emit('change')"
          />
        </TFormItem>
        <TFormItem label="转载说明 / 授权">
          <TInput
            v-model="originNote"
            :maxlength="500"
            placeholder="授权情况、转载说明等（可选）"
            @input="emit('change')"
          />
        </TFormItem>
      </template>
    </div>

    <section v-if="roots.length > 0" class="dev-requirement-hall__catalog-block">
      <div class="dev-requirement-hall__catalog-head">
        <span class="dev-filter-label">一级分类</span>
        <TButton variant="text" :loading="isLoadingTags" @click="emit('refreshTags')"
          ><template #prefix
            ><TIcon><Refresh /></TIcon
          ></template>
          刷新标签
        </TButton>
      </div>
      <div class="dev-requirement-hall__catalog-chips">
        <button
          v-for="root in roots"
          :key="root.key"
          type="button"
          class="dev-requirement-hall__catalog-chip"
          :class="{ 'is-active': root.key === rootKey }"
          @click="emit('selectRoot', root.key)"
        >
          {{ root.label }}
        </button>
      </div>
    </section>

    <section v-if="entries.length > 0" class="dev-requirement-hall__catalog-block">
      <div class="dev-requirement-hall__catalog-head">
        <span class="dev-filter-label">二级分类</span>
        <span class="dev-section-desc">当前：{{ entryLabel }}</span>
      </div>
      <div class="dev-requirement-hall__catalog-chips">
        <button
          v-for="entry in entries"
          :key="entry.key"
          type="button"
          class="dev-requirement-hall__catalog-chip dev-requirement-hall__catalog-chip--secondary"
          :class="{ 'is-active': entry.key === entryKey }"
          @click="emit('selectEntry', entry.key)"
        >
          {{ entry.group_name }}
        </button>
      </div>
    </section>

    <div v-if="groups.length > 0" class="dev-requirement-hall__tag-groups">
      <section v-for="group in groups" :key="group.key" class="dev-requirement-hall__tag-group">
        <div class="dev-requirement-hall__tag-group-head">
          <div>
            <h4 class="dev-requirement-hall__tag-group-title">{{ group.group_name }}</h4>
            <p class="dev-requirement-hall__tag-group-path">{{ group.label }}</p>
          </div>
          <span class="dev-requirement-hall__tag-group-count">
            {{ selectedCount(group) }}/{{ group.items.length }}
          </span>
        </div>

        <TSelect
          :model-value="selectedTagIdsByGroup[group.group_id] ?? []"
          multiple
          filterable
          placeholder="选择一个或多个标签"
          class="dev-requirement-hall__dialog-field"
          @update:model-value="emit('groupTags', group.group_id, $event)"
        >
          <TOption v-for="item in group.items" :key="item.id" :label="item.name" :value="item.id" />
        </TSelect>
      </section>
    </div>

    <p v-else class="dev-empty-state dev-requirement-hall__dialog-empty">
      当前分类下暂无可初始化资源的标签数据，请切换分类或刷新标签后重试。
    </p>
  </section>
</template>

<style scoped>
@container (max-width: 520px) {
  .dev-upload-grid--two {
    grid-template-columns: 1fr;
  }
}
</style>
