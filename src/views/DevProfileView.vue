<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import { getUserBadges, getBadges, type BadgeDefinition, type UserBadge } from '@/api/invite'
import { getMyPoints } from '@/api/points'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { getPublicUserProfile, type PublicUserProfile } from '@/api/publicProfile'
import {
  getProfile,
  updateProfile,
  updateProfileBackgroundDynamic,
  updateProfileBackgroundStatic,
  uploadProfileBackground,
  uploadProfileBackgroundDynamic,
} from '@/api/settings'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import BadgeDisplay from '@/components/BadgeDisplay.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const username = computed(() => String(route.params.username || '').trim())
const loading = ref(false)
const allResources = ref<PublicMcResourceItem[]>([])
const userBadges = ref<UserBadge[]>([])
const allBadges = ref<BadgeDefinition[]>([])
const publicProfile = ref<PublicUserProfile | null>(null)
const canCustomizeBackground = ref(false)
const canCustomizeDynamicBackground = ref(false)
const profileDialogVisible = ref(false)
const profileDescriptionDraft = ref('')
const profileSaving = ref(false)

const userResources = computed(() =>
  allResources.value.filter((r) => r.creator === username.value),
)

const wornBadges = computed(() => userBadges.value.filter((badge) => badge.equipped))

const profileDescription = computed(() => publicProfile.value?.profile_description ?? '')
const profileGradient = computed(() => publicProfile.value?.username_gradient ?? false)
const profileColor = computed(() => publicProfile.value?.username_color || '')

const isSelf = computed(() => !!auth.username && auth.username === username.value)

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(url)
}

const staticBackgroundUrl = computed(() =>
  publicProfile.value?.home_background_static
    ? apiUrl(publicProfile.value.home_background_static)
    : '',
)
const dynamicBackgroundUrl = computed(() =>
  publicProfile.value?.home_background_dynamic
    ? apiUrl(publicProfile.value.home_background_dynamic)
    : '',
)

// 当前生效的背景类型：按用户最后点击的"设置静态/动态背景"按钮决定，并用 localStorage 记住
const activeBackgroundKind = ref<'static' | 'dynamic'>(
  (localStorage.getItem('dev_profile_bg_kind') as 'static' | 'dynamic') || 'static',
)
function setActiveBackgroundKind(kind: 'static' | 'dynamic') {
  activeBackgroundKind.value = kind
  localStorage.setItem('dev_profile_bg_kind', kind)
}
const showDynamicBackground = computed(() => activeBackgroundKind.value === 'dynamic')

const videoBackgroundUrl = computed(() =>
  showDynamicBackground.value && dynamicBackgroundUrl.value && isVideoUrl(dynamicBackgroundUrl.value)
    ? dynamicBackgroundUrl.value
    : '',
)
// 头部图片类背景：严格按当前生效类型返回，动态类型时为动态图片动图，静态类型时为静态图
const imageBackgroundUrl = computed(() => {
  if (showDynamicBackground.value) {
    return dynamicBackgroundUrl.value && !isVideoUrl(dynamicBackgroundUrl.value)
      ? dynamicBackgroundUrl.value
      : ''
  }
  return staticBackgroundUrl.value
})
const backgroundUrl = computed(() => videoBackgroundUrl.value || imageBackgroundUrl.value)

