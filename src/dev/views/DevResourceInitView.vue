<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close, Folder, MagicStick, Plus, Refresh, UploadFilled } from '@element-plus/icons-vue'
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

import {
  createMcResource,
  updateMcResourceHomepage,
  uploadMcResourceCover,
  type McResourcePayload,
  type CreateMcResourceTagSelection,
} from '@dev/api/mcResources'
import {
  getProcessedTagTree,
  invalidateTagTreeCache,
  type McPublishTagGroup,
  type McTagCatalogEntry,
  type McTagCatalogRoot,
  type McProcessedTagTree,
} from '@dev/api/Tags'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'
import { listMyTeams, type TeamResponse } from '@/api/team'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { showToast } = useToast()

const processedTree = ref<McProcessedTagTree>({ roots: [] })
const currentRootKey = ref('')
const currentEntryKey = ref('')
const isLoadingTags = ref(false)
const submitting = ref(false)
const iconInput = ref<HTMLInputElement | null>(null)
const iconFileName = ref('')
const selectedIconFile = ref<File | null>(null)
const iconDialogVisible = ref(false)
const iconUploading = ref(false)
const iconEditorRef = ref<InstanceType<typeof Cropper> | null>(null)
const iconCropSource = ref('')
const iconCropResult = ref('')
const selectedTagIdsByGroup = reactive<Record<number, number[]>>({})
const myTeams = ref<TeamResponse[]>([])
const form = reactive({
  title: '',
  author: auth.username || '',
  coverUrl: '',
  ownershipType: 'individual' as 'individual' | 'team',
  teamId: '',
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
const previewTags = computed(() => selectedGroupsSummary.value.flatMap((group) => group.names))
const teamOptions = computed(() =>
  myTeams.value.map((team) => ({
    value: String(team.team_id),
    label: team.name,
  })),
)

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
  if (route.query.ownership === 'team') {
    form.ownershipType = 'team'
    const onlyTeam = myTeams.value[0]
    // 若只有一个团队，自动选中；多个团队则让用户挑选
    if (myTeams.value.length === 1 && onlyTeam) {
      form.teamId = String(onlyTeam.team_id)
    }
  }
})

onBeforeUnmount(() => {
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

function openIconPicker() {
  iconDialogVisible.value = true
}

function triggerIconFileSelect() {
  iconInput.value?.click()
}

function clearIconFile() {
  form.coverUrl = ''
  iconFileName.value = ''
  selectedIconFile.value = null
  iconCropSource.value = ''
  iconCropResult.value = ''

  if (iconInput.value) {
    iconInput.value.value = ''
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图标文件失败'))
    reader.readAsDataURL(file)
  })
}

async function handleIconFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]

  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    showToast('图标文件仅支持图片格式', 'warning')
    clearIconFile()
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('图标文件请控制在 2MB 以内', 'warning')
    clearIconFile()
    return
  }

  try {
    const dataUrl = await readFileAsDataUrl(file)
    iconFileName.value = file.name
    selectedIconFile.value = file
    iconCropSource.value = dataUrl
    iconCropResult.value = dataUrl
    form.coverUrl = dataUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取图标文件失败'
    showToast(message, 'error')
    clearIconFile()
  }
}

function rotateIcon(direction: 'left' | 'right') {
  iconEditorRef.value?.rotate(direction === 'left' ? -90 : 90)
}

function zoomIcon(factor: number) {
  iconEditorRef.value?.zoom(factor)
}

function resetIconTransform() {
  iconEditorRef.value?.reset()
}

function confirmIconCrop() {
  const result = iconEditorRef.value?.getResult()
  if (!result?.canvas) {
    showToast('未能生成裁剪结果，请重试', 'warning')
    return
  }

  const dataUrl = result.canvas.toDataURL('image/png')
  iconCropResult.value = dataUrl
  form.coverUrl = dataUrl

  result.canvas.toBlob((blob) => {
    if (!blob) {
      return
    }

    const baseName = iconFileName.value.replace(/\.[^.]+$/, '') || 'icon'
    const croppedFile = new File([blob], `${baseName}.png`, { type: 'image/png' })
    selectedIconFile.value = croppedFile
  }, 'image/png')

  iconDialogVisible.value = false
}

