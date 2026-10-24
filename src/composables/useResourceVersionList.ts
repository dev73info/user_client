import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import { HttpError } from '@/api/http'
import { extractResourceFileNameFromUrl, with73Extension } from '@/api/resources'
import {
  getMcResource,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
} from '@/api/mcResources'
import { useClientPagination } from '@/composables/useClientPagination'
import { buildUnifiedAuthUrl } from '@/config/runtime'
import { isResourceArchiveLocked } from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'
import { parseBackendDateTime } from '@/shared/datetime'

/**
 * 「版本管理」页的取数、筛选与分页：资源本身 + 全部版本、关键字搜索（版本号 / 备注 / 文件名）、
 * 客户端分页、删除审核中的条数与锁定只读判定。
 *
 * 版本表格与三个弹窗都要用的几个纯展示口径（下载地址、文件名、发布时间）也在这里出，
 * 由页面以函数 prop 传下去，组件不直接依赖 `@/api`。
 */
export function useResourceVersionList() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const loading = ref(false)
  const versionsLoading = ref(false)
  const resource = ref<McResourcePayload | null>(null)
  const versionRows = ref<McResourceVersionPayload[]>([])

  /* R014：所属需求进入到期锁定 / 已清除后，本页只读——只能下载历史版本，不能发版 / 编辑 / 删除
     （后端版本接口仍以 409 + 中文提示兜底）。 */
  const archiveLocked = computed(() =>
    resource.value ? isResourceArchiveLocked(resource.value) : false,
  )

  /** 关键字搜索：版本号、备注正文或文件名任一命中即可，与资源列表的口径一致。 */
  const filters = reactive({
    keyword: '',
  })

  const deletePendingCount = computed(
    () => versionRows.value.filter((version) => version.delete_request_status === 'pending').length,
  )

  const filteredVersions = computed(() => {
    const keyword = filters.keyword.trim().toLowerCase()
    if (!keyword) {
      return versionRows.value
    }

    return versionRows.value.filter((version) =>
      [
        version.version,
        // 备注是富文本，先去掉标签再参与匹配，否则搜「p」会把所有版本都命中
        (version.note ?? '').replace(/<[^>]*>/g, ' '),
        versionFileName(version),
      ].some((field) => field.toLowerCase().includes(keyword)),
    )
  })

  const hasActiveFilters = computed(() => filters.keyword.trim() !== '')

  function resetFilters() {
    filters.keyword = ''
  }

  /* 分页与其余菜单页同构（资源项目、团队资源、我的接单、收益钱包、需求大厅都带表尾分页器）。
     版本一次取回全部、搜索在前端做，所以这里是客户端切片，不走服务端页码。 */
  const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedVersions,
  } = useClientPagination(filteredVersions)

  /* 搜索一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空表。 */
  watch(
    () => filters.keyword,
    () => {
      page.value = 1
    },
  )

  function versionDownloadUrl(version: McResourceVersionPayload): string {
    return apiUrl(version.resource)
  }

  function versionFileName(version: McResourceVersionPayload): string {
    const fallbackFileName = `resource-${resource.value?.id ?? 'resource'}-v${version.id}`
    const sourceName = extractResourceFileNameFromUrl(version.resource, fallbackFileName)
    return with73Extension(sourceName, fallbackFileName)
  }

  function formatCreatedAt(value: string): string {
    // 后端时间是东八区墙钟串，解析口径见 shared/datetime.ts。
    const date = parseBackendDateTime(value)
    if (!date) {
      return value
    }

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function downloadVersion(version: McResourceVersionPayload) {
    const link = document.createElement('a')
    link.href = versionDownloadUrl(version)
    link.download = versionFileName(version)
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async function loadPage() {
    const resourceId = Number(route.params.resourceId)
    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      TMessage.warning('资源编号无效')
      router.replace({ name: 'dev-resource-list' })
      return
    }

    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      router.replace(buildUnifiedAuthUrl('login', route.fullPath))
      return
    }

    loading.value = true
    try {
      const [resourcePayload, versionsPayload] = await Promise.all([
        getMcResource(auth.token, resourceId),
        listMcResourceVersions(auth.token, resourceId),
      ])

      resource.value = resourcePayload
      versionRows.value = versionsPayload
    } catch (error) {
      // 404 同时覆盖「资源不存在」与「私有/待审资源无权查看」，按后端原文弹「not found」对用户没意义
      const message =
        error instanceof HttpError && error.status === 404
          ? '资源不存在或无权访问'
          : error instanceof Error
            ? error.message
            : '加载版本管理失败'
      TMessage.error(message)
      router.replace({ name: 'dev-resource-list' })
    } finally {
      loading.value = false
    }
  }

  async function reloadVersions() {
    if (!auth.token || !resource.value) {
      return
    }

    versionsLoading.value = true
    try {
      versionRows.value = await listMcResourceVersions(auth.token, resource.value.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载版本列表失败'
      TMessage.error(message)
    } finally {
      versionsLoading.value = false
    }
  }

  onMounted(async () => {
    auth.hydrate()
    await loadPage()
  })

  return {
    loading,
    versionsLoading,
    resource,
    versionRows,
    filters,
    hasActiveFilters,
    filteredVersions,
    deletePendingCount,
    archiveLocked,
    page,
    pageSize,
    filteredTotal,
    pagedVersions,
    resetFilters,
    loadPage,
    reloadVersions,
    versionDownloadUrl,
    versionFileName,
    formatCreatedAt,
    downloadVersion,
  }
}
