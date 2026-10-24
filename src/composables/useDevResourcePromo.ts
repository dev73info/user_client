import { computed, ref, type Ref } from 'vue'

import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import { applyResourcePromoCard, type McResourcePayload } from '@/api/mcResources'
import {
  getResourcePromoMeta,
  listMyPromoCards,
  promoCardLabel,
  type PromoCard,
} from '@/api/points'
import { isFeaturedCardDisabled } from '@/shared/devResourceList'
import {
  isResourceArchiveLocked,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

/** 道具卡下拉的一项：文案与「被点赞门槛挡住」的判定都在 composable 里算好，弹窗只画。 */
export type PromoCardOption = {
  id: number
  label: string
  disabled: boolean
}

/**
 * 资源列表里的「使用道具」弹窗：拉背包、选卡、提交。
 *
 * 从 `views/DevResourceListView.vue` 抽出，三处校验（登录态 / 锁定 / 未发布）、
 * 点赞门槛的读法与请求实参逐段照搬。弹窗组件不碰 `@/api`，所以下拉选项的文案
 * （卡名 + 时长 + 被门槛挡住的原因）在这里拼好再传下去。
 */
export function useDevResourcePromo(deps: { resources: Ref<McResourcePayload[]> }) {
  const auth = useAuthStore()

  const promoDialogVisible = ref(false)
  const promoTarget = ref<McResourcePayload | null>(null)
  const unusedPromoCards = ref<PromoCard[]>([])
  const selectedPromoCardId = ref<number | null>(null)
  const applyingPromo = ref(false)
  /** 精选卡的点赞门槛：后端配置，拉不到时保留这里的默认值。 */
  const highLikeThreshold = ref(5)

  const promoCardOptions = computed<PromoCardOption[]>(() =>
    unusedPromoCards.value.map((card) => {
      const disabled = isFeaturedCardDisabled(card, promoTarget.value, highLikeThreshold.value)
      return {
        id: card.id,
        disabled,
        label: `${promoCardLabel(card.card_code)} · ${card.duration_days} 天${
          disabled ? `（点赞不足 ${highLikeThreshold.value}）` : ''
        }`,
      }
    }),
  )

  async function openPromoDialog(resource: McResourcePayload) {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    if (isResourceArchiveLocked(resource)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }
    if (resource.visibility !== 'published') {
      TMessage.warning('只能对已发布的资源使用道具卡')
      return
    }
    promoTarget.value = resource
    selectedPromoCardId.value = null
    promoDialogVisible.value = true
    try {
      const [cards, meta] = await Promise.all([
        listMyPromoCards(auth.token, 'unused'),
        getResourcePromoMeta(auth.token),
      ])
      unusedPromoCards.value = cards
      const threshold = Number(meta.high_like_threshold)
      if (Number.isFinite(threshold) && threshold >= 1) {
        highLikeThreshold.value = Math.floor(threshold)
      }
      const firstUsable = cards.find(
        (card) => !isFeaturedCardDisabled(card, resource, highLikeThreshold.value),
      )
      selectedPromoCardId.value = firstUsable?.id ?? cards[0]?.id ?? null
    } catch (error) {
      const message =
        error instanceof HttpError
          ? error.message
          : error instanceof Error
            ? error.message
            : '加载道具卡失败'
      TMessage.error(message)
    }
  }

  async function confirmApplyPromoCard() {
    if (!auth.token || !promoTarget.value || !selectedPromoCardId.value) {
      TMessage.warning('请选择一张道具卡')
      return
    }
    const card = unusedPromoCards.value.find((item) => item.id === selectedPromoCardId.value)
    if (card && isFeaturedCardDisabled(card, promoTarget.value, highLikeThreshold.value)) {
      TMessage.warning(`点赞数不足 ${highLikeThreshold.value}，无法使用精选卡`)
      return
    }
    applyingPromo.value = true
    try {
      const updated = await applyResourcePromoCard(
        auth.token,
        promoTarget.value.id,
        selectedPromoCardId.value,
      )
      const index = deps.resources.value.findIndex((item) => item.id === updated.id)
      if (index >= 0) {
        deps.resources.value[index] = { ...deps.resources.value[index], ...updated }
      }
      promoDialogVisible.value = false
      TMessage.success('道具卡已使用')
    } catch (error) {
      const message =
        error instanceof HttpError
          ? error.message
          : error instanceof Error
            ? error.message
            : '使用道具卡失败'
      TMessage.error(message)
    } finally {
      applyingPromo.value = false
    }
  }

  return {
    promoDialogVisible,
    promoTarget,
    selectedPromoCardId,
    applyingPromo,
    highLikeThreshold,
    promoCardOptions,
    unusedPromoCards,
    openPromoDialog,
    confirmApplyPromoCard,
  }
}
