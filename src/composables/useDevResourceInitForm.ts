import { computed, reactive, ref, watch } from 'vue'
import type { CreateMcResourceRequest, McResourcePayload } from '@/api/mcResources'
import type { SelectModelValue } from 'ui_73info'
import { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'
import {
  buildBindingTagSelections,
  confirmResourceLabel,
  derivedResourceFileName,
  derivedResourceSourceUrl,
  resourceInitBlockReason,
  resourceInitSummary,
  type ResourceInitForm,
} from '@/shared/devRequirementBinding'
import { useAuthStore } from '@/stores/auth'

/**
 * 「初始化新资源项目」这一支的表单与标签归类。
 *
 * 接需求时若手上没有现成的私有资源，这一页会先建一个草稿资源再绑定（`visibility: 'draft'`），
 * 所以这里只管**建资源要用到的字段**：标题 / 作者 / 原创或转载信息 / 标签归类。
 * 标签树的定位、勾选与提交口径复用 `useResourceTagCatalog`（与资源主页编辑同一份规则，
 * 那边传资源、这边没有资源，传 `null` 即走「按标签树首项展示」的那条分支）。
 */
export function useDevResourceInitForm(options: { onChange?: () => void } = {}) {
  const auth = useAuthStore()
  const tagCatalog = useResourceTagCatalog(ref<McResourcePayload | null>(null))

  const initForm = reactive<ResourceInitForm>({
    title: '',
    author: '',
    originType: 'original',
    originAuthor: '',
    originUrl: '',
    originOrg: '',
    originNote: '',
  })

  const {
    rootTabs,
    entryTabs,
    currentRootKey,
    currentEntryKey,
    currentEntry,
    currentEntryLabel,
    platformTagGroups,
    selectedTagIdsByGroup,
    selectedTagCount,
    isLoadingTags,
    loadTagTree,
  } = tagCatalog

  /** 当前二级节点对应的平台（占位资源的 `platform` 字段与占位来源地址都要它）。 */
  const currentPlatform = computed(() => currentEntry.value?.platform ?? '')
  const currentPlatformLabel = computed(() => currentPlatform.value || '当前平台')

  const initSummary = computed(() =>
    resourceInitSummary({
      title: initForm.title,
      entryLabel: currentEntryLabel.value,
      platformLabel: currentPlatformLabel.value,
      selectedTagCount: selectedTagCount.value,
    }),
  )

  const createBlockReason = computed(() =>
    resourceInitBlockReason({
      form: initForm,
      tagGroupCount: platformTagGroups.value.length,
      selectedTagCount: selectedTagCount.value,
    }),
  )
  const canCreateResource = computed(() => !createBlockReason.value)

  /** 二次确认里显示的「即将关联到哪个资源」。 */
  const confirmLabel = computed(() =>
    confirmResourceLabel({ mode: 'new', initTitle: initForm.title }),
  )

  /** 表单有任何改动都要让上一层的「二次确认」失效（改了内容，确认过的就不是这一版了）。 */
  function touch() {
    options.onChange?.()
  }

  /** 作者默认填当前开发者账号（用户没自己改过才填）。 */
  function syncDefaultAuthor() {
    if (!initForm.author.trim() && auth.username) {
      initForm.author = auth.username
    }
  }

  watch(
    () => auth.username,
    () => syncDefaultAuthor(),
    { immediate: true },
  )

  /** 标签树只在第一次进「新资源」时取，之后复用（刷新按钮另说）。 */
  async function ensureTagTreeLoaded() {
    if (rootTabs.value.length > 0) {
      return
    }

    await loadTagTree()
  }

  function openRoot(rootKey: string) {
    if (rootKey === currentRootKey.value) {
      return
    }

    tagCatalog.selectRoot(rootKey)
    touch()
  }

  function openEntry(entryKey: string) {
    if (entryKey === currentEntryKey.value) {
      return
    }

    tagCatalog.selectEntry(entryKey)
    touch()
  }

  /** 某一组标签勾选被改：子组件只回传这一组的 id 列表。 */
  function setGroupTagIds(groupId: number, value: SelectModelValue) {
    tagCatalog.setGroupTagIds(groupId, value)
    touch()
  }

  /**
   * 换页（重进详情 / 换需求号）时复位。
   *
   * 只清标题、作者与标签勾选，转载那几栏原样留着——拆分前就是这个口径，
   * 换需求号不该顺手把用户填了一半的转载信息抹掉。
   */
  function resetInitForm() {
    initForm.title = ''
    initForm.author = auth.username || ''
    tagCatalog.resetTagSelections()
  }

  /** 转载资源必须有原始出处链接（与后台校验同一条前置，先在前端挡住免得白跑一趟）。 */
  function repostUrlMissing() {
    return initForm.originType === 'repost' && !initForm.originUrl.trim()
  }

  /** 建占位资源的请求体（`visibility: 'draft'`：绑定前不能被别人看到）。 */
  function buildCreatePayload(): CreateMcResourceRequest {
    return {
      platform: currentPlatform.value,
      title: initForm.title.trim(),
      author: initForm.author.trim(),
      description: initSummary.value,
      tag_selections: buildBindingTagSelections(platformTagGroups.value, selectedTagIdsByGroup),
      file_name: derivedResourceFileName(initForm.title),
      source_url: derivedResourceSourceUrl({
        title: initForm.title,
        platform: currentPlatform.value,
        entryKey: currentEntryKey.value,
      }),
      cover_url: null,
      docs_url: null,
      visibility: 'draft',
      release_note: null,
      origin_type: initForm.originType,
      origin_author: initForm.originAuthor.trim() || null,
      origin_url: initForm.originUrl.trim() || null,
      origin_org: initForm.originOrg.trim() || null,
      origin_note: initForm.originNote.trim() || null,
    }
  }

  return {
    initForm,
    rootTabs,
    entryTabs,
    currentRootKey,
    currentEntryKey,
    currentEntryLabel,
    currentPlatform,
    platformTagGroups,
    selectedTagIdsByGroup,
    selectedTagCount,
    isLoadingTags,
    initSummary,
    createBlockReason,
    canCreateResource,
    confirmLabel,
    loadTagTree,
    ensureTagTreeLoaded,
    openRoot,
    openEntry,
    setGroupTagIds,
    resetInitForm,
    repostUrlMissing,
    buildCreatePayload,
    touch,
  }
}
