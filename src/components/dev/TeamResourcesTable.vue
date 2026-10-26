<script setup lang="ts">
import type { McResourcePayload } from '@/api/mcResources'
import {
  canDeleteResource,
  isResourceArchiveLocked,
  resourcePlatformLabel,
  resourceTagColumnLabel,
  resourceVisibilityLabel,
  resourceVisibilityTagType,
} from '@/shared/resourcePresentation'

import {
  ArrowDown,
  TButton,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
  TTable,
  TTableColumn,
  TTag,
} from 'ui_73info'

/**
 * 「团队资源」六列表格与「更多」菜单：资源、标签、状态、创建时间、操作。
 *
 * 只画与派发：可见性标签、锁定态用 `@/shared` 的纯口径，封面地址由视图传进来
 * （`apiUrl` 属于 `@/api/http`，组件里不碰 `@/api`）；点标题链接 emit `open`，
 * 「更多」菜单 emit `command`，分发与请求都在 `useTeamResourceRowActions` 里。
 */
defineProps<{
  /** 当前页的行（视图那边的 `paged` 切片） */
  rows: McResourcePayload[]
  loading: boolean
  /** 空态文案（加载中 / 筛不出来 / 还没有资源） */
  emptyText: string
  /** 正在提交公开审核的资源 id：对应菜单项置灰并改文案为「提交中...」 */
  requestingReviewId: number | null
  /** 正在设为私有的资源 id */
  settingPrivateId: number | null
  /** 正在删除的资源 id */
  deletingId: number | null
  /** 封面绝对地址：视图把 `apiUrl` 闭包进来，组件不直接依赖 `@/api/http` */
  coverUrl: (resource: McResourcePayload) => string
}>()

const emit = defineEmits<{
  /** 点资源标题：去资源主页 */
  open: [resource: McResourcePayload]
  /** 「更多」菜单的动作：交给视图的 `handleResourceCommand` 分发 */
  command: [payload: { action: string; resource: McResourcePayload }]
}>()
</script>

<template>
  <TTable :loading="loading" :data="rows" stripe class="dev-table dev-resource-table">
    <template #empty>
      <p class="dev-empty-state">{{ emptyText }}</p>
    </template>
    <TTableColumn label="资源" min-width="160">
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
              @click="emit('open', scope.row)"
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
    <TTableColumn label="标签" min-width="120">
      <template #default="scope">
        <span class="dev-resource-table__tags">{{ resourceTagColumnLabel(scope.row) }}</span>
      </template>
    </TTableColumn>
    <TTableColumn label="状态" min-width="110">
      <template #default="scope">
        <div class="dev-resource-table__status-tags">
          <TTag variant="outline" :tone="resourceVisibilityTagType(scope.row.visibility)">
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
      </template>
    </TTableColumn>
    <TTableColumn prop="created_at" label="创建时间" min-width="150" />
    <TTableColumn label="操作" min-width="120" fixed="right">
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
              <TDropdownItem :command="{ action: 'view', resource: scope.row }"
                >资源主页</TDropdownItem
              >
              <TDropdownItem
                :command="{ action: 'publish', resource: scope.row }"
                :disabled="isResourceArchiveLocked(scope.row)"
                >发布版本</TDropdownItem
              >
              <TDropdownItem
                v-if="scope.row.visibility === 'draft'"
                :disabled="
                  Boolean(scope.row.requirement_id) ||
                  isResourceArchiveLocked(scope.row) ||
                  requestingReviewId === scope.row.id
                "
                :command="{ action: 'request-review', resource: scope.row }"
              >
                {{ requestingReviewId === scope.row.id ? '提交中...' : '申请公开' }}
              </TDropdownItem>
              <TDropdownItem
                v-if="scope.row.visibility === 'published'"
                :disabled="isResourceArchiveLocked(scope.row) || settingPrivateId === scope.row.id"
                :command="{ action: 'set-private', resource: scope.row }"
              >
                {{ settingPrivateId === scope.row.id ? '设置中...' : '设为私有' }}
              </TDropdownItem>
              <TDropdownItem :command="{ action: 'versions', resource: scope.row }"
                >版本管理</TDropdownItem
              >
              <TDropdownItem
                :command="{ action: 'edit', resource: scope.row }"
                :disabled="isResourceArchiveLocked(scope.row)"
                >编辑主页</TDropdownItem
              >
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

<style scoped src="./team-resources-table.css"></style>
