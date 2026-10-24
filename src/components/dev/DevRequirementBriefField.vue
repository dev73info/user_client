<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'
import { ArrowDown, ArrowUp, TIcon } from 'ui_73info'

/**
 * 卡片里的「需求说明」：需求描述与验收标准两段富文本，配一个「展开 / 收起」。
 *
 * 两段都是后端存的编辑器 HTML，渲染前一律过 `sanitizeRequirementRichText` 清洗。
 * **36 条 `:deep()` 排版规则跟着 `v-html` 容器一起留在本文件**：scoped 样式只对
 * 本组件模板里的元素生效，`v-html` 出来的段落 / 标题 / 列表 / 表格要压回正文行网格，
 * 只能由持有容器的组件用 `:deep()` 穿进去——拆到别处，收起时截断就会切在行中间。
 * `BRIEF_FIELD_BODY_SELECTOR`（硬编码的类名字符串）同理：它量的是本文件里的 DOM，
 * 跟着 DOM 搬，否则「展开」永远不出现。
 *
 * 折叠状态：一张卡只有一行，原先按 `requirement_id` 归键的三张表（展开过没有 / 溢没溢 / 量高度的
 * DOM）在组件内降级成单份 `expanded` / `overflow` / `bodyEl`——组件实例本身就是那一行。
 */
const props = defineProps<{
  description?: string | null
  acceptanceCriteria?: string | null
}>()

/** 需求正文类字段的富文本：净化后渲染；字段为空时给一句占位，免得卡片上只剩一个空白块。 */
function fieldHtml(value: string | null | undefined, fallback: string): string {
  return sanitizeRequirementRichText(value ?? '') || fallback
}

const descriptionHtml = computed(() => fieldHtml(props.description, '当前需求暂未补充详细描述。'))
const acceptanceHtml = computed(() =>
  fieldHtml(props.acceptanceCriteria, '当前需求暂未补充验收标准。'),
)

const expanded = ref(false)
/** 只置位、不翻回 false：见 `measureOverflow` 的说明。 */
const overflow = ref(false)
const bodyEl = ref<HTMLElement | null>(null)

/** 每段正文的类名：本地只拿它逐段量高度，截几行走样式里的 `calc(1.5em * 3)`。 */
const BRIEF_FIELD_BODY_SELECTOR = '.dev-requirement-card__field-body'

/**
 * 量这两段正文有没有被折叠截掉：**逐段量**，任一段被截就出「展开」。
 * 只量整块的话，只要需求描述够长、整块就溢出，验收标准那边有没有被截根本看不出来。
 *
 * 只置位、不翻回 false：展开状态下两段都没有 max-height，量出来当然不溢出；这时若把标记翻回
 * false，「收起」按钮会当场消失，收起来之后连「展开」也没了，用户就再也打不开。
 */
function measureOverflow() {
  const target = bodyEl.value
  if (!target) {
    return
  }

  const overflows = Array.from(
    target.querySelectorAll<HTMLElement>(BRIEF_FIELD_BODY_SELECTOR),
  ).some((body) => body.scrollHeight > body.clientHeight + 2)
  if (overflows) {
    overflow.value = true
  }
}

function setBodyRef(el: unknown) {
  bodyEl.value = (el as HTMLElement | null) ?? null
  if (!bodyEl.value) {
    return
  }
  void nextTick(measureOverflow)
}

function toggle() {
  expanded.value = !expanded.value
}
</script>

<template>
  <!-- 需求说明：需求描述与验收标准各一段，收起时**各段各截头几行**（见样式里的 .is-collapsed），
       一个「展开 / 收起」管两段——各挂一个折叠按钮的话，同一块正文会有两个开关。 -->
  <div class="dev-requirement-card__brief" :class="{ 'is-collapsed': !expanded }" :ref="setBodyRef">
    <section class="dev-requirement-card__field">
      <span class="dev-requirement-card__field-label">需求描述</span>
      <article
        class="dev-requirement-hall__desc dev-requirement-card__description dev-requirement-card__field-body"
        v-html="descriptionHtml"
      ></article>
    </section>
    <section class="dev-requirement-card__field">
      <span class="dev-requirement-card__field-label">验收标准</span>
      <article
        class="dev-requirement-hall__desc dev-requirement-card__description dev-requirement-card__field-body"
        v-html="acceptanceHtml"
      ></article>
    </section>
  </div>
  <button
    v-if="expanded || overflow"
    type="button"
    class="dev-requirement-card__description-toggle"
    @click="toggle"
  >
    <TIcon>
      <ArrowUp v-if="expanded" />
      <ArrowDown v-else />
    </TIcon>
    <span>{{ expanded ? '收起' : '展开' }}</span>
  </button>
</template>

<style scoped>
/* 需求说明：需求描述一段、验收标准一段，两段都是正文（13px），段标题走下面那个小标签。
   两段字数都会很多，所以收起时**各段各截头几行**（见下面的 .is-collapsed），
   不是整块只截一次——整块截的话描述一长，验收标准整段就都看不见了。
   （行高 / 收起行数两个变量定义在卡片根上（`--dev-brief-line-height` / `-collapsed-lines`），
   自定义属性按 DOM 继承，本组件是那张卡的子节点，值照样拿得到。） */
.dev-requirement-card__brief {
  display: grid;
  gap: 12px;
}

.dev-requirement-card__field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

/* 段标题走卡片里既有的小标签口径（与 .dev-requirement-card__meta-item label 同档 11px）：
   验收标准与需求描述是两件事，不能糊成一段。 */
