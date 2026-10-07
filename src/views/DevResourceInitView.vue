<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createMcResource,
  updateMcResourceHomepage,
  uploadMcResourceCover,
  type CreateMcResourceTagSelection,
} from '@/api/mcResources'
import {
  getProcessedTagTree,
  invalidateTagTreeCache,
  type McPublishTagGroup,
  type McTagCatalogEntry,
  type McTagCatalogRoot,
  type McProcessedTagTree,
} from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { listMyTeams, type TeamResponse } from '@/api/team'
import ResourceIconPicker from '@/components/ResourceIconPicker.vue'


import {
  TButton,
  TCard,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TOption,
  TSelect,
  MagicStick,
  Refresh,
} from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { showToast } = useToast()

const processedTree = ref<McProcessedTagTree>({ roots: [] })
const currentRootKey = ref('')
const currentEntryKey = ref('')
const isLoadingTags = ref(false)
const submitting = ref(false)
const selectedIconFile = ref<File | null>(null)
const selectedTagIdsByGroup = reactive<Record<number, number[]>>({})
const myTeams = ref<TeamResponse[]>([])
const form = reactive({
  title: '',
  author: auth.username || '',
  coverUrl: '',
  ownershipType: 'individual' as 'individual' | 'team',
  teamId: '',
  originType: 'original' as 'original' | 'repost',
  originAuthor: '',
  originUrl: '',
  originOrg: '',
  originNote: '',
})

const rootTabs = computed<McTagCatalogRoot[]>(() => processedTree.value.roots)

const currentRoot = computed<McTagCatalogRoot | null>(() =>
  rootTabs.value.find((r) => r.key === currentRootKey.value) ?? rootTabs.value[0] ?? null,
)

const entryTabs = computed<McTagCatalogEntry[]>(() => currentRoot.value?.entries ?? [])

const currentEntry = computed<McTagCatalogEntry | null>(() =>
  entryTabs.value.find((entry) => entry.key === currentEntryKey.value) ?? entryTabs.value[0] ?? null,
)
const currentPlatform = computed(() => currentEntry.value?.platform ?? '')
const currentRootLabel = computed(() => currentRoot.value?.label || '根节点')
const currentEntryLabel = computed(() => currentEntry.value?.group_name ?? '当前分区')
const currentPlatformLabel = computed(() => currentPlatform.value || '当前分区')
const platformTagGroups = computed<McPublishTagGroup[]>(() => currentEntry.value?.publish_groups ?? [])
const selectedTagCount = computed(() => Object.values(selectedTagIdsByGroup).reduce((sum, ids) => sum + ids.length, 0))

const selectedGroupsSummary = computed(() =>
  platformTagGroups.value
    .map((group) => ({
      label: group.label,
      names: group.items
        .filter((item) => (selectedTagIdsByGroup[group.group_id] ?? []).includes(item.id))
        .map((item) => item.name),
    }))
    .filter((group) => group.names.length > 0),
)
const teamOptions = computed(() =>
  myTeams.value.map((team) => ({
    value: String(team.team_id),
    label: team.name,
  })),
)
const hasJoinedTeam = computed(() => myTeams.value.length > 0)

const resourceSummary = computed(() => {
  if (!form.title.trim()) {
    return ''
  }

  const scopeLabel = `${currentEntryLabel.value} · ${currentPlatformLabel.value}`
  return `${scopeLabel}资源，已选择 ${selectedTagCount.value} 个标签。`
})
const normalizedResourceKey = computed(() => {
  const base = form.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return base || 'resource'
})
const derivedFileName = computed(() => `${normalizedResourceKey.value}.package`)
const derivedSourceUrl = computed(() => {
  const platformKey = currentPlatform.value
  const entryKey = currentEntryKey.value || 'catalog'
  return `pending://resource/${platformKey}/${entryKey}/${normalizedResourceKey.value}`
})
const submitBlockReason = computed(() => {
  if (!form.title.trim()) {
    return '请填写资源标题'
  }

  if (!form.author.trim()) {
    return '请填写作者名称'
  }

  if (form.ownershipType === 'team' && !form.teamId) {
    return '请选择所属团队'
  }

  if (platformTagGroups.value.length === 0) {
    return '当前二级节点尚未配置完整标签组'
  }

  if (selectedTagCount.value === 0) {
    return '请至少选择一个标签'
  }

  return ''
})
const canSubmit = computed(() => {
  return !submitBlockReason.value
})