type BgFocus = { scale: number; x: number; y: number }
function clampValue(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
function parseFocus(json?: string | null): BgFocus {
  if (!json) return { scale: 1, x: 0, y: 0 }
  try {
    const v = JSON.parse(json) as Partial<BgFocus>
    return {
      scale: typeof v.scale === 'number' ? v.scale : 1,
      x: typeof v.x === 'number' ? v.x : 0,
      y: typeof v.y === 'number' ? v.y : 0,
    }
  } catch {
    return { scale: 1, x: 0, y: 0 }
  }
}
function cropLimit(scale: number) {
  return ((scale - 1) / scale) * 50
}

const currentBackgroundFocus = computed<BgFocus>(() =>
  videoBackgroundUrl.value
    ? parseFocus(publicProfile.value?.home_background_dynamic_focus)
    : parseFocus(publicProfile.value?.home_background_static_focus),
)
const mediaStyle = computed(() => {
  const f = currentBackgroundFocus.value
  if (f.scale === 1 && f.x === 0 && f.y === 0) return {}
  return { transform: `translate(${f.x}%, ${f.y}%) scale(${f.scale})` }
})
const currentBackgroundUrl = computed(() =>
  backgroundMode.value === 'dynamic'
    ? publicProfile.value?.home_background_dynamic ?? ''
    : publicProfile.value?.home_background_static ?? '',
)

const selectedBackgroundUrl = computed(() => {
  const url = backgroundMode.value === 'dynamic'
    ? publicProfile.value?.home_background_dynamic
    : publicProfile.value?.home_background_static
  return url ? apiUrl(url) : ''
})

const stats = computed(() => ({
  resourceCount: userResources.value.length,
  badgeCount: userBadges.value.length,
  totalLikes: userResources.value.reduce((sum, r) => sum + r.like_count, 0),
  platforms: new Set(userResources.value.map((r) => r.platform).filter(Boolean)).size,
}))

const failedAvatarUrls = ref<Set<string>>(new Set())
const failedCoverUrls = ref<Set<string>>(new Set())

const backgroundDialogVisible = ref(false)
const backgroundUploading = ref(false)
const backgroundRemoving = ref(false)
const backgroundMode = ref<'static' | 'dynamic'>('static')
const backgroundInput = ref<HTMLInputElement | null>(null)
const backgroundFile = ref<File | null>(null)
const backgroundPreview = ref('')
const backgroundMaxSize = 5 * 1024 * 1024
const dynamicBackgroundMaxSize = 50 * 1024 * 1024
const dynamicBackgroundAllowedTypes = ['video/mp4', 'video/webm', 'image/gif', 'image/webp']
const staticBackgroundAllowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const isVideoBackgroundPreview = computed(() => {
  if (backgroundFile.value) {
    return backgroundFile.value.type.startsWith('video/')
  }
  return isVideoUrl(backgroundPreview.value)
})

// 裁剪预览状态：scale 缩放，x/y 为 translate 百分比，16:6 固定比例
const cropScale = ref(1)
const cropX = ref(0)
const cropY = ref(0)
const cropMediaStyle = computed(() => ({
  transform: `translate(${cropX.value}%, ${cropY.value}%) scale(${cropScale.value})`,
}))
let cropDrag = { active: false, startX: 0, startY: 0, baseX: 0, baseY: 0, width: 1, height: 1 }
function onCropPointerDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  cropDrag = {
    active: true,
    startX: e.clientX,
    startY: e.clientY,
    baseX: cropX.value,
    baseY: cropY.value,
    width: rect.width || 1,
    height: rect.height || 1,
  }
  el.setPointerCapture(e.pointerId)
}
function onCropPointerMove(e: PointerEvent) {
  if (!cropDrag.active) return
  cropX.value = clampValue(
    cropDrag.baseX + ((e.clientX - cropDrag.startX) / cropDrag.width) * 100,
    -cropLimit(cropScale.value),
    cropLimit(cropScale.value),
  )
  cropY.value = clampValue(
    cropDrag.baseY + ((e.clientY - cropDrag.startY) / cropDrag.height) * 100,
    -cropLimit(cropScale.value),
    cropLimit(cropScale.value),
  )
}
function onCropPointerUp() {
  cropDrag.active = false
}
function onCropWheel(e: WheelEvent) {
  const delta = e.deltaY < 0 ? 0.12 : -0.12
  cropScale.value = clampValue(Math.round((cropScale.value + delta) * 100) / 100, 1, 4)
  cropX.value = clampValue(cropX.value, -cropLimit(cropScale.value), cropLimit(cropScale.value))
  cropY.value = clampValue(cropY.value, -cropLimit(cropScale.value), cropLimit(cropScale.value))
}

function avatarSrc() {
  const url = publicProfile.value?.avatar_url
  if (!url) return ''
  const full = apiUrl(url)
  return failedAvatarUrls.value.has(full) ? '' : full
}

function coverSrc(resource: PublicMcResourceItem) {
  if (!resource.cover_url) return ''
  const full = apiUrl(resource.cover_url)
  return failedCoverUrls.value.has(full) ? '' : full
}

