<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown } from '@element-plus/icons-vue'

import { apiUrl } from '@/api/http'
import {
  listTeamResources,
  deleteMcResource,
  type McResourcePayload,
} from '@dev/api/mcResources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const isLoading = ref(false)
const deletingResourceId = ref<number | null>(null)
const resources = ref<McResourcePayload[]>([])
const { showToast } = useToast()

const emptyText = computed(() => {
  if (isLoading.value) {
    return '资源列表加载中'
  }
  return '当前还没有团队资源记录'
})

onMounted(async () => {
  auth.hydrate()
  await loadResources()
})

async function loadResources() {
  if (!auth.token) {
    resources.value = []
    return
  }

  isLoading.value = true
  try {
    resources.value = await listTeamResources(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载团队资源失败', 'error')
  } finally {
    isLoading.value = false
  }
}

function platformText(value: string): string {
  return value || '未知平台'
}

function visibilityText(value: McResourcePayload['visibility']): string {
  if (value === 'published') return '公开'
  if (value === 'review') return '审核中'
  return '私有'
}

function visibilityTagType(value: McResourcePayload['visibility']): 'success' | 'warning' | 'info' {
  if (value === 'published') return 'success'
  if (value === 'review') return 'warning'
  return 'info'
}

function ownershipText(value: McResourcePayload['ownership_type']): string {
  return value === 'team' ? '团队项目' : '个人项目'
}

function ownershipTagType(value: McResourcePayload['ownership_type']): 'primary' | 'info' {
  return value === 'team' ? 'primary' : 'info'
}

function tagSummary(resource: McResourcePayload): string {
  return resource.tag_selections.flatMap((group) => group.tag_names).join(' / ')
}

function resourceCoverUrl(resource: McResourcePayload): string {
  return apiUrl(resource.cover_url || '')
}

function canDeleteResource(resource: McResourcePayload) {
  return !resource.requirement_id
}

async function removeResource(resource: McResourcePayload) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!canDeleteResource(resource)) {
    showToast('已关联需求的资源不能删除', 'warning')
    return
  }

  const confirmed = window.confirm(
    `确认删除资源 ${resource.title} 吗？该操作会同时删除其历史版本，且不可撤销。`,
  )
  if (!confirmed) {
    return
  }

  deletingResourceId.value = resource.id
  try {
    await deleteMcResource(auth.token, resource.id)
    resources.value = resources.value.filter((item) => item.id !== resource.id)
    showToast('资源已删除', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除资源失败'
    showToast(message, 'error')
  } finally {
    deletingResourceId.value = null
  }
}

function openResourceHomepage(resource: McResourcePayload) {
  const tagSelections = resource.tag_selections ?? []
  const rootName = tagSelections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
  const entryName =
    tagSelections.find((s) => s.group_path.length > 1)?.group_path[1] ??
    (resource.platform || '')
  const rootAlias =
    tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)
      ?.group_path_aliases?.[0] ?? ''
  const entryAlias =
    tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)
      ?.group_path_aliases?.[1] ?? ''

  router.push({
    name: 'resource-detail',
    params: {
      rootSlug: rootAlias || getTagRouteSlug(rootName),
      entrySlug: entryAlias || getTagRouteSlug(entryName),
      resourceSlug: getResourceDetailSlug(resource.id, resource.creator || resource.author),
    },
  })
}

function handleResourceCommand(payload: { action: string; resource: McResourcePayload }) {
  if (payload.action === 'view') {
    openResourceHomepage(payload.resource)
    return
  }

  if (payload.action === 'delete') {
    void removeResource(payload.resource)
    return
  }

  if (payload.action === 'versions') {
    router.push({ name: 'dev-resource-versions', params: { resourceId: payload.resource.id } })
    return
  }

  if (payload.action === 'edit') {
    router.push({ name: 'dev-resource-homepage-edit', params: { resourceId: payload.resource.id } })
    return
  }
}
</script>

<template>
  <div class="dev-page dev-page--resource-list">
    <el-card shadow="never" class="dev-surface-card">
      <div class="dev-upload-section__head">
        <section>
          <h3 class="dev-section-title">团队资源项目</h3>
          <p class="dev-section-desc">管理并查看你所在团队共享的所有资源项目。</p>
        </section>
      </div>

      <el-table :data="resources" stripe v-loading="isLoading" class="dev-resource-table" :empty-text="emptyText">
        <el-table-column label="资源" min-width="260">
          <template #default="scope">
            <div class="dev-resource-table__title-cell">
              <img v-if="scope.row.cover_url" :src="resourceCoverUrl(scope.row)" alt="资源图标"
                class="dev-resource-table__icon" />
              <div>
                <button class="dev-resource-table__title-link" type="button" @click="openResourceHomepage(scope.row)">
                  {{ scope.row.title }}
                </button>
                <div class="dev-resource-table__meta">
                  {{ platformText(scope.row.platform) }} / {{ scope.row.author }}
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="260">
          <template #default="scope">
            <span class="dev-resource-table__tags">{{ tagSummary(scope.row) || '未附带标签' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="180">
          <template #default="scope">
            <el-tag :type="visibilityTagType(scope.row.visibility)" effect="plain">
              {{ visibilityText(scope.row.visibility) }}
            </el-tag>
            <el-tag :type="ownershipTagType(scope.row.ownership_type)" effect="plain" class="ml-2">
              {{ ownershipText(scope.row.ownership_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="180" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="scope">
            <el-dropdown trigger="click" popper-class="dev-resource-action-menu" @command="handleResourceCommand">
              <el-button type="primary" plain class="dev-resource-table__action-button">
                <span>更多</span>
                <el-icon class="dev-resource-table__action-caret">
                  <ArrowDown />
                </el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="{ action: 'view', resource: scope.row }">查看前台页面</el-dropdown-item>
                  <el-dropdown-item :command="{ action: 'versions', resource: scope.row }">版本管理</el-dropdown-item>
                  <el-dropdown-item :command="{ action: 'edit', resource: scope.row }">编辑主页</el-dropdown-item>
                  <el-dropdown-item :command="{ action: 'delete', resource: scope.row }"
                    :disabled="!canDeleteResource(scope.row) || deletingResourceId === scope.row.id">
                    {{ deletingResourceId === scope.row.id ? '删除中...' : '删除' }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.dev-resource-table__title-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.dev-resource-table__title-link:hover {
  color: var(--el-color-primary-light-3);
}
</style>