watch(
  () => auth.username,
  (username) => {
    if (!form.author.trim() && username) {
      form.author = username
    }
  },
  { immediate: true },
)

watch(
  () => form.ownershipType,
  (value) => {
    if (value !== 'team') {
      form.teamId = ''
    }
  },
)

watch(platformTagGroups, (groups) => {
  const validGroupIds = new Set(groups.map((group) => group.group_id))

  for (const key of Object.keys(selectedTagIdsByGroup)) {
    const groupId = Number(key)
    if (!validGroupIds.has(groupId)) {
      delete selectedTagIdsByGroup[groupId]
      continue
    }

    const group = groups.find((item) => item.group_id === groupId)
    if (!group) {
      continue
    }

    const validTagIds = new Set(group.items.map((item) => item.id))
    selectedTagIdsByGroup[groupId] = (selectedTagIdsByGroup[groupId] ?? []).filter((tagId) => validTagIds.has(tagId))
  }

  for (const group of groups) {
    if (!selectedTagIdsByGroup[group.group_id]) {
      selectedTagIdsByGroup[group.group_id] = []
    }
  }
}, { immediate: true })

onMounted(async () => {
  auth.hydrate()
  if (auth.username) {
    form.author = auth.username
  }
  await loadTagTree()
  await loadMyTeams()

  // 从「团队资源」页进入时，自动归属团队项目
  if (route.query.ownership === 'team' && hasJoinedTeam.value) {
    form.ownershipType = 'team'
    const onlyTeam = myTeams.value[0]
    // 若只有一个团队，自动选中；多个团队则让用户挑选
    if (myTeams.value.length === 1 && onlyTeam) {
      form.teamId = String(onlyTeam.team_id)
    }
  }
})

async function loadMyTeams() {
  if (!auth.token) return
  try {
    myTeams.value = await listMyTeams(auth.token)
  } catch (error) {
    console.error('Failed to load teams:', error)
  }
}

