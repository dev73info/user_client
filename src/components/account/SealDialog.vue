<script setup lang="ts">
/**
 * 「印章管理」弹窗：企业电子印章由爱签生成，用于合同盖章——只读展示 + 在线制章入口。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：查询、制章链接、`window.open`、
 * toast 都在视图（组件不碰 `@/api/*`、`TMessage`、`router`）。
 *
 * 状态归属：`visible` / `loading` / `error` / `data` / `making` 全部由父级持有——
 * 「点开才查一次」的时序（`openSealDialog()` 先清空再查）留在视图，组件只负责画。
 * 印章数据用本地结构类型描述，不从 `@/api/asignAccount` 引类型（组件不直接依赖 api 层）。
 *
 * 样式：`.asign-row` / `.asign-hint` 是**全局**样式（`src/styles/profile.css` 的
 * 「账号弹窗的共用样式」一节），与「爱签账户管理」共用同一份；本文件只留 `.seal-*`。
 * 弹窗节点搬进组件后父级 scoped 不再命中，所以当初是连着样式一起搬的。
 */
import { TAlert, TButton, TDialog, TIcon, TLoading, TTag, CollectionTag } from 'ui_73info'

/** 一枚印章（只描述本弹窗用到的字段）。 */
type SealItem = {
  sealNo?: string
  sealName?: string
  /** 爱签侧生成的印章预览图地址。 */
  sealUrl?: string
  isDefault: boolean
}

/** 印章列表 + 空列表时的说明。 */
type SealData = {
  seals: SealItem[]
  message?: string
}

defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 查询进行中（`TLoading` 的遮罩）。 */
  loading: boolean
  /** 查询失败的原话；非空时整块换成「重新查询」。 */
  error: string
  /** 已查到的印章列表；null 表示还没查到。 */
  data: SealData | null
  /** 正在生成制章链接。 */
  making: boolean
}>()

const emit = defineEmits<{
  /** 关闭弹窗，父级据此回写可见性。 */
  'update:visible': [visible: boolean]
  /** 点了「重新查询」。 */
  reload: []
  /** 点了「在线制作新印章」，链接与打开动作都在父级。 */
  'make-online': []
  /** 点了「修改企业信息」：父级关掉本弹窗、打开「企业信息」。 */
  'open-company': []
}>()
</script>

<template>
  <TDialog
    :open="visible"
    title="印章管理"
    class="seal-dialog"
    width="520px"
    @update:open="emit('update:visible', $event)"
  >
    <TLoading tag="div" :loading="loading" class="seal-dialog__body">
      <TAlert
        v-if="error"
        class="seal-dialog__alert"
        tone="warning"
        :closable="false"
        show-icon
        :title="error"
      >
        <TButton variant="outline" size="sm" class="seal-dialog__retry" @click="emit('reload')"
          >重新查询</TButton
        >
      </TAlert>

      <template v-else>
        <p class="asign-hint">
          企业电子印章由爱签生成，用于合同盖章。变更企业名称后会重新生成印章。
        </p>

        <div v-if="data && data.seals.length" class="seal-list">
          <div v-for="seal in data.seals" :key="seal.sealNo || seal.sealName" class="seal-item">
            <img
              v-if="seal.sealUrl"
              class="seal-item__preview"
              :src="seal.sealUrl"
              alt="企业印章预览"
            />
            <span v-else class="seal-item__preview seal-item__preview--empty">
              <TIcon><CollectionTag /></TIcon>
            </span>
            <div class="seal-item__copy">
              <span class="seal-item__name">{{ seal.sealName || '未命名印章' }}</span>
              <small class="seal-item__no">印章编号：{{ seal.sealNo || '—' }}</small>
            </div>
            <TTag v-if="seal.isDefault" tone="success" size="sm" class="seal-item__tag"
              >默认印章</TTag
            >
          </div>
        </div>

        <p v-else class="seal-empty">
          {{ data?.message || '尚未创建企业印章，可在线制作一枚。' }}
        </p>

        <div class="asign-row seal-dialog__actions">
          <TButton variant="solid" tone="accent" :loading="making" @click="emit('make-online')"
            >在线制作新印章</TButton
          >
          <TButton variant="outline" @click="emit('open-company')">修改企业信息</TButton>
        </div>
        <p class="asign-hint seal-dialog__foot">
          「在线制作新印章」会在爱签页面新增一枚印章，不会覆盖现有印章；若要更新企业名称并自动换章，请用「修改企业信息」。
        </p>
      </template>
    </TLoading>
  </TDialog>
</template>

<style scoped>
.seal-dialog__body {
  display: grid;
  gap: 12px;
}

.seal-dialog__alert {
  margin: 0;
}

.seal-dialog__retry {
  margin-top: 10px;
}

.seal-list {
  display: grid;
  gap: 10px;
}

/* 印章条目：左侧预览图 + 名称 / 编号 + 默认标记，观感与账号入口行同一套圆角与底色 */
.seal-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface-strong);
}

.seal-item__preview {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  object-fit: contain;
  border-radius: 10px;
  background: var(--73-surface-strong);
  border: 1px solid var(--73-border);
}

.seal-item__preview--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--73-ink-placeholder);
  font-size: 24px;
}

.seal-item__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.seal-item__name {
  color: var(--73-ink);
  font-size: 13px;
  font-weight: 600;
}

.seal-item__no {
  color: var(--73-ink-muted);
  font-size: 12px;
}

.seal-item__tag {
  flex: 0 0 auto;
}

.seal-empty {
  margin: 0;
  padding: 14px 12px;
  border: 1px dashed var(--73-ink-disabled);
  border-radius: 12px;
  background: var(--73-surface-strong);
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.6;
}

.seal-dialog__actions {
  margin-top: 4px;
}

.seal-dialog__foot {
  margin: 0;
}
</style>