function onAvatarError() {
  const url = publicProfile.value?.avatar_url
  if (url) failedAvatarUrls.value.add(apiUrl(url))
}

function onCoverError(resource: PublicMcResourceItem) {
  if (resource.cover_url) failedCoverUrls.value.add(apiUrl(resource.cover_url))
}

onMounted(async () => {
  await loadData()
})

async function loadData() {
  if (!username.value) return
  loading.value = true
  try {
    const [resources, badges, definitions, profile] = await Promise.all([
      listAllPublicMcResources(),
      getUserBadges(username.value),
      getBadges(),
      getPublicUserProfile(username.value),
    ])
    allResources.value = resources
    userBadges.value = badges.badges
    allBadges.value = definitions
    publicProfile.value = profile
    if (!localStorage.getItem('dev_profile_bg_kind')) {
      activeBackgroundKind.value = profile.home_background_dynamic ? 'dynamic' : 'static'
    }
    if (isSelf.value && auth.token) {
      const points = await getMyPoints(auth.token)
      canCustomizeBackground.value = points.perks.some((perk) =>
        perk.perk_code === 'home_background_static'
        && perk.owned
        && (!perk.expires_at || new Date(perk.expires_at).getTime() > Date.now()),
      )
      canCustomizeDynamicBackground.value = points.perks.some((perk) =>
        perk.perk_code === 'home_background_dynamic'
        && perk.owned
        && (!perk.expires_at || new Date(perk.expires_at).getTime() > Date.now()),
      )
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载开发者信息失败', 'error')
  } finally {
    loading.value = false
  }
}

function openResource(resource: PublicMcResourceItem) {
  const selections = resource.tag_selections ?? []
  const rootName = selections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
    const entryName = selections.find((s) => s.group_path.length > 1)?.group_path[1] ?? (resource.platform || '')
  const rootAlias = selections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)?.group_path_aliases?.[0] ?? ''
  const entryAlias = selections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)?.group_path_aliases?.[1] ?? ''

  router.push({
    name: 'resource-detail',
    params: {
      rootSlug: rootAlias || getTagRouteSlug(rootName),
      entrySlug: entryAlias || getTagRouteSlug(entryName),
      resourceSlug: getResourceDetailSlug(resource.id, resource.creator || resource.author),
    },
  })
}

function setBackground(mode: 'static' | 'dynamic') {
  if (!auth.token) return
  const canCustomize = mode === 'dynamic'
    ? canCustomizeDynamicBackground.value
    : canCustomizeBackground.value
  if (!canCustomize) {
    showToast(`请先在积分商城兑换“主页${mode === 'dynamic' ? '动态' : '静态'}背景自定义”权益`, 'warning')
    void router.push({ name: 'points-mall' })
    return
  }
  backgroundMode.value = mode
  setActiveBackgroundKind(mode)
  const focusJson = mode === 'dynamic'
    ? publicProfile.value?.home_background_dynamic_focus
    : publicProfile.value?.home_background_static_focus
  const f = parseFocus(focusJson)
  cropScale.value = f.scale
  cropX.value = f.x
  cropY.value = f.y
  backgroundPreview.value = selectedBackgroundUrl.value
  backgroundDialogVisible.value = true
}

function editProfile() {
  profileDescriptionDraft.value = profileDescription.value
  profileDialogVisible.value = true
}

async function saveProfile() {
  if (!auth.token || profileSaving.value) return
  profileSaving.value = true
  try {
    await updateProfile(auth.token, auth.username, profileDescriptionDraft.value)
    profileDialogVisible.value = false
    await loadData()
    showToast('个人简介已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新个人简介失败', 'error')
  } finally {
    profileSaving.value = false
  }
}

function resetBackgroundDialog() {
  backgroundFile.value = null
  if (backgroundPreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(backgroundPreview.value)
  }
  backgroundPreview.value = ''
  cropScale.value = 1
  cropX.value = 0
  cropY.value = 0
}

function onBackgroundFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const isDynamic = backgroundMode.value === 'dynamic'
  const allowedTypes = isDynamic ? dynamicBackgroundAllowedTypes : staticBackgroundAllowedTypes
  if (!allowedTypes.includes(file.type)) {
    showToast(
      isDynamic
        ? '动态背景仅支持 MP4、WebM 视频，或 GIF、WEBP 动图'
        : '背景图仅支持 PNG、JPG、WEBP 或 GIF 图片',
      'warning',
    )
    return
  }
  const maxSize = isDynamic ? dynamicBackgroundMaxSize : backgroundMaxSize
  if (file.size > maxSize) {
    showToast(isDynamic ? '动态背景视频不能超过 50MB' : '背景图片不能超过 5MB', 'warning')
    return
  }

  if (backgroundPreview.value) {
    URL.revokeObjectURL(backgroundPreview.value)
  }
  backgroundFile.value = file
  cropScale.value = 1
  cropX.value = 0
  cropY.value = 0
  backgroundPreview.value = URL.createObjectURL(file)
}

async function submitBackgroundUpload() {
  if (!auth.token || backgroundUploading.value) return
  backgroundUploading.value = true
  try {
    const focusJson = JSON.stringify({ scale: cropScale.value, x: cropX.value, y: cropY.value })
    if (backgroundMode.value === 'dynamic') {
      if (backgroundFile.value) {
        const profile = await uploadProfileBackgroundDynamic(auth.token, backgroundFile.value)
        await updateProfileBackgroundDynamic(auth.token, profile.home_background_dynamic ?? '', focusJson)
      } else {
        await updateProfileBackgroundDynamic(auth.token, currentBackgroundUrl.value, focusJson)
      }
    } else if (backgroundFile.value) {
      const profile = await uploadProfileBackground(auth.token, backgroundFile.value)
      await updateProfileBackgroundStatic(auth.token, profile.home_background_static ?? '', focusJson)
    } else {
      await updateProfileBackgroundStatic(auth.token, currentBackgroundUrl.value, focusJson)
    }
    showToast('主页背景已更新', 'success')
    backgroundDialogVisible.value = false
    await loadData()
  } catch (err) {
    showToast(err instanceof Error ? err.message : `设置${backgroundMode.value === 'dynamic' ? '动态' : '静态'}背景失败`, 'error')
  } finally {
    backgroundUploading.value = false
  }
}

async function removeBackground() {
  if (!auth.token || backgroundRemoving.value) return
  backgroundRemoving.value = true
  try {
    const update = backgroundMode.value === 'dynamic'
      ? updateProfileBackgroundDynamic
      : updateProfileBackgroundStatic
    await update(auth.token, '')
    backgroundDialogVisible.value = false
    resetBackgroundDialog()
    await loadData()
    showToast('主页背景已移除', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '移除主页背景失败', 'error')
  } finally {
    backgroundRemoving.value = false
  }
}
</script>