.dev-requirement-card__field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

/* 收起时每段各留 N 行：3 行 × 行高 1.5 × 字号 13px = 58.5px。
   按行高算而不是写死 px，改字号或改行数都不用回来重新量。 */
.dev-requirement-card__brief.is-collapsed .dev-requirement-card__field-body {
  max-height: calc(1em * var(--dev-brief-line-height) * var(--dev-brief-collapsed-lines));
  overflow: hidden;
}

/* 卡片里的描述是正文，取 13px（与 .dev-stack-item__meta 同档）；
   表格单元格里的描述用 .dev-requirement-hall__desc 的 12px 弱字，
   这里带上一层 .dev-requirement-card__title-block 前缀，才稳定压得住那份 12px。
   （前缀那个类在卡片根组件里、本组件的上面，scoped 只会给**最后一段**选择器加属性，
   所以这条规则照样命中本文件里的两段 v-html 容器。）

   正文里是富文本，门户那套全局规则（resource-core.css）会直接命中里面的段落与标题——
   `p { line-height: 1.6; color: var(--text-sub) }`、`h1 / h2 { font-size: 2.5rem / 1.5rem }`。
   其中行高最要命：段落实际是 20.8px 高，而收起的 max-height 是按 19.5px 算的，
   截断就切在行中间（「3. 交付源码与部署说明」被削掉一半就是这么来的），
   所以正文字号、行高、颜色都在这里重新定死，段落与标题再逐个 reset（见下面）。 */
.dev-requirement-card__title-block .dev-requirement-card__description {
  margin: 0;
  font-size: 13px;
  line-height: var(--dev-brief-line-height);
  color: var(--dev-muted);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

/* 行高与颜色一律回到卡片正文：富文本里的段落、列表项、标题都得压在同一个行网格上，
   否则收起时截断落不到行与行之间。 */
.dev-requirement-card__description :deep(p),
.dev-requirement-card__description :deep(li),
.dev-requirement-card__description :deep(h1),
.dev-requirement-card__description :deep(h2),
.dev-requirement-card__description :deep(h3),
.dev-requirement-card__description :deep(h4),
.dev-requirement-card__description :deep(h5),
.dev-requirement-card__description :deep(h6) {
  line-height: inherit;
  color: inherit;
}

/* 从别处粘进来的标题一律压回正文字号（h1 是 2.5rem、h2 是 1.5rem，
   卡片里放不下，收起的那 3 行也装不下一行标题），只留加粗与深色做层级。 */
.dev-requirement-card__description :deep(h1),
.dev-requirement-card__description :deep(h2),
.dev-requirement-card__description :deep(h3),
.dev-requirement-card__description :deep(h4),
.dev-requirement-card__description :deep(h5),
.dev-requirement-card__description :deep(h6) {
  margin: 10px 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(p) {
  margin: 0 0 8px;
}

/* 列表缩进按 13px 正文收窄（浏览器默认 40px 在卡片里太空），段间距与段落对齐 8px */
.dev-requirement-card__description :deep(ul),
.dev-requirement-card__description :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}

.dev-requirement-card__description :deep(li) {
  margin: 2px 0;
}

/* 首尾元素的外边距贴齐容器，卡片里不外溢出一截空白 */
.dev-requirement-card__description :deep(> *:first-child) {
  margin-top: 0;
}

.dev-requirement-card__description :deep(> *:last-child) {
  margin-bottom: 0;
}

/* 加粗在弱字上只粗一点点，扫读时抓不住，所以再加一档色 */
.dev-requirement-card__description :deep(strong),
.dev-requirement-card__description :deep(b) {
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(a) {
  color: var(--dev-blue);
  overflow-wrap: anywhere;
}

.dev-requirement-card__description :deep(a:hover) {
  text-decoration: underline;
}

.dev-requirement-card__description :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid var(--wb-accent-line);
}

.dev-requirement-card__description :deep(hr) {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid var(--dev-line);
}

/* 描述里可能夹着图片、视频、表格与代码块（富文本编辑器都插得进来）。
   卡片宽度有限，一律按卡片宽收住，不让它们把卡片撑出横向滚动。 */
.dev-requirement-card__description :deep(img),
.dev-requirement-card__description :deep(video) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 8px 0;
  border-radius: 8px;
}

.dev-requirement-card__description :deep(table) {
  display: block;
  max-width: 100%;
  margin: 8px 0;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 12px;
}

.dev-requirement-card__description :deep(th),
.dev-requirement-card__description :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--dev-line);
  text-align: left;
  vertical-align: top;
}

.dev-requirement-card__description :deep(th) {
  background: var(--dev-bg);
  font-weight: 700;
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(pre) {
  margin: 8px 0;
  overflow-x: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dev-bg);
  white-space: pre;
}

.dev-requirement-card__description :deep(code) {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--dev-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--dev-ink);
}

/* 代码块里的 code 不再叠一层行内码的底色与内边距 */
.dev-requirement-card__description :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: inherit;
}

/* 收起时把正文里所有块级外边距压平：几像素的段间距就会让行落不到 19.5px 的行网格上，
   max-height 只能切在行中间。压平之后每行等高，截断正好落在行与行之间，
   不需要再叠一层渐隐遮罩。 */
.dev-requirement-card__brief.is-collapsed .dev-requirement-card__description :deep(*) {
  margin-block: 0;
}

.dev-requirement-card__description-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dev-blue);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dev-requirement-card__description-toggle:hover {
  color: var(--dev-blue);
  text-decoration: underline;
}
</style>
