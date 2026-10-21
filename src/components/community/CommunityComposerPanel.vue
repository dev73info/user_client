<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'

import RichTextEditor from '@/components/RichTextEditor.vue'
import type { ComposerPanelRefName } from '@/composables/useComposerFloatingActions'

import { TButton, TForm, TFormItem, TInput, TInputNumber, TOption, TSelect } from 'ui_73info'

/**
 * 社区右栏的发帖 / 编辑面板：标题、标签、类型、悬赏、转载四栏、富文本正文，以及**浮动提交条**。
 *
 * 纯展示：表单草稿由 `useCommunityComposer` 持有（这里一个 `@/api/*`、`TMessage`、`router` 都不引），
 * 每个字段一个 `defineModel`，改动立刻回传；实名门禁、提交、提示都在 composable。
 *
 * ## 三块 DOM + 三个 ref 的桥
 *
 * 浮动提交条要靠 `getBoundingClientRect` 量面板与动作条，三块 DOM 都在本组件里，
 * 而量算与监听在 composable（它同时握着 `composerVisible` 与两个 `:style` 结果）。
 * 所以 ref 以**回调**的形式传下来：`:ref="(el) => setRef('panel', el)"`，
 * composable 侧的 `setComposerRef` 把元素存进自己的 ref。不要改成往这里传 ref 对象——
 * 传对象要靠在模板里再包一层，反而更难读。
 *
 * ## `.community-composer__actions` 这一处类名原来有两种语义
 *
 * 改造前包裹 div 与提交按钮**共用同一个类名**，样式因此在两处互相命中（`display: flex` 那组
 * 共享选择器 + `justify-content: flex-end`）。搬进组件时一次说清：
 * - 包裹 div 留名 `.community-composer__actions`（两端对齐 + 间距 + `justify-content: flex-end`，
 *   `.is-floating` 也挂在它身上）；
 * - 提交按钮改名 `.community-composer__submit`，只保留它自己那份「撑满一行右侧」的语义。
 *   按钮上原来被共享选择器顺带命中的 `display / justify-content / gap` 与 TButton 自身的排版等价，
 *   改名后由 TButton 接管，视觉不变。
 * `.community-submit-button` 是全仓都没有定义的历史空类，原样保留，不在本轮清理范围。
 */
defineProps<{
  /** 正在编辑已有帖子（决定标题文案、是否露悬赏栏、提交按钮文案）。 */
  editing: boolean
  /** 保存请求进行中。 */
  saving: boolean
  /** 可选的标签名（视图的标签接口结果）。 */
  tagOptions: string[]
  /** 提交条是否处于「浮动固定」态。 */
  floating: boolean
  /** 占位壳的内联样式（浮动时与动作条等高）。 */
  shellStyle: Record<string, string> | undefined
  /** 浮动动作条的固定定位样式（bottom / left / width）。 */
  floatingStyle: Record<string, string>
  /** 把三块 DOM 交给 composable 的回调（见文件头「三块 DOM + 三个 ref 的桥」）。 */
  setRef: (name: ComposerPanelRefName, el: Element | ComponentPublicInstance | null) => void
}>()

const emit = defineEmits<{
  /** 点了「取消」，收起面板与清空表单在父级。 */
  close: []
  /** 点了「发布 / 保存」，校验与请求都在父级。 */
  submit: []
  /** 富文本编辑器的提示转发给父级（组件不弹全局提示）。 */
  notify: [message: string, type?: 'success' | 'warning' | 'error']
}>()

/** 表单草稿：取值来自父级，写入立刻回传。 */
const title = defineModel<string>('title', { required: true })
const tagNames = defineModel<string[]>('tagNames', { required: true })
const contentHtml = defineModel<string>('contentHtml', { required: true })
const originType = defineModel<'original' | 'repost'>('originType', { required: true })
const originAuthor = defineModel<string>('originAuthor', { required: true })
const originUrl = defineModel<string>('originUrl', { required: true })
const originOrg = defineModel<string>('originOrg', { required: true })
const originNote = defineModel<string>('originNote', { required: true })
const bountyPoints = defineModel<number>('bountyPoints', { required: true })

function forwardNotify(message: string, type?: 'success' | 'warning' | 'error') {
  emit('notify', message, type)
}
</script>