<template>
  <main class="dev-profile" v-loading="loading">
    <!-- 头部 -->
    <section class="dev-profile__head" :class="{ 'has-bg': !!backgroundUrl }">
      <video
        v-if="videoBackgroundUrl"
        class="dev-profile__head-media dev-profile__head-video"
        :src="videoBackgroundUrl"
        :style="mediaStyle"
        autoplay
        loop
        muted
        playsinline
      ></video>
      <img
        v-else-if="imageBackgroundUrl"
        class="dev-profile__head-media"
        :src="imageBackgroundUrl"
        :style="mediaStyle"
        alt=""
      />
      <div class="dev-profile__avatar-wrap">
        <img
          v-if="avatarSrc()"
          :src="avatarSrc()"
          :alt="username"
          class="dev-profile__avatar"
          loading="lazy"
          @error="onAvatarError"
        />
        <span v-else class="dev-profile__avatar dev-profile__avatar--text">
          {{ username.slice(0, 1).toUpperCase() }}
        </span>
      </div>
      <div class="dev-profile__head-content">
        <h1 class="dev-profile__name" :class="{ 'username-gradient': profileGradient && !profileColor }"
          :style="profileColor ? { color: profileColor } : {}">{{ username }}</h1>
        <p v-if="profileDescription" class="dev-profile__description">{{ profileDescription }}</p>
        <p class="dev-profile__badge-line" v-if="wornBadges.length > 0">
          <BadgeDisplay :badges="wornBadges" :limit="4" />
        </p>
        <p class="dev-profile__badge-line dev-profile__badge-line--empty" v-else>
          {{ userBadges.length > 0 ? '暂未佩戴徽章' : '暂未获得徽章' }}
        </p>
      </div>
      <div v-if="isSelf" class="dev-profile__head-actions">
        <button class="dev-profile__bg-btn" @click="editProfile">编辑简介</button>
        <button class="dev-profile__bg-btn" @click="setBackground('static')">设置静态背景</button>
        <button class="dev-profile__bg-btn" @click="setBackground('dynamic')">设置动态背景</button>
      </div>
    </section>

    <!-- 统计 -->
    <section class="dev-profile__stats">
      <div class="dev-profile__stat">
        <strong>{{ stats.resourceCount }}</strong>
        <span>资源项目</span>
      </div>
      <div class="dev-profile__stat">
        <strong>{{ stats.badgeCount }}</strong>
        <span>荣誉徽章</span>
      </div>
      <div class="dev-profile__stat">
        <strong>{{ stats.totalLikes }}</strong>
        <span>获得点赞</span>
      </div>
      <div class="dev-profile__stat">
        <strong>{{ stats.platforms }}</strong>
        <span>涉及平台</span>
      </div>
    </section>

    <!-- 资源列表 -->
    <section class="dev-profile__resources">
      <div class="dev-profile__section-heading">
        <div>
          <p class="dev-profile__section-kicker">精选作品</p>
          <h2 class="dev-profile__section-title">公开资源</h2>
        </div>
        <span class="dev-profile__section-count">{{ stats.resourceCount }} 个项目</span>
      </div>
      <div v-if="userResources.length === 0" class="dev-profile__empty">
        <p>该开发者暂未发布公开资源</p>
      </div>
      <div v-else class="dev-profile__resource-grid">
        <article
          v-for="resource in userResources"
          :key="resource.id"
          class="dev-profile__resource-card"
          role="button"
          tabindex="0"
          :aria-label="`查看资源：${resource.title}`"
          @click="openResource(resource)"
          @keydown.enter="openResource(resource)"
          @keydown.space.prevent="openResource(resource)"
        >
          <div class="dev-profile__resource-cover-wrap">
            <img
              v-if="coverSrc(resource)"
              :src="coverSrc(resource)"
              :alt="resource.title"
              class="dev-profile__resource-cover"
              loading="lazy"
              @error="onCoverError(resource)"
            />
            <span
              v-else
              class="dev-profile__resource-cover dev-profile__resource-cover--text"
            >
              {{ resource.title.slice(0, 1).toUpperCase() }}
            </span>
          </div>
          <div class="dev-profile__resource-body">
            <h3 class="dev-profile__resource-title">{{ resource.title }}</h3>
            <p class="dev-profile__resource-desc">
              {{ resource.description || "暂无简介" }}
            </p>
            <div class="dev-profile__resource-meta">
              <span>{{ resource.platform }}</span>
              <span>{{ resource.like_count }} 赞</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- 设置主页背景 -->
    <el-dialog v-model="backgroundDialogVisible" :title="backgroundMode === 'dynamic' ? '设置动态背景' : '设置静态背景'" width="480px" align-center
      :close-on-click-modal="false" @closed="resetBackgroundDialog">
      <div class="dev-profile__bg-upload">
        <input ref="backgroundInput" class="dev-profile__bg-input" type="file"
          :accept="backgroundMode === 'dynamic'
            ? 'video/mp4,video/webm,image/gif,image/webp'
            : 'image/png,image/jpeg,image/webp,image/gif'"
          @change="onBackgroundFileChange" />
        <div v-if="backgroundPreview" class="dev-profile__crop"
          @wheel.prevent="onCropWheel"
          @pointerdown="onCropPointerDown"
          @pointermove="onCropPointerMove"
          @pointerup="onCropPointerUp"
          @pointercancel="onCropPointerUp">
          <video v-if="isVideoBackgroundPreview" :src="backgroundPreview"
            class="dev-profile__crop-media dev-profile__bg-video" :style="cropMediaStyle"
            autoplay loop muted playsinline></video>
          <img v-else :src="backgroundPreview" alt="背景预览" class="dev-profile__crop-media" :style="cropMediaStyle" />
          <span class="dev-profile__crop-hint">拖动调整位置 · 滚轮缩放</span>
          <button type="button" class="dev-profile__crop-reselect" @pointerdown.stop @click="backgroundInput?.click()">重新选择</button>
        </div>
        <button v-else type="button" class="dev-profile__bg-pick" @click="backgroundInput?.click()">
          <span class="dev-profile__bg-pick-icon">＋</span>
          <span class="dev-profile__bg-pick-text">选择{{ backgroundMode === 'dynamic' ? '动态背景' : '背景图片' }}</span>
        </button>
        <p class="dev-profile__bg-tip">
          {{ backgroundMode === 'dynamic'
            ? '支持 MP4 / WebM 视频，或 GIF / WEBP 动图，最大 50MB'
            : '支持 PNG / JPG / WEBP / GIF，最大 5MB' }}
        </p>
      </div>
      <template #footer>
        <el-button v-if="backgroundUrl" type="danger" text :loading="backgroundRemoving"
          @click="removeBackground">移除背景</el-button>
        <el-button @click="backgroundDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!backgroundFile || backgroundUploading || backgroundRemoving"
          :loading="backgroundUploading" @click="submitBackgroundUpload">保存</el-button>
      </template>
    </el-dialog>

    <div v-if="profileDialogVisible" class="dev-profile-modal" @click.self="profileDialogVisible = false">
      <section class="dev-profile-modal__panel" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <header class="dev-profile-modal__header">
          <div>
            <p class="dev-profile-modal__eyebrow">个人主页</p>
            <h2 id="profile-modal-title">编辑简介</h2>
          </div>
          <button class="dev-profile-modal__close" type="button" aria-label="关闭" @click="profileDialogVisible = false">
            ×
          </button>
        </header>
        <div class="dev-profile-modal__body">
          <label class="dev-profile-modal__label" for="profile-description-input">个人简介</label>
          <div class="dev-profile-modal__field">
            <textarea id="profile-description-input" v-model="profileDescriptionDraft" maxlength="300" rows="5"
              placeholder="介绍一下自己、擅长的平台或作品方向" />
            <span>{{ profileDescriptionDraft.length }} / 300</span>
          </div>
        </div>
        <footer class="dev-profile-modal__actions">
          <button class="dev-profile-modal__button dev-profile-modal__button--ghost" type="button"
            @click="profileDialogVisible = false">取消</button>
          <button class="dev-profile-modal__button dev-profile-modal__button--primary" type="button"
            :disabled="profileSaving" @click="saveProfile">
            {{ profileSaving ? '保存中...' : '保存简介' }}
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>

