<script setup lang="ts">
import { useAvatarUpload } from '@/composables/useAvatarUpload'

/**
 * 总览欢迎区的圆形头像：本身是「更换头像」入口，上传成功立即生效。
 * 展示与上传逻辑在 `useAvatarUpload`（头像缓存与顶栏 / 左栏同一份）。
 */
defineProps<{
  /** 没有头像时显示的首字母。 */
  text: string
}>()

const { avatarSrc, markFailed, inputRef, uploading, pick, onPicked } = useAvatarUpload()
</script>

<template>
  <button
    type="button"
    class="overview-welcome__avatar"
    aria-label="更换头像"
    :disabled="uploading"
    @click.stop="pick"
  >
    <img
      v-if="avatarSrc"
      class="overview-welcome__avatar-image"
      :src="avatarSrc"
      alt=""
      @error="markFailed"
    />
    <template v-else>{{ text }}</template>
  </button>
  <input
    ref="inputRef"
    class="overview-welcome__avatar-input"
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif"
    @click.stop
    @change="onPicked"
  />
</template>
