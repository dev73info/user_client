import { computed, reactive, ref, watch, type Ref } from 'vue'
import { TMessage, type SelectModelValue } from 'ui_73info'
import type { CreateMcResourceTagSelection, McResourcePayload } from '@/api/mcResources'
import {
  getProcessedTagTree,
  invalidateTagTreeCache,
  type McPublishTagGroup,
  type McTagCatalogEntry,
  type McTagCatalogRoot,
  type McProcessedTagTree,
} from '@/api/resourceTags'
import { resolveDisplayTagPath, resolveTagPath, tagPathSegment } from '@/shared/resourceTagPath'

/**
 * 「标签归类」这一块的全部状态：标签树、根节点 / 二级节点下拉、各标签组的勾选。
 *
 * 这里最容易出错的两件事都在注释里写清了：
 * 1. 资源归类要按资源自己的 `tag_selections` 定位，而不是只看 `platform`；
 * 2. 定位不到时下拉会回落到标签树首项**只作展示**，保存必须原样带回资源原有归类
 *    （`tagPathResolved` 记着这件事，`keepSavedTags` 把它翻成保存口径）。
 */
export function useResourceTagCatalog(
  /** 已存资源（编辑页用来按资源自身归类定位）；新建页没有已存资源，不传参即可。 */
  resource: Ref<McResourcePayload | null> = ref<McResourcePayload | null>(null),
) {
  const processedTree = ref<McProcessedTagTree>({ roots: [] })
  const currentRootKey = ref('')
  const currentEntryKey = ref('')
  /**
   * 当前「根节点 / 二级节点」是否已经按该资源自身的归类定位到。
   *
   * 定位不到时（资源归类被删过 / 与标签树对不上），下拉与标签组只能回落到标签树首项**展示**；
   * 这个值为假表示界面上那份归类不是资源的。保存时不得把它当用户选择写回去
   * （见 keepSavedTags 与 buildTagSelections）。
   *
   * 初值是假：标签树到手前无从判断资源归类在不在树里。
   */
  const tagPathResolved = ref(false)
  const isLoadingTags = ref(false)
  const selectedTagIdsByGroup = reactive<Record<number, number[]>>({})

  const rootTabs = computed<McTagCatalogRoot[]>(() => processedTree.value.roots)
  const currentRoot = computed<McTagCatalogRoot | null>(
    () => rootTabs.value.find((r) => r.key === currentRootKey.value) ?? rootTabs.value[0] ?? null,
  )
  const entryTabs = computed<McTagCatalogEntry[]>(() => currentRoot.value?.entries ?? [])
  const currentEntry = computed<McTagCatalogEntry | null>(
    () =>
      entryTabs.value.find((entry) => entry.key === currentEntryKey.value) ??
      entryTabs.value[0] ??
      null,
  )
  const currentEntryLabel = computed(() => currentEntry.value?.group_name ?? '当前分区')
  const currentRootLabel = computed(() => currentRoot.value?.label ?? '根节点')
  /** 当前二级节点的平台标识与它的展示名（创建页拼简介 / 来源地址用）。 */
  const currentPlatform = computed(() => currentEntry.value?.platform ?? '')
  const currentPlatformLabel = computed(() => currentPlatform.value || '当前分区')
  const platformTagGroups = computed<McPublishTagGroup[]>(
    () => currentEntry.value?.publish_groups ?? [],
  )
  const selectedTagCount = computed(() =>
    platformTagGroups.value.reduce(
      (sum, group) => sum + (selectedTagIdsByGroup[group.group_id] ?? []).length,
      0,
    ),
  )
  const previewTagNames = computed(() =>
    platformTagGroups.value.flatMap((group) =>
      group.items
        .filter((item) => (selectedTagIdsByGroup[group.group_id] ?? []).includes(item.id))
        .map((item) => item.name),
    ),
  )
  const previewTagCount = computed(() => previewTagNames.value.length)

  /**
   * 资源自带归类、但这归类没能在这棵标签树里定位到（节点被删 / 改名）。
   *
   * 此时下拉与标签组只能回落到标签树首项**展示**，界面上的归类不是资源的；
   * 保存必须原样保留资源已保存的归类，不能因为显示回落就把它改掉。
   */
  const keepSavedTags = computed(
    () => !tagPathResolved.value && (resource.value?.tag_selections?.length ?? 0) > 0,
  )

  /** 归类路径第 index 段的展示名（预览卡用，口径与保存读数同源）。 */
  function selectedTagPathSegment(index: number): string {
    return tagPathSegment(index, {
      rootLabel: currentRoot.value?.label,
      entryLabel: currentEntry.value?.group_name,
      tagSelections: resource.value?.tag_selections,
    })
  }

  // 切分区后，把不属于当前分区的勾选清掉（换根节点时留着一堆失效 group_id 只会拖慢渲染）
  watch(
    platformTagGroups,
    (groups) => {
      const validGroupIds = new Set(groups.map((group) => group.group_id))
      for (const key of Object.keys(selectedTagIdsByGroup)) {
        const groupId = Number(key)
        if (!validGroupIds.has(groupId)) {
          delete selectedTagIdsByGroup[groupId]
          continue
        }
        const group = groups.find((item) => item.group_id === groupId)
        if (!group) continue
        const validTagIds = new Set(group.items.map((item) => item.id))
        selectedTagIdsByGroup[groupId] = (selectedTagIdsByGroup[groupId] ?? []).filter((tagId) =>
          validTagIds.has(tagId),
        )
      }
      for (const group of groups) {
        if (!selectedTagIdsByGroup[group.group_id]) {
          selectedTagIdsByGroup[group.group_id] = []
        }
      }
    },
    { immediate: true },
  )

  /** 标签组里某组的勾选被改（子组件只回传这一组的 id 列表，不碰整份状态）。 */
  function setGroupTagIds(groupId: number, value: SelectModelValue) {
    const list = Array.isArray(value) ? value : []
    selectedTagIdsByGroup[groupId] = list.filter((id): id is number => typeof id === 'number')
    // 注意：这里不动 tagPathResolved。勾选不改变「下拉里的归类是否定位到」这件事，
    // 回落态下勾了标签也不该把回落项当成开发者选的归类（提交口径见 buildTagSelections）。
  }

  async function loadTagTree() {
    isLoadingTags.value = true
    try {
      invalidateTagTreeCache()
      processedTree.value = await getProcessedTagTree()

      if (resource.value) {
        // 资源已在手：按资源自身的归类重新定位（刷新标签后不能把回显丢回首项）。
        // 已经定位到过的保持现状——刷新不该覆盖开发者当前正在改的归类与勾选。
        if (!tagPathResolved.value) {
          tagPathResolved.value = resolveTagPathFromResource()
          if (!tagPathResolved.value) {
            applyDisplayTagPathFallback()
          }
        }
        return
      }

      const firstRoot = processedTree.value.roots[0]
      if (firstRoot && !processedTree.value.roots.some((r) => r.key === currentRootKey.value)) {
        currentRootKey.value = firstRoot.key
        currentEntryKey.value = firstRoot.first_entry_key ?? ''
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载标签失败'
      TMessage.error(message)
    } finally {
      isLoadingTags.value = false
    }
  }

  /**
   * 根节点下拉改选：二级节点随之落到新根节点的首个二级节点，
   * 避免留下上一棵树里的失效 key（那会让二级节点停在兜底项上，看起来像没跟着切）。
   */
  function selectRoot(value: SelectModelValue) {
    const rootKey = typeof value === 'string' ? value : ''
    const root = rootTabs.value.find((item) => item.key === rootKey)
    if (!root) return
    currentRootKey.value = root.key
    currentEntryKey.value = root.first_entry_key ?? ''
    // 开发者自己选的归类，就是本次要提交的归类
    tagPathResolved.value = true
  }

  /** 二级节点下拉改选：选项由当前根节点决定，这里再确认一次值还在候选里。 */
  function selectEntry(value: SelectModelValue) {
    const entryKey = typeof value === 'string' ? value : ''
    if (!entryTabs.value.some((entry) => entry.key === entryKey)) return
    currentEntryKey.value = entryKey
    tagPathResolved.value = true
  }

  /**
   * 归类的提交口径。`isApiKind` 由调用方传（类别是表单字段，不在这块状态里）：
   * 接口资源不选标签归类、不属于任何根节点 / 二级节点，一个标签都不提交。
   */
  function buildTagSelections(isApiKind: boolean): CreateMcResourceTagSelection[] {
    if (isApiKind) {
      return []
    }

    const selections = platformTagGroups.value
      .map((group) => ({
        group_id: group.group_id,
        tag_ids: [...(selectedTagIdsByGroup[group.group_id] ?? [])],
      }))
      .filter((selection) => selection.tag_ids.length > 0)

    // 资源归类没定位到、界面上是回落项且一个标签都没勾时，别把它当成「开发者清空了所有标签」
    // 写回去 —— 原样回传资源已保存的归类（keepSavedTags 的判定见其注释）。
    if (keepSavedTags.value && selections.length === 0) {
      return (resource.value?.tag_selections ?? []).map((selection) => ({
        group_id: selection.group_id,
        tag_ids: [...selection.tag_ids],
      }))
    }

    return selections
  }

  /** 按资源自身的归类定位「根节点 / 二级节点」（只定位，不改勾选）。 */
  function resolveTagPathFromResource(): boolean {
    const keys = resolveTagPath(
      { platform: resource.value?.platform, tagSelections: resource.value?.tag_selections },
      rootTabs.value,
    )
    if (!keys) {
      return false
    }

    currentRootKey.value = keys.rootKey
    currentEntryKey.value = keys.entryKey
    return true
  }

  /** 归类定位不到时的展示回落：下拉停在标签树的根节点 / 其首个二级节点上。 */
  function applyDisplayTagPathFallback() {
    const keys = resolveDisplayTagPath(rootTabs.value, {
      rootKey: currentRootKey.value,
      entryKey: currentEntryKey.value,
    })
    currentRootKey.value = keys.rootKey
    currentEntryKey.value = keys.entryKey
  }

  /** 把资源已保存的归类回显到下拉与各标签组。 */
  function applyResourceTagSelections() {
    const selections = resource.value?.tag_selections ?? []
    for (const key of Object.keys(selectedTagIdsByGroup)) {
      delete selectedTagIdsByGroup[Number(key)]
    }
    for (const sel of selections) {
      selectedTagIdsByGroup[sel.group_id] = [...sel.tag_ids]
    }

    tagPathResolved.value = resolveTagPathFromResource()
    if (!tagPathResolved.value) {
      applyDisplayTagPathFallback()
    }
  }

  /** 清空勾选（换资源前复位用）。 */
  function resetTagSelections() {
    tagPathResolved.value = false
    for (const key of Object.keys(selectedTagIdsByGroup)) {
      delete selectedTagIdsByGroup[Number(key)]
    }
  }

  return {
    processedTree,
    currentRootKey,
    currentEntryKey,
    currentRoot,
    currentEntry,
    currentRootLabel,
    currentEntryLabel,
    currentPlatform,
    currentPlatformLabel,
    entryTabs,
    rootTabs,
    platformTagGroups,
    selectedTagIdsByGroup,
    selectedTagCount,
    previewTagCount,
    tagPathResolved,
    keepSavedTags,
    isLoadingTags,
    selectedTagPathSegment,
    setGroupTagIds,
    loadTagTree,
    selectRoot,
    selectEntry,
    buildTagSelections,
    applyResourceTagSelections,
    resetTagSelections,
  }
}