<style>
.dev-profile {
  position: relative;
  width: min(1120px, calc(100% - 32px));
  margin: 24px auto 48px;
  display: grid;
  gap: 24px;
}

.dev-profile__head {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  min-height: 220px;
  height: clamp(220px, 20vw, 260px);
  gap: 20px;
  padding: 28px 32px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    rgba(239, 246, 255, 0.98),
    rgba(255, 255, 255, 0.96) 58%,
    rgba(240, 253, 250, 0.9)
  );
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.08);
}

.dev-profile__head::after {
  content: '';
  position: absolute;
  width: 240px;
  height: 240px;
  right: -90px;
  top: -130px;
  border-radius: 50%;
  background: rgba(125, 211, 252, 0.16);
  pointer-events: none;
}

.dev-profile__head.has-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.5),
    rgba(255, 255, 255, 0.78) 52%,
    rgba(255, 255, 255, 0.92)
  );
  pointer-events: none;
}

.dev-profile__head.has-bg > * {
  position: relative;
  z-index: 2;
}

.dev-profile__head-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.dev-profile__head.has-bg > .dev-profile__head-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

/* 动态视频背景时去掉白色渐变遮罩，让视频清晰呈现；静态背景仍保留遮罩以保证文字可读 */
.dev-profile__head.has-bg:has(.dev-profile__head-video)::before {
  background: none;
}

