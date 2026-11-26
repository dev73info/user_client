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
import BetaTag from '@/components/BetaTag.vue'
import {
  formatDevResourceNetLabel,
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
  isResourceSaleLockedByRequirement,
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
    /** 当前平台抽成比例（基点）；读不到为 null。 */
    platformFeeBps?: number | null
    /** 费率读取失败：预计到手列明确写「暂不可用」，不静默留空。 */
    platformFeeError?: boolean
    /**
     * 可见的行操作码：需求方「我的资源」只有主页 / 公开 / 私有 / 版本这几项；
     * 不传 = 全开（开发者资源项目页）。
     */
    visibleActions?: readonly string[] | null
  }>(),
  {
    versionPrices: () => ({}),
    platformFeeBps: null,
    platformFeeError: false,
    visibleActions: null,
  },
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

/** 当前工作台是否提供这个动作（需求方「我的资源」不出现售出订单 / 过户 / 删除）。 */
function actionVisible(action: string): boolean {
  return props.visibleActions == null || props.visibleActions.includes(action)
}

/** 资源副标题：平台为空时回落「未知平台」，作者为空时不再留一个孤零零的斜杠。 */
function resourceMetaLabel(resource: McResourcePayload): string {
  return [resourcePlatformLabel(resource.platform), resource.author].filter(Boolean).join(' / ')
}

/** 状态列可能同时有可见性、BETA、锁定和曝光行程；悬浮提示给完整一行。 */
function resourceStatusTitle(resource: McResourcePayload): string {
  const parts = [resourceVisibilityLabel(resource.visibility)]
  if (isApiResourceKind(resource.resource_kind)) parts.push('BETA')
  if (isResourceArchiveLocked(resource)) parts.push('已锁定')
  return [...parts, formatExposureStatus(resource)].filter(Boolean).join(' · ')
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
    <!-- 列宽按容器弹性分配：只有右侧固定操作列写死宽度，其余列用下限参与分配，
         内容超出单元格时统一单行省略，完整值挂在 title 上。 -->
    <TTableColumn label="资源" min-width="190" resizable>
      <template #default="scope">
        <div class="dev-resource-table__title-cell">
          <img
            v-if="scope.row.cover_url"
            :src="coverUrl(scope.row)"
            alt="资源图标"
            class="dev-resource-table__icon"
          />
          <div>
            <div class="dev-resource-table__title-row">
              <button
                class="dev-resource-table__title-link"
                type="button"
                :title="scope.row.title"
                @click="emit('edit', scope.row)"
              >
                {{ scope.row.title }}
              </button>
              <!-- 付费资源（非接口）的 BETA 跟在标题后面；接口资源的 BETA 落在状态列的「接口资源」标签旁。 -->
              <BetaTag
                v-if="
                  !isApiResourceKind(scope.row.resource_kind) &&
                  hasDevResourcePrice(scope.row, versionPrices)
                "
              />
            </div>
            <div class="dev-resource-table__meta" :title="resourceMetaLabel(scope.row)">
              {{ resourceMetaLabel(scope.row) }}
            </div>
          </div>
        </div>
      </template>
    </TTableColumn>
    <!-- 标签只占一行，超出省略；完整值放在 title 里，避免把整行撑高。 -->
    <TTableColumn label="标签" min-width="100" resizable>
      <template #default="scope">
        <span class="dev-resource-table__tags" :title="resourceTagColumnLabel(scope.row)">
          {{ resourceTagColumnLabel(scope.row) }}
        </span>
      </template>
    </TTableColumn>
    <!-- 售价胶囊只留价格本身（BETA 已移到标题后）；宽度弹性，长价格省略后悬浮看全。 -->
    <TTableColumn label="售价" min-width="82" resizable>
      <template #default="scope">
        <span
          class="dev-resource-table__price-cell"
          :title="formatDevResourcePrice(scope.row, versionPrices)"
        >
          <TTag
            variant="outline"
            :tone="hasDevResourcePrice(scope.row, versionPrices) ? 'accent' : 'neutral'"
          >
            {{ formatDevResourcePrice(scope.row, versionPrices) }}
          </TTag>
        </span>
      </template>
    </TTableColumn>
    <!-- 预计到手：按当前费率对成交价做整数分估算，标「预计」，真实金额以落单快照为准。 -->
    <TTableColumn label="预计到手" min-width="84" resizable>
      <template #default="scope">
        <span
          v-if="!hasDevResourcePrice(scope.row, versionPrices)"
          class="dev-resource-table__meta"
          title="—"
          >—</span
        >
        <span
          v-else-if="props.platformFeeBps == null && props.platformFeeError"
          class="dev-resource-table__meta dev-resource-table__meta--error"
          title="费率暂不可用"
          >费率暂不可用</span
        >
        <span
          v-else
          class="dev-resource-table__net"
          :title="formatDevResourceNetLabel(scope.row, versionPrices, props.platformFeeBps) || '—'"
        >
          {{ formatDevResourceNetLabel(scope.row, versionPrices, props.platformFeeBps) || '—' }}
        </span>
      </template>
    </TTableColumn>
    <TTableColumn label="状态" min-width="100" resizable>
      <template #default="scope">
        <div class="dev-resource-table__status-tags" :title="resourceStatusTitle(scope.row)">
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
          <BetaTag v-if="isApiResourceKind(scope.row.resource_kind)" />
          <TTag
            v-if="isResourceArchiveLocked(scope.row)"
            variant="soft"
            tone="warning"
            data-testid="resource-archive-locked-tag"
          >
            已锁定
          </TTag>
        </div>
        <div
          v-if="formatExposureStatus(scope.row)"
          class="dev-resource-table__exposure"
          :title="formatExposureStatus(scope.row)"
        >
          {{ formatExposureStatus(scope.row) }}
        </div>
      </template>
    </TTableColumn>
    <TTableColumn
      prop="created_at"
      label="创建时间"
      min-width="92"
      resizable
      show-overflow-tooltip
    />
    <TTableColumn label="操作" width="118" fixed="right">
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
                v-if="actionVisible('publish') && rowActionAvailable('publish', scope.row)"
                :disabled="isResourceArchiveLocked(scope.row)"
                :command="{ action: 'publish', resource: scope.row }"
              >
                发布版本
              </TDropdownItem>
              <TDropdownItem
                v-if="
                  actionVisible('request-review') &&
                  ['draft', 'rejected'].includes(scope.row.visibility)
                "
                :disabled="
                  isResourceSaleLockedByRequirement(scope.row) ||
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
                v-if="actionVisible('set-private') && scope.row.visibility === 'published'"
                :disabled="isResourceArchiveLocked(scope.row) || settingPrivateId === scope.row.id"
                :command="{ action: 'set-private', resource: scope.row }"
              >
                {{ settingPrivateId === scope.row.id ? '设置中...' : '设为私有' }}
              </TDropdownItem>
              <TDropdownItem
                v-if="actionVisible('versions') && rowActionAvailable('versions', scope.row)"
                :command="{ action: 'versions', resource: scope.row }"
                >版本管理</TDropdownItem
              >
              <TDropdownItem
                v-if="actionVisible('sold-orders')"
                :command="{ action: 'sold-orders', resource: scope.row }"
              >
                售出订单
              </TDropdownItem>
              <TDropdownItem
                v-if="actionVisible('transfer')"
                :command="{ action: 'transfer', resource: scope.row }"
                :disabled="isResourceArchiveLocked(scope.row)"
              >
                资源过户
              </TDropdownItem>
              <TDropdownItem
                v-if="actionVisible('delete')"
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

<style scoped src="./dev-resource-table.css"></style>
