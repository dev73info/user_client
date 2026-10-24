<script setup lang="ts">
/**
 * 账号与安全页的**动态弹窗宿主**：十二个弹窗的**唯一挂点**（视图里只有这一行标签）。
 *
 * 职责只有两件：
 * 1. 按两张绑定表（`accountDialogBindings` 实名与收款四条 + `accountSettingsDialogBindings`
 *    账号设置八条）渲染出组件，顺序与拆分前模板里一致；
 * 2. 把 `:open` / `:visible` 与 `@update:xxx` **从同一处派生**——可见性 prop 名就是 `entry.model`，
 *    回写事件是 `update:${entry.model}`，两边不可能写成两个名字。
 *
 * 项目里踩过的坑：键名写成驼峰（`updateChannel` vs `@update:channel`、`onUpdateOpen`）既不报错
 * 也不生效，表现是「弹窗点得动、什么都没发生」。所以宿主不许手写事件名，只从 `model` 派生；
 * `visible[key]` 也是各域自己那份 ref，读写同一份，不另存副本。
 */
import type { Ref } from 'vue'

import type { AccountDialogDomains, AccountDialogKey } from '@/composables/useAccountDialogRegistry'

import { verifyDialogEntries, type AccountDialogEntry } from './accountDialogBindings'
import { settingsDialogEntries } from './accountSettingsDialogBindings'

const props = defineProps<{
  /** 十二个弹窗的域背包（正本都在各自的 composable 里，宿主只读）。 */
  domains: AccountDialogDomains
  /** key → 各域自己那份可见性 ref：宿主的回写就落在这里。 */
  visible: Record<AccountDialogKey, Ref<boolean>>
  /** 唯一的回写口：`:open` / `:visible` 变了就交给域去写正本。 */
  setVisible: (key: AccountDialogKey, visible: boolean) => void
}>()

const entries: AccountDialogEntry[] = [...verifyDialogEntries, ...settingsDialogEntries]

/** 可见性 prop：`model` 就是 `:open` / `:visible` 的那一段（不是 v-model 的按 `visible` 走）。 */
function bindOf(entry: AccountDialogEntry) {
  return {
    ...entry.props(props.domains),
    [entry.model ?? 'visible']: props.visible[entry.key].value,
  }
}

/** 事件表：`update:xxx` 只从 `model` 派生，写完照旧回到域里那份 ref。 */
function onOf(entry: AccountDialogEntry) {
  const own = entry.on(props.domains)
  if (!entry.model) return own
  return {
    ...own,
    [`update:${entry.model}`]: (next: boolean) => props.setVisible(entry.key, next),
  }
}
</script>

<template>
  <component
    :is="entry.component"
    v-for="entry in entries"
    :key="entry.key"
    v-bind="bindOf(entry)"
    v-on="onOf(entry)"
  />
</template>