async function loadTagTree() {
  isLoadingTags.value = true
  try {
    invalidateTagTreeCache()
    processedTree.value = await getProcessedTagTree()

    const firstRoot = processedTree.value.roots[0]
    if (firstRoot && !processedTree.value.roots.some((r) => r.key === currentRootKey.value)) {
      currentRootKey.value = firstRoot.key
      currentEntryKey.value = firstRoot.first_entry_key ?? ''
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载标签失败'
    showToast(message, 'error')
  } finally {
    isLoadingTags.value = false
  }
}

function openRoot(rootKey: string, firstEntryKey: string | null) {
  if (rootKey === currentRootKey.value) {
    return
  }

  currentRootKey.value = rootKey
  currentEntryKey.value = firstEntryKey ?? ''
}

function openEntry(entryKey: string) {
  if (entryKey === currentEntryKey.value) {
    return
  }

  currentEntryKey.value = entryKey
}

function buildTagSelections(): CreateMcResourceTagSelection[] {
  return platformTagGroups.value
    .map((group) => ({
      group_id: group.group_id,
      tag_ids: [...(selectedTagIdsByGroup[group.group_id] ?? [])],
    }))
    .filter((selection) => selection.tag_ids.length > 0)
}

function resetForm() {
  form.title = ''
  form.author = auth.username || ''
  form.coverUrl = ''
  form.ownershipType = 'individual'
  form.teamId = ''
  form.originType = 'original'
  form.originAuthor = ''
  form.originUrl = ''
  form.originOrg = ''
  form.originNote = ''
  selectedIconFile.value = null

  for (const key of Object.keys(selectedTagIdsByGroup)) {
    selectedTagIdsByGroup[Number(key)] = []
  }
}

async function submitResource(mode: 'private' | 'public') {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!canSubmit.value) {
    showToast('请先补全必填字段和标签选择', 'warning')
    return
  }

  if (form.originType === 'repost' && !form.originUrl.trim()) {
    showToast('转载资源必须填写原始出处链接', 'warning')
    return
  }

  submitting.value = true

  try {
    let resource = await createMcResource(auth.token, {
      platform: currentPlatform.value,
      title: form.title.trim(),
      author: form.author.trim(),
      description: resourceSummary.value,
      tag_selections: buildTagSelections(),
      file_name: derivedFileName.value,
      source_url: derivedSourceUrl.value,
      cover_url: null,
      docs_url: null,
      visibility: 'draft',
      release_note: null,
      ownership_type: form.ownershipType,
      team_id: form.ownershipType === 'team' && form.teamId ? Number(form.teamId) : null,
      origin_type: form.originType,
      origin_author: form.originAuthor.trim() || null,
      origin_url: form.originUrl.trim() || null,
      origin_org: form.originOrg.trim() || null,
      origin_note: form.originNote.trim() || null,
    })

    if (selectedIconFile.value) {
      try {
        resource = await uploadMcResourceCover(auth.token, resource.id, selectedIconFile.value)
      } catch (error) {
        showToast(error instanceof Error ? `资源已初始化，但图标上传失败：${error.message}` : '资源已初始化，但图标上传失败', 'warning')
      }
    }

    if (mode === 'public') {
      resource = await updateMcResourceHomepage(auth.token, resource.id, {
        title: resource.title,
        author: resource.author,
        description: resource.description,
        cover_url: resource.cover_url,
        docs_url: resource.docs_url,
        visibility: 'review',
        release_note: resource.release_note,
        origin_type: form.originType,
        origin_author: form.originAuthor.trim() || null,
        origin_url: form.originUrl.trim() || null,
        origin_org: form.originOrg.trim() || null,
        origin_note: form.originNote.trim() || null,
      })
    }

    showToast(mode === 'public'
      ? `公开申请已提交，项目编号 #${resource.id}`
      : `资源已初始化为私有项目，编号 #${resource.id}`, 'success')
    resetForm()
    await router.push({ name: 'dev-resource-list' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布资源失败'
    showToast(message, 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-page--publish">
    <!-- 顶部读数条：与其余菜单页同一条形态（读数在左、页面级操作在右）。
         这一页原来直接从表单卡片开始，没有读数条；「刷新标签」也藏在标签卡片的卡片头里，
         同一个动作在别的页都在顶条右侧，这里挪上来后全模块只剩一个位置。 -->
    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">根节点</span>
        <span class="dev-meta-strip__value">{{ currentRootLabel }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">二级节点</span>
        <span class="dev-meta-strip__value">{{ currentEntryLabel }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已选标签</span>
        <span class="dev-meta-strip__value">{{ selectedTagCount }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only aria-label="刷新标签" :loading="isLoadingTags" @click="loadTagTree">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>

    <div class="dev-upload-layout">
      <TCard class="dev-surface-card dev-upload-combined-card">
        <section class="dev-upload-block">
          <header class="dev-card-head">
            <section class="dev-card-head__title-block">
              <h3 class="dev-section-title">基础信息</h3>
            </section>
          </header>

          <TForm label-position="top" class="dev-upload-form">
            <div class="dev-upload-grid dev-upload-grid--three">
              <TFormItem label="资源标题" required>
                <TInput show-count v-model="form.title"  :maxlength="200"
                  placeholder="例如：Better Combat Reloaded" />
              </TFormItem>

              <TFormItem label="归属类型" required>
                <TSelect v-model="form.ownershipType">
                  <TOption label="个人项目" value="individual" />
                  <TOption
                    label="团队项目"
                    value="team"
                    :disabled="!hasJoinedTeam" />
                </TSelect>
              </TFormItem>

              <TFormItem v-show="form.ownershipType === 'team'" label="所属团队" required>
                <div class="dev-team-select-native">
                  <TSelect
                    v-model="form.teamId"
                    placeholder="请选择团队"
                    class="dev-team-select-native__control">
                    <TOption
                      v-for="team in teamOptions"
                      :key="team.value"
                      :label="team.label"
                      :value="team.value" />
                    <template #empty>
                      <div class="dev-team-select-empty">
                        <p v-if="myTeams.length === 0">您还没有加入任何团队</p>
                        <p v-else>未找到匹配的团队</p>
                      </div>
                    </template>
                  </TSelect>

                </div>
              </TFormItem>

              <TFormItem label="类型">
                <TSelect v-model="form.originType" style="width: 100%">
                  <TOption label="原创" value="original" />
                  <TOption label="转载" value="repost" />
                </TSelect>
              </TFormItem>

              <template v-if="form.originType === 'repost'">
                <TFormItem label="原作者">
                  <TInput v-model="form.originAuthor"  :maxlength="80" placeholder="原始资源的作者" />
                </TFormItem>
                <TFormItem label="原始出处链接" required>
                  <TInput v-model="form.originUrl"  :maxlength="500" placeholder="原始出处 URL，例如原贴/来源页" />
                </TFormItem>
                <TFormItem label="来源站点">
                  <TInput v-model="form.originOrg"  :maxlength="80" placeholder="例如：苦力怕论坛、CurseForge" />
                </TFormItem>
                <TFormItem label="转载说明 / 授权">
                  <TInput v-model="form.originNote"  :maxlength="500" placeholder="授权情况、转载说明等（可选）" />
                </TFormItem>
              </template>

              <TFormItem label="图标文件">
                <ResourceIconPicker v-model="form.coverUrl" v-model:file="selectedIconFile" />
              </TFormItem>

            </div>
          </TForm>
        </section>

        <section class="dev-upload-block dev-upload-block--split">
          <header class="dev-card-head">
            <section class="dev-card-head__title-block">
              <h3 class="dev-section-title">标签归类</h3>
            </section>
          </header>

          <div class="dev-catalog-section">
            <section class="dev-root-switch dev-root-switch--catalog" aria-label="根节点选择">
              <div class="dev-root-switch__head">
                <span class="dev-root-switch__label">根节点</span>
                <span class="dev-root-switch__meta">当前：{{ currentRootLabel }}</span>
              </div>
              <div class="dev-root-switch__chips">
                <button v-for="root in rootTabs" :key="root.key" class="dev-catalog-chip"
                  :class="{ active: root.key === currentRootKey }" type="button"
                  @click="openRoot(root.key, root.first_entry_key)">
                  {{ root.label }}
                </button>
              </div>
            </section>

            <section v-if="entryTabs.length > 0" class="dev-catalog-nav" aria-label="资源目录导航">
              <div class="dev-catalog-nav__row">
                <div class="dev-catalog-nav__head">
                  <span class="dev-catalog-nav__label">二级节点</span>
                  <span class="dev-catalog-nav__meta">当前：{{ currentEntryLabel }}</span>
                </div>
                <div class="dev-catalog-nav__chips dev-catalog-nav__chips--scroll">
                  <button v-for="entry in entryTabs" :key="entry.key" class="dev-catalog-chip dev-catalog-chip--secondary"
                    :class="{ active: entry.key === currentEntryKey }" type="button" @click="openEntry(entry.key)">
                    {{ entry.group_name }}
                  </button>
                </div>
              </div>
            </section>

            <div v-if="entryTabs.length > 0 && platformTagGroups.length > 0"
              class="dev-tag-group-panel dev-upload-grid dev-upload-grid--tag-groups">
              <section v-for="group in platformTagGroups" :key="group.key" class="dev-tag-group-row">
                <header class="dev-tag-group-row__head">
                  <section class="dev-tag-group-row__copy">
                    <h4 class="dev-tag-group-row__title">{{ group.group_name }}</h4>
                    <p class="dev-tag-group-row__path" :title="group.label">{{ group.label }}</p>
                  </section>
                  <span class="dev-tag-group-row__count">{{ (selectedTagIdsByGroup[group.group_id] ??
                    []).length }}/{{ group.items.length }}</span>
                </header>

                <div class="dev-tag-group-row__field">
                  <TSelect
                    v-model="selectedTagIdsByGroup[group.group_id]"
                    multiple
                    filterable
                    placeholder="选择一个或多个标签"
                  >
                    <TOption v-for="item in group.items" :key="item.id" :label="item.name" :value="item.id" />
                  </TSelect>
                </div>
              </section>
            </div>

            <p v-else-if="entryTabs.length > 0" class="dev-empty-state">当前二级节点尚未配置完整标签组，请先在管理端补齐标签树。</p>
            <p v-else class="dev-empty-state">当前根节点尚未配置二级节点，请先在管理端补齐标签树。</p>
          </div>
        </section>

        <footer class="dev-upload-actions dev-upload-actions--split" :class="{ 'is-ready': canSubmit }">
          <section class="dev-submit-summary">
            <span class="dev-submit-summary__status">{{ canSubmit ? '准备就绪' : submitBlockReason }}</span>
            <span class="dev-submit-summary__meta">{{ currentEntryLabel }} · {{ selectedTagCount }}
              个标签</span>
          </section>
          <div class="dev-upload-actions__buttons">
            <TButton variant="solid" tone="accent" :disabled="!canSubmit" :loading="submitting"
              @click="submitResource('private')"><template #prefix><TIcon><MagicStick /></TIcon></template>
              创建私有项目
            </TButton>
            <TButton variant="solid" tone="success" :disabled="!canSubmit" :loading="submitting"
              @click="submitResource('public')"><template #prefix><TIcon><MagicStick /></TIcon></template>
              发布公开项目
            </TButton>
          </div>
        </footer>
      </TCard>

      <aside class="dev-upload-side">
        <TCard class="dev-surface-card dev-surface-card--sticky">

          <article class="dev-preview-card dev-list--spaced">
            <div class="dev-preview-card__cover">
              <img
                v-if="form.coverUrl"
                :src="form.coverUrl"
                alt="资源图标"
                class="dev-preview-card__cover-img"
              />
              <span v-else class="dev-preview-card__cover-text">{{ (form.title || '资源').slice(0, 1).toUpperCase() }}</span>
              <span class="dev-preview-card__badge">{{ currentRootLabel }}</span>
              <div class="dev-preview-card__screen dev-preview-card__screen--primary"></div>
              <div class="dev-preview-card__screen dev-preview-card__screen--secondary"></div>
              <div class="dev-preview-card__screen dev-preview-card__screen--tertiary"></div>
            </div>
            <div class="dev-preview-card__body">
              <h3>{{ form.title || '资源标题预览' }}</h3>
              <p v-if="resourceSummary">{{ resourceSummary }}</p>
              <div class="dev-preview-card__meta-row">
                <strong>{{ currentEntryLabel }}</strong>
                <span class="dev-preview-card__status">{{ selectedGroupsSummary.length }} 组 / {{ selectedTagCount }} 项</span>
              </div>
              <div class="dev-preview-card__footer">
                <span>by {{ form.author || auth.username || '开发者' }}</span>
                <span class="dev-preview-card__time">根节点 · {{ currentRootLabel }}</span>
              </div>
            </div>
          </article>
        </TCard>
      </aside>
    </div>
  </div>
</template>
