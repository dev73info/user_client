<script setup lang="ts">
import {
  TButton,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
  TTable,
  TTableColumn,
  TTag,
  ArrowDown,
} from 'ui_73info'

import type { McResourcePayload } from '@/api/mcResources'
import {
  formatDevResourcePrice,
  formatExposureStatus,
  hasDevResourcePrice,
} from '@/shared/devResourceList'
import {
  isApiResourceKind,
  isResourceRowActionAvailable,
  type ResourceRowAction,
} from '@/shared/resourceApi'
import {
  canDeleteResource,
  isResourceArchiveLocked,
  resourcePlatformLabel,
  resourceTagColumnLabel,
  resourceVisibilityLabel,
  resourceVisibilityTagType,
} from '@/shared/resourcePresentation'

/** 资源列表表格与行操作；价格、状态和封面都只读视图传入的数据。 */
const props = withDefaults(
  defineProps<{
    rows: McResourcePayload[]
    loading: boolean
    emptyText: string
    requestingReviewId: number | null
    settingPrivateId: number | null
    deletingId: number | null
    coverUrl: (resource: McResourcePayload) => string
    versionPrices?: Record<number, number>
  }>(),
  { versionPrices: () => ({}) },
)

const emit = defineEmits<{
  /** 点标题链接或整行：去「编辑资源主页」 */
  edit: [resource: McResourcePayload]
  /** 「更多」菜单的动作：交给视图的 `handleResourceCommand` 分发 */
  command: [payload: { action: string; resource: McResourcePayload }]
}>()

/** 菜单里与「接口资源没有的入口」共用的判据，取值域见 shared/resourceApi.ts。 */
function rowActionAvailable(action: ResourceRowAction, resource: McResourcePayload): boolean {
  return isResourceRowActionAvailable(action, resource.resource_kind)
}

/** 整行点击进入编辑；行内按钮、链接、下拉自己处理点击，不触发行跳转。 */
function handleRowClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target || target.closest('button, a, input, select, textarea, label, [role="button"]')) {
    return
  }

  const rowEl = target.closest('tr.t73-table__row')
  if (!rowEl?.parentElement) {
    return
  }

  const index = Array.from(rowEl.parentElement.children).indexOf(rowEl)
  const row = props.rows[index]
  if (row) {
    emit('edit', row)
  }
}
</script>

