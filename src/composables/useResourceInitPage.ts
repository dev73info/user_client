import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  resolveResourceCreationType,
  resolveResourcePaidMode,
  resourceCreationRouteQuery,
} from '@/shared/resourceCreation'
import type { useResourceInitForm } from '@/composables/useResourceInitForm'
import type { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'

/** 创建页的类型路由同步、初始化加载与离场。 */
export function useResourceInitPage(options: {
  formState: ReturnType<typeof useResourceInitForm>
  tagCatalog: ReturnType<typeof useResourceTagCatalog>
}) {
  const { formState, tagCatalog } = options
  const { creationType, paidMode } = formState
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  function applyRouteSelection() {
    creationType.value = resolveResourceCreationType(route.query.type, route.query.kind)
    paidMode.value = resolveResourcePaidMode(route.query.mode)
  }

  applyRouteSelection()
  watch(() => [route.query.type, route.query.kind, route.query.mode], applyRouteSelection)

  watch(
    [creationType, paidMode],
    () => {
      const query = {
        ...route.query,
        ...resourceCreationRouteQuery(creationType.value, paidMode.value),
      }
      delete query.kind
      if (creationType.value !== 'paid') {
        delete query.mode
      }
      if (
        route.query.kind === undefined &&
        route.query.type === query.type &&
        route.query.mode === query.mode
      ) {
        return
      }
      void router.replace({ name: 'dev-plugins', query })
    },
    { immediate: route.query.kind !== undefined },
  )

  onMounted(async () => {
    auth.hydrate()
    if (auth.username) {
      formState.form.author = auth.username
    }
    await tagCatalog.loadTagTree()
    await formState.loadMyTeams()

    if (route.query.ownership === 'team' && formState.hasJoinedTeam.value) {
      formState.form.ownershipType = 'team'
      const onlyTeam = formState.myTeams.value[0]
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
