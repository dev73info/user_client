<script setup lang="ts">
import { TFormItem, TInput } from 'ui_73info'

/**
 * 「转载」才出现的四格：原作者 / 原始出处链接 / 来源站点 / 转载说明。
 *
 * 由父级按 `effectiveOriginType === 'repost'` 决定是否渲染（接口资源一律按原创，不会出现）。
 * 四个 `TFormItem` 是根节点里的并列项（栅格列由各自的 `dev-basic-info-grid__*` 类决定），
 * 所以这里不需要再包一层容器。
 */
const originAuthor = defineModel<string>('originAuthor', { required: true })
const originUrl = defineModel<string>('originUrl', { required: true })
const originOrg = defineModel<string>('originOrg', { required: true })
const originNote = defineModel<string>('originNote', { required: true })
</script>

<template>
  <TFormItem label="原作者" class="dev-basic-info-grid__repost-author">
    <TInput v-model="originAuthor" :maxlength="80" placeholder="原始资源的作者" />
  </TFormItem>
  <TFormItem label="原始出处链接" required class="dev-basic-info-grid__repost-url">
    <TInput v-model="originUrl" :maxlength="500" placeholder="原始出处 URL，例如原贴/来源页" />
  </TFormItem>
  <TFormItem label="来源站点" class="dev-basic-info-grid__repost-org">
    <TInput v-model="originOrg" :maxlength="80" placeholder="例如：苦力怕论坛、CurseForge" />
  </TFormItem>
  <TFormItem label="转载说明 / 授权" class="dev-basic-info-grid__span">
    <TInput v-model="originNote" :maxlength="500" placeholder="授权情况、转载说明等（可选）" />
  </TFormItem>
</template>