<template>
  <section :ref="(el) => setRef('panel', el)" class="community-panel community-composer">
    <div class="community-panel__head">
      <div>
        <h3>{{ editing ? '更新社区内容' : '写一篇新帖子' }}</h3>
      </div>
      <TButton variant="outline" class="community-panel-action" @click="emit('close')">
        <span>取消</span>
      </TButton>
    </div>

    <TForm label-position="top" class="community-form">
      <TFormItem label="标题" class="community-form-item--full">
        <TInput v-model="title" show-count :maxlength="80" placeholder="写一个清楚的标题" />
      </TFormItem>
      <TFormItem label="标签">
        <TSelect v-model="tagNames" multiple filterable placeholder="选择或输入标签">
          <TOption v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag" />
        </TSelect>
      </TFormItem>
      <TFormItem label="类型">
        <TSelect v-model="originType" style="width: 160px">
          <TOption label="原创" value="original" />
          <TOption label="转载" value="repost" />
        </TSelect>
      </TFormItem>
      <TFormItem v-if="!editing" label="悬赏积分" class="community-form-item--full">
        <div class="community-bounty-field">
          <TInputNumber v-model="bountyPoints" :min="0" :max="10000" :step="10" :precision="0" />
          <span class="community-bounty-field__unit">积分</span>
        </div>
        <div class="community-form__hint">
          设置悬赏后，被采纳的回答可获得对应积分；发布时扣除，未采纳可取消退回。
        </div>
      </TFormItem>
      <template v-if="originType === 'repost'">
        <TFormItem label="原作者">
          <TInput v-model="originAuthor" :maxlength="80" placeholder="原始内容的作者" />
        </TFormItem>
        <TFormItem label="原始出处链接" required>
          <TInput v-model="originUrl" :maxlength="500" placeholder="转载内容的原始出处 URL" />
        </TFormItem>
        <TFormItem label="来源站点">
          <TInput v-model="originOrg" :maxlength="80" placeholder="例如：苦力怕论坛、CurseForge" />
        </TFormItem>
        <TFormItem label="转载说明 / 授权">
          <TInput
            v-model="originNote"
            :maxlength="500"
            placeholder="授权情况、转载说明等（可选）"
          />
        </TFormItem>
      </template>
    </TForm>

    <RichTextEditor v-model="contentHtml" :floating-toolbar-top="86" @notify="forwardNotify" />

    <div
      :ref="(el) => setRef('shell', el)"
      class="community-composer__actions-shell"
      :style="shellStyle"
    >
      <div
        :ref="(el) => setRef('actions', el)"
        class="community-composer__actions"
        :class="{ 'is-floating': floating }"
        :style="floatingStyle"
      >
        <TButton
          variant="solid"
          tone="accent"
          class="community-submit-button community-composer__submit"
          :loading="saving"
          @click="emit('submit')"
        >
          {{ editing ? '保存修改' : '发布帖子' }}
        </TButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 面板根节点（.community-panel 的描边 / 圆角 / 内边距）由视图的 scoped 样式命中——
   父级 scoped 只作用到子组件根节点，所以根上这层不必重写；**根里面的元素则全部要自带**。 */
.community-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

/* 原来吃的是视图里 `.community-panel h3` 那条（margin 0 + 深墨色） */
.community-composer h3 {
  margin: 0;
  color: var(--73-ink);
}

.community-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.community-form-item--full {
  grid-column: 1 / -1;
}

.community-bounty-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.community-bounty-field__unit {
  font-size: 13px;
  color: var(--73-ink-muted);
}

.community-form__hint {
  width: 100%;
  margin-top: 6px;
  font-size: 12px;
  color: var(--73-ink-placeholder);
  line-height: 1.6;
}

.community-composer__actions-shell {
  position: relative;
  z-index: 7;
  margin-top: 14px;
}

/* 包裹 div 的语义：两端对齐（原来一半来自视图那条共享选择器）→ 整体右对齐 */
.community-composer__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.community-composer__actions.is-floating {
  position: fixed;
  z-index: 46;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--73-accent-line);
  border-radius: var(--73-radius-inner);
  background: var(--73-bg-soft);
  box-shadow: var(--73-shadow-panel);
  backdrop-filter: blur(var(--73-glass-blur));
}

/* 窄屏：表单塌成单列，标题行与取消按钮改成上下排（原来这档在视图里是 760px，
   新文件只允许 640/900/1180 三档，取手机档 640）。 */
@media (max-width: 900px) {
  .community-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .community-panel__head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