function selectedNamesForGroup(group: McPublishTagGroup): string[] {
  const selectedIds = new Set(selectedTagIdsByGroup[group.group_id] ?? [])
  return group.items.filter((item) => selectedIds.has(item.id)).map((item) => item.name)
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
  iconFileName.value = ''
  selectedIconFile.value = null

  if (iconInput.value) {
    iconInput.value.value = ''
  }

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

    <div class="dev-upload-layout">
      <el-card shadow="never" class="dev-surface-card dev-upload-combined-card">
        <section class="dev-upload-block">
          <header class="dev-upload-section__head">
            <section class="dev-upload-section__copy">
              <h3 class="dev-section-title">基础信息</h3>
            </section>
          </header>

          <el-form label-position="top" class="dev-upload-form">
            <div class="dev-upload-grid dev-upload-grid--three">
              <el-form-item label="资源标题" required>
                <el-input v-model="form.title" maxlength="200" show-word-limit
                  placeholder="例如：Better Combat Reloaded" />
              </el-form-item>

              <el-form-item label="归属类型" required>
                <el-radio-group v-model="form.ownershipType">
                  <el-radio value="individual">个人项目</el-radio>
                  <el-radio value="team">团队项目</el-radio>
                </el-radio-group>
              </el-form-item>

              <el-form-item v-show="form.ownershipType === 'team'" label="所属团队" required>
                <div class="dev-team-select-native">
                  <el-select
                    v-model="form.teamId"
                    placeholder="请选择团队"
                    class="dev-team-select-native__control"
                    popper-class="dev-team-select-popper"
                    popper-append-to-body
                  >
                    <el-option
                      v-for="team in teamOptions"
                      :key="team.value"
                      :label="team.label"
                      :value="team.value"
                    />
                    <template #empty>
                      <div class="dev-team-select-popper__empty">
                        <p v-if="myTeams.length === 0">您还没有加入任何团队</p>
                        <p v-else>未找到匹配的团队</p>
                      </div>
                    </template>
                  </el-select>

                </div>
              </el-form-item>

              <el-form-item label="图标文件">
                <div class="dev-icon-upload dev-icon-upload--square" @click="openIconPicker">
                  <img v-if="form.coverUrl" :src="form.coverUrl" alt="图标预览" class="dev-icon-upload__square-image" />
                  <el-icon v-else class="dev-icon-upload__square-plus"><Plus /></el-icon>
                </div>
              </el-form-item>

            </div>
          </el-form>
        </section>

        <section class="dev-upload-block dev-upload-block--split">
          <header class="dev-upload-section__head">
            <section class="dev-upload-section__copy">
              <h3 class="dev-section-title">标签归类</h3>
            </section>
            <el-button text :icon="Refresh" :loading="isLoadingTags" @click="loadTagTree">刷新标签</el-button>
          </header>

          <div v-if="entryTabs.length > 0" class="dev-catalog-section">
            <section class="dev-catalog-nav" aria-label="资源目录导航">
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

            <div v-if="platformTagGroups.length > 0"
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

                <el-form-item class="dev-tag-group-row__field">
                  <el-select v-model="selectedTagIdsByGroup[group.group_id]" multiple filterable placeholder="选择一个或多个标签">
                    <el-option v-for="item in group.items" :key="item.id" :label="item.name" :value="item.id" />
                  </el-select>
                </el-form-item>
              </section>
            </div>

            <p v-else class="dev-empty-state">当前二级节点尚未配置完整标签组，请先在管理端补齐标签树。</p>
          </div>
        </section>

        <footer class="dev-upload-actions dev-upload-actions--split" :class="{ 'is-ready': canSubmit }">
          <section class="dev-submit-summary">
            <span class="dev-submit-summary__status">{{ canSubmit ? '准备就绪' : submitBlockReason }}</span>
            <span class="dev-submit-summary__meta">{{ currentEntryLabel }} · {{ selectedTagCount }}
              个标签</span>
          </section>
          <div class="dev-upload-actions__buttons">
            <el-button type="primary" :icon="MagicStick" :disabled="!canSubmit" :loading="submitting"
              @click="submitResource('private')">
              初始化私有项目
            </el-button>
            <el-button type="success" :icon="MagicStick" :disabled="!canSubmit" :loading="submitting"
              @click="submitResource('public')">
              初始化公开项目
            </el-button>
          </div>
        </footer>
      </el-card>

      <aside class="dev-upload-side">
        <header class="dev-side-toolbar">
          <section class="dev-root-switch" aria-label="根节点选择">
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
        </header>

        <el-card shadow="never" class="dev-surface-card dev-surface-card--sticky">
          <h3 class="dev-section-title">预览摘要</h3>

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
              <div v-if="previewTags.length > 0" class="dev-resource-card__chips">
                <span v-for="item in previewTags" :key="item" class="dev-chip">{{ item }}</span>
              </div>
            </div>
          </article>
        </el-card>
      </aside>
    </div>
  </div>

  <el-dialog v-model="iconDialogVisible" title="上传图标" width="400px" align-center
    :close-on-click-modal="!iconUploading" :destroy-on-close="false">
    <div class="dev-icon-dialog">
      <input ref="iconInput" class="dev-icon-upload__native" type="file"
        accept="image/png,image/jpeg,image/webp,image/gif" @change="handleIconFileChange" />

      <template v-if="iconCropSource">
        <div class="dev-icon-editor">
          <Cropper
            ref="iconEditorRef"
            class="dev-icon-editor__cropper"
            :src="iconCropSource"
            image-restriction="stencil"
            :stencil-props="{ aspectRatio: 1.618 }"
          />
          <div class="dev-icon-editor__toolbar">
            <el-button text :icon="Refresh" @click="resetIconTransform">重置</el-button>
            <el-button text @click="rotateIcon('left')">左旋</el-button>
            <el-button text @click="rotateIcon('right')">右旋</el-button>
            <el-button text @click="zoomIcon(0.1)">放大</el-button>
            <el-button text @click="zoomIcon(-0.1)">缩小</el-button>
          </div>
        </div>

        <div class="dev-icon-dialog__meta">
          <div class="dev-icon-dialog__name">{{ iconFileName || '未选择文件' }}</div>
          <div class="dev-icon-dialog__hint">可拖动图片调整位置，支持裁剪、旋转和缩放，确认后保存为 1:1 图标</div>
        </div>

        <div class="dev-icon-dialog__actions">
          <el-button @click="triggerIconFileSelect">重新选择</el-button>
          <el-button type="primary" @click="confirmIconCrop">应用</el-button>
          <el-button type="danger" plain @click="clearIconFile">移除</el-button>
        </div>
      </template>

      <template v-else>
        <div class="dev-icon-dialog__preview" @click="triggerIconFileSelect">
          <el-icon class="dev-icon-dialog__plus"><Plus /></el-icon>
          <span>点击选择图标</span>
        </div>

        <div class="dev-icon-dialog__meta">
          <div class="dev-icon-dialog__name">{{ iconFileName || '未选择文件' }}</div>
          <div class="dev-icon-dialog__hint">支持 PNG、JPG、WEBP、GIF，大小不超过 2MB</div>
        </div>

        <div class="dev-icon-dialog__actions">
          <el-button @click="triggerIconFileSelect">选择文件</el-button>
        </div>
      </template>
    </div>
  </el-dialog>
</template>
