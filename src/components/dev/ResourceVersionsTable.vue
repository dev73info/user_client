<script setup lang="ts">
import type { McResourceVersionPayload } from '@/api/mcResources'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

import {
  ArrowDown,
  TButton,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
  TTable,
  TTableColumn,
} from 'ui_73info'

/**
 * 版本列表表格：版本号、资源文件（下载链接）、富文本备注、发布时间与「更多」菜单。
 *
 * 只画与派发：下载地址、文件名与时间格式都是页面传进来的纯展示口径（组件不碰 `@/api`）；
 * 菜单的三个动作原样 emit，分发与请求在 `useResourceVersionDialogs` 里。
 */
defineProps<{
  rows: McResourceVersionPayload[]
  loading: boolean
  emptyText: string
  /** 资源已锁定：编辑 / 删除菜单项置灰（只能下载历史版本） */
  archiveLocked: boolean
  downloadUrlOf: (version: McResourceVersionPayload) => string
  fileNameOf: (version: McResourceVersionPayload) => string
  formatCreatedAt: (value: string) => string
}>()

const emit = defineEmits<{
  action: [command: string, version: McResourceVersionPayload]
}>()
</script>

<template>
  <TTable :loading="loading" :data="rows" stripe class="dev-table">
    <template #empty>
      <p class="dev-empty-state">{{ emptyText }}</p>
    </template>
    <TTableColumn prop="version" label="版本号" min-width="140" />
    <TTableColumn label="资源文件" min-width="220" show-overflow-tooltip>
      <template #default="scope">
        <a
          :href="downloadUrlOf(scope.row)"
          target="_blank"
          rel="noopener noreferrer"
          class="dev-version-link"
        >
          {{ fileNameOf(scope.row) }}
        </a>
      </template>
    </TTableColumn>
    <TTableColumn label="备注" min-width="180" show-overflow-tooltip>
      <template #default="scope">
        <span
          class="dev-version-note"
          v-html="scope.row.note ? sanitizeRichHtml(scope.row.note) : '无'"
        ></span>
      </template>
    </TTableColumn>
    <TTableColumn label="发布时间" min-width="180">
      <template #default="scope">
        {{ formatCreatedAt(scope.row.created_at) }}
      </template>
    </TTableColumn>
    <TTableColumn label="操作" width="120">
      <template #default="scope">
        <TDropdown trigger="click" @command="(cmd) => emit('action', String(cmd), scope.row)">
          <TButton variant="outline" tone="accent">
            <span>更多</span>
            <TIcon class="dev-action-caret">
              <ArrowDown />
            </TIcon>
          </TButton>
          <template #dropdown>
            <TDropdownMenu>
              <TDropdownItem command="download">下载</TDropdownItem>
              <TDropdownItem command="edit" :disabled="archiveLocked">编辑</TDropdownItem>
              <TDropdownItem
                command="delete"
                :disabled="archiveLocked || scope.row.delete_request_status === 'pending'"
              >
                {{ scope.row.delete_request_status === 'pending' ? '删除审核中' : '删除' }}
              </TDropdownItem>
            </TDropdownMenu>
          </template>
        </TDropdown>
      </template>
    </TTableColumn>
  </TTable>
</template>

<style scoped src="./resource-versions-table.css"></style>
