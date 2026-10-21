import { computed } from 'vue'

import type { useAvatarCrop } from '@/composables/useAvatarCrop'

type AvatarCropController = ReturnType<typeof useAvatarCrop>

/**
 * 头像裁剪弹窗的挂点：把 `useAvatarCrop` 的状态与动作铺成一份 `v-bind` 对象。
 *
 * 单独一层是因为那个 composable 已经贴着 300 行上限（几何 + 手势 + 请求），而这里只是**形状转换**：
 * 一次判定都没改，也不发请求。视图因此从「十来个 props + 十来行监听」收成一行
 * `<ProfileAvatarCropModal v-bind="avatarCropModal" />`。
 *
 * 键分两类，别混：
 * - `handleXxx` 是**函数 prop**（指针、滚轮、加载）：事件绑在弹窗自己的 DOM 上，组件转发回控制器；
 * - `onClose` / `onReset` / `onSubmit` 是**emit 监听**，逐字对应组件 `defineEmits` 的
 *   `close` / `reset` / `submit`。这里刻意不走 `v-model`：可见性与 blob 都归 composable，
 *   多一条 `update:xxx` 通道就多一处「少个冒号就静默失效」的隐患。
 */
export function useAvatarCropModalBindings(controller: AvatarCropController) {
  const modalBindings = computed(() => ({
    visible: controller.visible.value,
    previewUrl: controller.previewUrl.value,
    imageStyle: controller.imageStyle.value,
    dragging: controller.dragging.value,
    zoomPercent: controller.zoomPercent.value,
    hasImage: controller.hasImage.value,
    uploading: controller.uploading.value,
    registerFrame: controller.registerFrame,
    handleImageLoad: controller.handleImageLoad,
    handleWheel: controller.handleWheel,
    handlePointerDown: controller.handlePointerDown,
    handlePointerMove: controller.handlePointerMove,
    handlePointerUp: controller.handlePointerUp,
    onClose: controller.close,
    onReset: controller.resetFrame,
    onSubmit: controller.submit,
  }))

  return { modalBindings }
}
