import { onMounted, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { resourceKindFromQuery } from '@/shared/resourceApi'
import type { McResourceKind } from '@/api/mcResources'
import type { useResourceInitForm } from '@/composables/useResourceInitForm'
import type { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'

/**
 * 「发布资源」创建页的加载与离场：类别来源（路由 props）、标签树 / 团队的加载时序、
 * 老链接改道、从「团队资源」页进入时的归属预选。
 *
 * 顺序不能换：标签树与团队都到手之后才判断 `?ownership=team`（那时才知道有没有团队）。
 */
export function useResourceInitPage(options: {
  /** 入口决定的资源类别（普通资源 / 接口资源各一条创建路由）。 */
  resourceKind: ComputedRef<McResourceKind>
  formState: ReturnType<typeof useResourceInitForm>
  tagCatalog: ReturnType<typeof useResourceTagCatalog>
}) {
  const { resourceKind, formState, tagCatalog } = options
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  onMounted(async () => {
    auth.hydrate()
    if (auth.username) {
      formState.form.author = auth.username
    }
    await tagCatalog.loadTagTree()
    await formState.loadMyTeams()

    // R028：入口已拆成两条创建路由，老链接上的 `?kind=api` 直接改道到接口资源创建页
    if (resourceKind.value !== 'api' && resourceKindFromQuery(route.query.kind) === 'api') {
      const query = { ...route.query }
      delete query.kind
      await router.replace({ name: 'dev-plugins-api', query })
      return
    }

    // 从「团队资源」页进入时，自动归属团队项目
    if (route.query.ownership === 'team' && formState.hasJoinedTeam.value) {
      formState.form.ownershipType = 'team'
      const onlyTeam = formState.myTeams.value[0]
      // 若只有一个团队，自动选中；多个团队则让用户挑选
      if (formState.myTeams.value.length === 1 && onlyTeam) {
        formState.form.teamId = String(onlyTeam.team_id)
      }
    }
  })

  function goBack() {
    if (window.history.state?.back) {
      router.back()
      return
    }
    router.push({ name: 'dev-resource-list' })
  }

  return { auth, goBack }
}
