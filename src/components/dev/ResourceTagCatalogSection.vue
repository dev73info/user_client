<script setup lang="ts">
import { TSelect, TOption, type SelectModelValue } from 'ui_73info'
import type { McPublishTagGroup, McTagCatalogEntry, McTagCatalogRoot } from '@/api/resourceTags'

/**
 * 「标签归类」整块：根节点 / 二级节点两个下拉，加当前分区下的标签组。
 *
 * 下拉的候选与「当前：」读数都由父级算好（定位规则在 `useResourceTagCatalog` 与
 * `shared/resourceTagPath`），这里只做展示与回传：根 / 二级节点改选走事件，
 * 标签组勾选也只回传「哪一组、选了什么」，不碰整份状态。
 */
defineProps<{
  rootKey: string
  entryKey: string
  rootLabel: string
  entryLabel: string
  roots: McTagCatalogRoot[]
  entries: McTagCatalogEntry[]
  groups: McPublishTagGroup[]
  selectedTagIdsByGroup: Record<number, number[]>
  isLoadingTags: boolean
  /**
   * 二级节点为空时是否仍显示根节点下拉与空态。编辑页整块隐藏（设计页没有归类可改）；
   * 新建页要说明「当前根节点还没配二级节点」，所以传 true。
   */
  showRootWhenEmpty?: boolean
  /** 二级节点为空时的那句提示（不传则整块不出现，编辑页保持原样）。 */
  emptyTreeHint?: string
}>()

const emit = defineEmits<{
  selectRoot: [value: SelectModelValue]
  selectEntry: [value: SelectModelValue]
  updateGroupTags: [groupId: number, tagIds: SelectModelValue]
}>()
</script>

<template>
  <section class="dev-upload-block dev-upload-block--split">
    <header class="dev-card-head">
      <section class="dev-card-head__title-block">
        <h3 class="dev-section-title">标签归类</h3>
      </section>
    </header>

    <div v-if="entries.length > 0 || showRootWhenEmpty" class="dev-catalog-section">
      <div class="dev-upload-grid dev-upload-grid--two">
        <section class="dev-catalog-select">
          <div class="dev-catalog-select__head">
            <span class="dev-catalog-select__label">根节点</span>
            <span class="dev-catalog-select__meta">当前：{{ rootLabel }}</span>
          </div>
          <TSelect
            aria-label="根节点"
            :model-value="rootKey"
            :loading="isLoadingTags"
            placeholder="选择根节点"
            @change="emit('selectRoot', $event)"
          >
            <TOption v-for="root in roots" :key="root.key" :label="root.label" :value="root.key" />
          </TSelect>
        </section>

        <section v-if="entries.length > 0" class="dev-catalog-select">
          <div class="dev-catalog-select__head">
            <span class="dev-catalog-select__label">二级节点</span>
            <span class="dev-catalog-select__meta">当前：{{ entryLabel }}</span>
          </div>
          <TSelect
            aria-label="二级节点"
            :model-value="entryKey"
            placeholder="选择二级节点"
            @change="emit('selectEntry', $event)"
          >
            <TOption
              v-for="entry in entries"
              :key="entry.key"
              :label="entry.group_name"
              :value="entry.key"
            />
          </TSelect>
        </section>
      </div>

      <div
        v-if="entries.length > 0 && groups.length > 0"
        class="dev-tag-group-panel dev-upload-grid dev-upload-grid--tag-groups"
      >
        <section v-for="group in groups" :key="group.key" class="dev-tag-group-row">
          <header class="dev-tag-group-row__head">
            <section class="dev-tag-group-row__copy">
              <h4 class="dev-tag-group-row__title">{{ group.group_name }}</h4>
              <p class="dev-tag-group-row__path" :title="group.label">{{ group.label }}</p>
            </section>
            <span class="dev-tag-group-row__count"
              >{{ (selectedTagIdsByGroup[group.group_id] ?? []).length }}/{{
                group.items.length
              }}</span
            >
          </header>
          <div class="dev-tag-group-row__field">
            <TSelect
              :model-value="selectedTagIdsByGroup[group.group_id] ?? []"
              multiple
              filterable
              placeholder="选择一个或多个标签"
              @update:model-value="emit('updateGroupTags', group.group_id, $event)"
            >
              <TOption
                v-for="item in group.items"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </TSelect>
          </div>
        </section>
      </div>
      <p v-else-if="entries.length > 0" class="dev-empty-state">
        当前二级节点尚未配置完整标签组，请先在管理端补齐标签树。
      </p>
      <p v-else class="dev-empty-state">{{ emptyTreeHint }}</p>
    </div>
  </section>
</template>