.dev-profile__head-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

.dev-profile__bg-btn {
  align-self: flex-start;
  padding: 8px 16px;
  border: 1px solid rgba(96, 165, 250, 0.5);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.dev-profile__bg-btn:hover {
  background: #eff6ff;
}

.dev-profile__bg-upload {
  display: grid;
  gap: 12px;
}

.dev-profile__bg-input {
  display: none;
}

.dev-profile__bg-pick {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 6;
  border: 1px dashed rgba(148, 163, 184, 0.5);
  border-radius: 12px;
  background: #f8fafc;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.dev-profile__bg-pick:hover {
  border-color: rgba(59, 130, 246, 0.5);
  background: #eff6ff;
}

.dev-profile__bg-pick.has-preview {
  border-style: solid;
  border-color: rgba(59, 130, 246, 0.3);
  background: #fff;
}

.dev-profile__bg-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dev-profile__bg-video {
  background: #0f172a;
}

.dev-profile__bg-pick-icon {
  font-size: 28px;
  line-height: 1;
}

.dev-profile__bg-pick-text {
  font-size: 14px;
}

/* 裁剪预览：16:6 固定比例，可拖动平移 + 滚轮缩放 */
.dev-profile__crop {
  position: relative;
  aspect-ratio: 16 / 6;
  overflow: hidden;
  border: 1px dashed rgba(148, 163, 184, 0.5);
  border-radius: 12px;
  background: #f8fafc;
  cursor: grab;
  touch-action: none;
}

.dev-profile__crop:active {
  cursor: grabbing;
}

.dev-profile__crop-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  will-change: transform;
}

.dev-profile__crop-hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}

.dev-profile__crop-reselect {
  position: absolute;
  right: 10px;
  top: 8px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.45);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.dev-profile__bg-repick {
  margin: 0;
  text-align: center;
}

.dev-profile__bg-tip {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

.dev-profile__avatar-wrap {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
}

.dev-profile__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.16), 0 8px 18px rgba(37, 99, 235, 0.16);
  display: block;
}

.dev-profile__avatar--text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.16), 0 8px 18px rgba(37, 99, 235, 0.16);
}

.dev-profile__head-content {
  min-width: 0;
}

.dev-profile__name {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.dev-profile__description {
  max-width: 560px;
  margin: 0 0 8px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.dev-profile-modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(4px);
}

.dev-profile-modal__panel {
  width: min(480px, 100%);
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 20px 48px rgba(30, 64, 175, 0.16);
}

.dev-profile-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 16px;
  border-bottom: 1px solid #eef2f7;
}

.dev-profile-modal__eyebrow {
  margin: 0 0 4px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.dev-profile-modal__header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
}

.dev-profile-modal__close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  font-size: 25px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.dev-profile-modal__close:hover {
  background: #eff6ff;
  color: #2563eb;
}

.dev-profile-modal__body {
  padding: 22px 24px 8px;
}

