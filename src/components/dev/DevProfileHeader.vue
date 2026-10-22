<script setup lang="ts">
/**
 * 开发者公开主页的头部：背景（静态图 / 动图 / 视频）、头像、用户名与简介、佩戴徽章、
 * 本人 / 他人视角的操作按钮。
 *
 * 从 `DevProfileView` 抽出来。背景地址、焦点变换与操作权限都由页面算好，
 * 这里只画、只发动作（编辑简介 / 设置背景 / 打赏设置 / 打赏），不碰路由与接口。
 */
import type { UserBadge } from '@/api/invite'
import BadgeDisplay from '@/components/BadgeDisplay.vue'

defineProps<{
  username: string
  avatarUrl: string
  description: string
  /** 用户名渐变：有自定义颜色时以颜色为准，渐变不再生效 */
  gradient: boolean
  color: string
  wornBadges: UserBadge[]
  /** 徽章总数：用来区分「还没获得」与「有但没佩戴」 */
  badgeCount: number
  isSelf: boolean
  canTip: boolean
  videoUrl: string
  imageUrl: string
  mediaStyle: Record<string, string>
}>()

const emit = defineEmits<{
  edit: []
  'set-background': [mode: 'static' | 'dynamic']
  'tip-settings': []
  tip: []
  'avatar-error': []
}>()
</script>

<template>
  <section class="dev-profile__head" :class="{ 'has-bg': !!(videoUrl || imageUrl) }">
    <video
      v-if="videoUrl"
      class="dev-profile__head-media dev-profile__head-video"
      :src="videoUrl"
      :style="mediaStyle"
      autoplay
      loop
      muted
      playsinline
    ></video>
    <img
      v-else-if="imageUrl"
      class="dev-profile__head-media"
      :src="imageUrl"
      :style="mediaStyle"
      alt=""
    />
    <div class="dev-profile__avatar-wrap">
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        :alt="username"
        class="dev-profile__avatar"
        loading="lazy"
        @error="emit('avatar-error')"
      />
      <span v-else class="dev-profile__avatar dev-profile__avatar--text">
        {{ username.slice(0, 1).toUpperCase() }}
      </span>
    </div>
    <div class="dev-profile__head-content">
      <h1
        class="dev-profile__name"
        :class="{ 'username-gradient': gradient && !color }"
        :style="color ? { color } : {}"
      >
        {{ username }}
      </h1>
      <p v-if="description" class="dev-profile__description">{{ description }}</p>
      <p class="dev-profile__badge-line" v-if="wornBadges.length > 0">
        <BadgeDisplay :badges="wornBadges" :limit="4" />
      </p>
      <p class="dev-profile__badge-line dev-profile__badge-line--empty" v-else>
        {{ badgeCount > 0 ? '暂未佩戴徽章' : '暂未获得徽章' }}
      </p>
    </div>
    <div v-if="isSelf || canTip" class="dev-profile__head-actions">
      <template v-if="isSelf">
        <button class="dev-profile__bg-btn" @click="emit('edit')">编辑简介</button>
        <button class="dev-profile__bg-btn" @click="emit('set-background', 'static')">
          设置静态背景
        </button>
        <button class="dev-profile__bg-btn" @click="emit('set-background', 'dynamic')">
          设置动态背景
        </button>
        <button class="dev-profile__bg-btn" @click="emit('tip-settings')">打赏设置</button>
      </template>
      <button
        v-else-if="canTip"
        class="dev-profile__bg-btn dev-profile__bg-btn--tip"
        @click="emit('tip')"
      >
        打赏
      </button>
    </div>
  </section>
</template>

<style>
.dev-profile__head {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  min-height: 220px;
  height: clamp(220px, 20vw, 260px);
  gap: 20px;
  padding: 28px 32px;
  border: 1px solid var(--dp-border-soft);
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    var(--dp-accent-wash),
    var(--dp-white-96) 58%,
    var(--dp-mint-wash)
  );
  box-shadow: 0 12px 28px var(--dp-shadow-accent-08);
}

.dev-profile__head::after {
  content: '';
  position: absolute;
  width: 240px;
  height: 240px;
  right: -90px;
  top: -130px;
  border-radius: 50%;
  background: var(--dp-halo-sky);
  pointer-events: none;
}

.dev-profile__head.has-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    var(--dp-white-50),
    var(--dp-white-78) 52%,
    var(--dp-white-92)
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
  border: 1px solid var(--dp-ring-accent);
  border-radius: 999px;
  background: var(--dp-white-90);
  color: var(--dp-accent);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.dev-profile__bg-btn:hover {
  background: var(--dp-accent-bg);
}

.dev-profile__bg-btn--tip {
  border-color: var(--dp-tip-ring);
  color: var(--dp-tip-ink);
  font-weight: 700;
}

.dev-profile__bg-btn--tip:hover {
  background: var(--dp-warn-bg);
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
  border: 3px solid var(--dp-white-90);
  box-shadow:
    0 0 0 4px var(--dp-halo-accent),
    0 8px 18px var(--dp-shadow-accent);
  display: block;
}

.dev-profile__avatar--text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--dp-accent-bright), var(--dp-accent));
  color: var(--dp-white);
  font-size: 28px;
  font-weight: 700;
  box-shadow:
    0 0 0 4px var(--dp-halo-accent),
    0 8px 18px var(--dp-shadow-accent);
}

.dev-profile__head-content {
  min-width: 0;
}

.dev-profile__name {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: var(--dp-ink);
}

.dev-profile__description {
  max-width: 560px;
  margin: 0 0 8px;
  color: var(--dp-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.dev-profile__badge-line {
  margin: 0;
}

.dev-profile__badge-line--empty {
  color: var(--dp-text-faint);
  font-size: 13px;
}

@media (max-width: 640px) {
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

  /* 窄屏改为纵向排列后，flex 子项仍按 align-items:center 收缩到 max-content，
     长用户名（下划线不换行）会把内容撑出容器并被 overflow:hidden 裁掉。 */
  .dev-profile__head-content {
    width: 100%;
  }

  .dev-profile__name {
    overflow-wrap: anywhere;
  }
}
</style>
