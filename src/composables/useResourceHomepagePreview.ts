import { computed, ref, type Ref } from 'vue'
import type { McPublishTagGroup } from '@/api/resourceTags'
import type { useResourceHomepageForm } from '@/composables/useResourceHomepageForm'
import { formatResourcePriceLabel } from '@/shared/resourceSale'

/**
 * 「资源主页编辑」页的页内预览：预览态开关 + 右栏预览摘要卡的展示值。
 *
 * 预览展示的是**已保存**的内容（详情面板按资源 id 重新取），进入预览不自动保存。
 * 卡片读数为纯换算：售价按当前输入实时算，标签取当前勾选、一个都没勾时回退二级节点名。
 */
export function useResourceHomepagePreview(options: {
  formState: ReturnType<typeof useResourceHomepageForm>
  platformTagGroups: Ref<McPublishTagGroup[]>
  selectedTagIdsByGroup: Record<number, number[]>
}) {
  const { formState, platformTagGroups, selectedTagIdsByGroup } = options

  const previewing = ref(false)
  function togglePreview() {
    previewing.value = !previewing.value
  }

  const priceFen = computed(() => {
    const parsed = formState.parsedPriceFen.value
    return parsed.ok ? parsed.fen : 0
  })
  const pricePoints = computed(() => {
    const parsed = formState.parsedPricePoints.value
    return parsed.ok ? parsed.points : 0
  })
  const tags = computed(() => {
    const names = platformTagGroups.value.flatMap((group) =>
      group.items
        .filter((item) => (selectedTagIdsByGroup[group.group_id] ?? []).includes(item.id))
        .map((item) => item.name),
    )
    return names.length > 0 ? names : [formState.previewEntryLabel.value].filter(Boolean)
  })

  /** 直接摊成 `ResourceHomepagePreviewAside` 的 props，模板里一行 v-bind。 */
  const previewCardProps = computed(() => ({
    coverPreview: formState.coverPreview.value,
    title: formState.heroTitle.value,
    description: formState.form.description,
    authorLabel: formState.resourceAuthorLabel.value,
    priceFen: priceFen.value,
    pricePoints: pricePoints.value,
    priceLabel: formatResourcePriceLabel(priceFen.value, pricePoints.value),
    originType: formState.form.originType,
    tags: tags.value,
  }))

  return { previewing, togglePreview, previewCardProps }
}