.dev-profile-modal__label {
  display: block;
  margin-bottom: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.dev-profile-modal__field {
  position: relative;
}

.dev-profile-modal__field textarea {
  display: block;
  width: 100%;
  min-height: 132px;
  padding: 12px 14px 30px;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  outline: none;
  background: #f8fafc;
  color: #0f172a;
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.dev-profile-modal__field textarea:focus {
  border-color: #60a5fa;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.16);
}

.dev-profile-modal__field span {
  position: absolute;
  right: 12px;
  bottom: 9px;
  color: #94a3b8;
  gap: 20px;
  font-size: 12px;
  pointer-events: none;
}

.dev-profile-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 20px;
  border-top: 1px solid #eef2f7;
}

.dev-profile-modal__button {
  min-width: 84px;
  height: 38px;
  padding: 0 16px;
  border-radius: 9px;
  font: inherit;
  background: rgba(248, 250, 252, 0.7);
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.dev-profile-modal__button--ghost {
  border: 1px solid #dbe4f0;
  background: #fff;
  color: #64748b;
}

.dev-profile-modal__button--ghost:hover {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.dev-profile-modal__button--primary {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}

.dev-profile-modal__button--primary:hover:not(:disabled) {
  border-color: #1d4ed8;
  background: #1d4ed8;
  transform: translateY(-1px);
}

.dev-profile-modal__button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.dev-profile__badge-line {
  margin: 0;
}

.dev-profile__badge-line--empty {
  color: #94a3b8;
  font-size: 13px;
}

.dev-profile__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.dev-profile__stat {
  position: relative;
  overflow: hidden;
  padding: 20px 16px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  text-align: center;
  display: grid;
  gap: 4px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.dev-profile__stat::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, #2563eb, #38bdf8);
  opacity: 0.72;
}

.dev-profile__stat:hover {
  border-color: rgba(96, 165, 250, 0.5);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.08);
  transform: translateY(-2px);
}

.dev-profile__stat strong {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.dev-profile__stat span {
  font-size: 13px;
  color: #64748b;
}

.dev-profile__section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.dev-profile__section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.dev-profile__section-kicker {
  margin: 0 0 3px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dev-profile__section-count {
  padding: 5px 10px;
  border: 1px solid rgba(147, 197, 253, 0.5);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.8);
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.dev-profile__empty {
  padding: 48px 16px;
  border: 1px dashed rgba(148, 163, 184, 0.36);
  border-radius: 12px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

.dev-profile__resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.dev-profile__resource-card {
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.dev-profile__resource-card:hover,
.dev-profile__resource-card:focus-visible {
  border-color: rgba(59, 130, 246, 0.36);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
  outline: none;
}

.dev-profile__resource-cover-wrap {
  width: 100%;
  height: 160px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  overflow: hidden;
}

.dev-profile__resource-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dev-profile__resource-cover--text {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
  color: #94a3b8;
  font-size: 36px;
  font-weight: 700;
  object-fit: unset;
}

.dev-profile__resource-body {
  padding: 14px 16px;
  display: grid;
  gap: 6px;
}

.dev-profile__resource-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-profile__resource-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.dev-profile__resource-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #94a3b8;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .dev-profile__section-heading {
    align-items: start;
  }

  .dev-profile__stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .dev-profile__head {
    flex-direction: column;
    height: auto;
    text-align: center;
  }

  .dev-profile__head-actions {
    margin-left: 0;
    justify-content: center;
  }

  .dev-profile__description {
    max-width: 100%;
  }

  .dev-profile__edit-dialog {
    width: calc(100% - 32px) !important;
  }


.dev-profile__edit-dialog {
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(191, 219, 254, 0.72);
  border-radius: 18px;
  box-shadow: 0 20px 48px rgba(30, 64, 175, 0.16);
}

.dev-profile__edit-dialog .el-dialog__header {
  margin: 0;
  padding: 22px 24px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

.dev-profile__edit-dialog .el-dialog__title {
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
}

.dev-profile__edit-dialog .el-dialog__headerbtn {
  top: 18px;
  right: 18px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.dev-profile__edit-dialog .el-dialog__headerbtn:hover {
  background: #eff6ff;
}

.dev-profile__edit-dialog .el-dialog__body {
  padding: 22px 24px 8px;
}

.dev-profile__edit-dialog .el-form-item {
  margin-bottom: 0;
}

.dev-profile__edit-dialog .el-form-item__label {
  padding-bottom: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.dev-profile__edit-dialog .el-textarea__inner {
  min-height: 132px !important;
  padding: 12px 14px;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  box-shadow: none;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.dev-profile__edit-dialog .el-textarea__inner:focus {
  border-color: #60a5fa;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.16);
}

.dev-profile__edit-dialog .el-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 20px;
  border-top: 1px solid rgba(226, 232, 240, 0.72);
  background: #fff;
}

.dev-profile__edit-dialog .el-button {
  min-width: 84px;
  height: 38px;
  border-radius: 9px;
  font-weight: 700;
}

.dev-profile__edit-dialog .el-button--primary {
  border-color: #2563eb;
  background: #2563eb;
}

.dev-profile__edit-dialog .el-button--primary:hover {
  border-color: #1d4ed8;
  background: #1d4ed8;
}
  .dev-profile__resource-grid {
    grid-template-columns: 1fr;
  }
}
</style>