<template>
  <TTable
    :loading="loading"
    :data="rows"
    stripe
    class="dev-table dev-resource-table"
    @click="handleRowClick"
  >
    <template #empty>
      <p class="dev-empty-state">{{ emptyText }}</p>
    </template>
    <!-- 列宽可拖：`resizable` 打开表头右边缘的拖拽手柄；固定宽度留给内容，
         弹性宽度留给「资源」列，窄窗口下表格横向滚动而不是把标签挤到隔壁列。 -->
    <TTableColumn label="资源" min-width="200" resizable>
      <template #default="scope">
        <div class="dev-resource-table__title-cell">
          <img
            v-if="scope.row.cover_url"
            :src="coverUrl(scope.row)"
            alt="资源图标"
            class="dev-resource-table__icon"
          />
          <div>
            <button
              class="dev-resource-table__title-link"
              type="button"
              @click="emit('edit', scope.row)"
            >
              {{ scope.row.title }}
            </button>
            <div class="dev-resource-table__meta">
              {{ resourcePlatformLabel(scope.row.platform) }} / {{ scope.row.author }}
            </div>
          </div>
        </div>
      </template>
    </TTableColumn>
    <!-- 标签不截断：列宽内自然换行，这一行标签多时宁可把行撑高也不显示省略号 -->
    <TTableColumn label="标签" width="200" resizable>
      <template #default="scope">
        <span class="dev-resource-table__tags">{{ resourceTagColumnLabel(scope.row) }}</span>
      </template>
    </TTableColumn>
    <TTableColumn label="售价" width="96" resizable>
      <template #default="scope">
        <TTag
          variant="outline"
          :tone="hasDevResourcePrice(scope.row, versionPrices) ? 'accent' : 'neutral'"
        >
          {{ formatDevResourcePrice(scope.row, versionPrices) }}
        </TTag>
      </template>
    </TTableColumn>
    <TTableColumn label="状态" width="190" resizable>
      <template #default="scope">
        <div class="dev-resource-table__status-tags">
          <!-- 接口资源与普通资源共用同一套可见性标签，样式完全一致 -->
          <TTag
            variant="outline"
            :tone="resourceVisibilityTagType(scope.row.visibility)"
            :data-testid="
              isApiResourceKind(scope.row.resource_kind) ? 'resource-api-tag' : undefined
            "
          >
            {{ resourceVisibilityLabel(scope.row.visibility) }}
          </TTag>
          <TTag
            v-if="isResourceArchiveLocked(scope.row)"
            variant="soft"
            tone="warning"
            data-testid="resource-archive-locked-tag"
          >
            已锁定
          </TTag>
        </div>
        <div v-if="formatExposureStatus(scope.row)" class="dev-resource-table__exposure">
          {{ formatExposureStatus(scope.row) }}
        </div>
      </template>
    </TTableColumn>
    <TTableColumn prop="created_at" label="创建时间" width="150" resizable show-overflow-tooltip />
    <TTableColumn label="操作" width="118" fixed="right" resizable>
      <template #default="scope">
        <TDropdown
          trigger="click"
          @command="
            (cmd) => emit('command', cmd as { action: string; resource: McResourcePayload })
          "
        >
          <TButton variant="outline" tone="accent">
            <span>更多</span>
            <TIcon class="dev-action-caret">
              <ArrowDown />
            </TIcon>
          </TButton>
          <template #dropdown>
            <TDropdownMenu>
              <!-- 接口资源没有可下载文件、也不进任何公开面，
                   所以「发布版本 / 版本管理」对它不出现（判据见
                   shared/resourceApi.ts 的 isResourceRowActionAvailable）。 -->
              <TDropdownItem
                v-if="rowActionAvailable('publish', scope.row)"
                :disabled="isResourceArchiveLocked(scope.row)"
                :command="{ action: 'publish', resource: scope.row }"
              >
                发布版本
              </TDropdownItem>
              <TDropdownItem
                v-if="['draft', 'rejected'].includes(scope.row.visibility)"
                :disabled="
                  Boolean(scope.row.requirement_id) ||
                  isResourceArchiveLocked(scope.row) ||
                  requestingReviewId === scope.row.id
                "
                :command="{ action: 'request-review', resource: scope.row }"
              >
                {{
                  requestingReviewId === scope.row.id
                    ? '提交中...'
                    : scope.row.visibility === 'rejected'
                      ? '重新申请公开'
                      : '申请公开'
                }}
              </TDropdownItem>
              <TDropdownItem
                v-if="scope.row.visibility === 'published'"
                :disabled="isResourceArchiveLocked(scope.row) || settingPrivateId === scope.row.id"
                :command="{ action: 'set-private', resource: scope.row }"
              >
                {{ settingPrivateId === scope.row.id ? '设置中...' : '设为私有' }}
              </TDropdownItem>
              <TDropdownItem
                v-if="rowActionAvailable('versions', scope.row)"
                :command="{ action: 'versions', resource: scope.row }"
                >版本管理</TDropdownItem
              >
              <TDropdownItem :command="{ action: 'sold-orders', resource: scope.row }">
                售出订单
              </TDropdownItem>
              <TDropdownItem
                :command="{ action: 'transfer', resource: scope.row }"
                :disabled="isResourceArchiveLocked(scope.row)"
              >
                资源过户
              </TDropdownItem>
              <TDropdownItem
                :command="{ action: 'delete', resource: scope.row }"
                :disabled="
                  isResourceArchiveLocked(scope.row) ||
                  !canDeleteResource(scope.row) ||
                  deletingId === scope.row.id
                "
              >
                {{ deletingId === scope.row.id ? '删除中...' : '删除' }}
              </TDropdownItem>
            </TDropdownMenu>
          </template>
        </TDropdown>
      </template>
    </TTableColumn>
  </TTable>
</template>

<style scoped>
/* 整行可点：给出行可点击的视觉提示 */
.dev-resource-table :deep(.t73-table__row) {
  cursor: pointer;
}

.dev-resource-table__title-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dev-blue);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

/* 悬停色由视图挂在页容器上的自定义属性给（全站只有这一处用这支蓝，
   不往令牌层再加一档；见 `views/DevResourceListView.vue` 的 style）。 */
.dev-resource-table__title-link:hover {
  color: var(--dev-resource-link-hover);
}

.dev-resource-table__exposure {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dev-muted);
  line-height: 1.4;
}

/* 状态列里「可见性」与「已锁定」两个标签并排时要留缝 */
.dev-resource-table__status-tags {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
</style>
