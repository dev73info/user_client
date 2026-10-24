<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchUserServiceAgreement } from '@/api/auth'
import { LEGAL_NOTICE_VERSION } from './legalNotice'
import { findLegalSectionTitle, legalSectionAnchor } from './legalText'

type KeyTermItem = {
  /** 条目名 */
  label: string
  /** 人话摘要 */
  summary: string
  /** 在协议正文里定位章节的关键词（各协议章节名不同，只能按关键词找） */
  keyword: string
}

/**
 * 提示项固定为五类：责任限制、免责、费用与支付、争议解决、协议变更。
 * 顺序即展示顺序，摘要文案只在这里写，不要散落到各页面。
 */
const KEY_TERM_ITEMS: KeyTermItem[] = [
  {
    label: '责任限制',
    summary:
      '平台就本协议承担的赔偿责任，以争议所涉订单的平台服务费为限；故意或重大过失、人身损害、知识产权、个人信息与支付合规等情形不适用该上限。',
    keyword: '责任',
  },
  {
    label: '免责',
    summary:
      '因不可抗力、基础运营商故障、第三方服务异常、支付渠道处理等平台不能控制的原因造成的损失，按协议约定处理。',
    keyword: '违约',
  },
  {
    label: '费用与支付',
    summary:
      '平台服务费、保证金、充值与提现的金额、用途与规则，以页面展示和《支付与退款说明》为准；平台不会要求向私人账户转账。',
    keyword: '费用',
  },
  {
    label: '争议解决',
    summary: '争议先协商；协商不成的，按协议约定的管辖法院起诉。',
    keyword: '争议解决',
  },
  {
    label: '协议变更',
    summary: '协议变更会提前公告与通知；涉及重要条款的变更会单独提示。',
    keyword: '变更',
  },
]

const props = withDefaults(
  defineProps<{
    /** 要提示的协议 code（页面据此决定跳到哪份协议，本组件不再自己取正文） */
    code?: string
    /** 页面里已渲染的章节标题；给了才能跳到正文对应位置 */
    headings?: { id: string; title: string }[]
    /** 没有正文可跳时的兜底链接（例如登录弹窗里跳到 /terms） */
    fallbackHref?: string
    /** 协议版本号。由页面取到正文后传进来——组件自己**不再发请求**（见下方说明）。 */
    version?: string
    /** 协议生效日期，同上：给了就不重复取。 */
    effectiveAt?: string
  }>(),
  {
    code: 'user_service_agreement',
    headings: () => [],
    fallbackHref: '',
    version: '',
    effectiveAt: '',
  },
)

const emit = defineEmits<{
  (e: 'loaded', payload: { version: string; effective_at: string }): void
}>()

/**
 * 版本号 / 生效日期：优先用页面传进来的；页面没给时**按协议 code 走契约里真实存在的端点**。
 *
 * 这里原先统一去取 `/api/auth/agreement-content?code=...`，而那个端点在当前后端契约里
 * **不存在**（只有 `/api/auth/user-service-agreement` 与 `/api/contract/**`），
 * 每次都是 404 再被 catch 吞掉，等于白打一次请求还假装拿到了数据。
 *
 * 现在只有《用户服务协议》能取到整数 `version`（`AgreementContentResponse`）；
 * 开发者入驻协议与接口使用协议在契约里只有合同详情（`ContractResponse` 没有版本号），
 * 所以那两档不发请求、也不显示版本——留痕时 `agreement_version` 传空串，
 * 后端按「留空取模板当前版本」落库（见 `crates/identity/src/api/application/agreement.rs`）。
 */
const version = ref(props.version)
const effectiveAt = ref(props.effectiveAt)

/** 只有《用户服务协议》有「正文 + 版本 + 生效日期」的公开端点。 */
const AGREEMENT_CONTENT_SOURCES: Record<
  string,
  () => Promise<{ version: number; effective_at: string }>
> = {
  user_service_agreement: fetchUserServiceAgreement,
}

async function loadAgreementMeta() {
  const fetcher = AGREEMENT_CONTENT_SOURCES[props.code]
  if (!fetcher) {
    return
  }

  try {
    const content = await fetcher()
    const nextVersion = String(content.version)
    version.value = nextVersion
    effectiveAt.value = content.effective_at
    emit('loaded', { version: nextVersion, effective_at: content.effective_at })
  } catch {
    // 取不到就不显示版本：不编一个出来，也不把失败当成「已确认当前版本」。
    version.value = props.version
    effectiveAt.value = props.effectiveAt
  }
}

/** 每个条目的跳转地址：能定位到正文章节就跳章节，否则走兜底链接。 */
const items = computed(() =>
  KEY_TERM_ITEMS.map((item) => {
    const title = findLegalSectionTitle(item.keyword, props.headings ?? [])
    return {
      ...item,
      href: title ? legalSectionAnchor(title) : props.fallbackHref,
    }
  }),
)

onMounted(() => {
  // 页面已经给出版本 / 生效日期就不必再取一遍。
  if (!props.version && !props.effectiveAt) {
    void loadAgreementMeta()
  }
})

watch(
  () => [props.version, props.effectiveAt] as const,
  ([nextVersion, nextEffectiveAt]) => {
    version.value = nextVersion
    effectiveAt.value = nextEffectiveAt
  },
)

defineExpose({ version, effectiveAt, noticeVersion: LEGAL_NOTICE_VERSION })
</script>

<template>
  <section class="key-terms-notice" aria-label="重要条款提示">
    <header class="key-terms-notice__head">
      <h3 class="key-terms-notice__title">重要条款提示</h3>
      <p v-if="version" class="key-terms-notice__meta">
        协议版本 {{ version }}<template v-if="effectiveAt"> · 生效日期 {{ effectiveAt }}</template>
      </p>
    </header>

    <ul class="key-terms-notice__list">
      <li v-for="item in items" :key="item.label" class="key-terms-notice__item">
        <p class="key-terms-notice__label">
          {{ item.label }}
          <a v-if="item.href" class="key-terms-notice__link" :href="item.href">查看对应条款</a>
        </p>
        <p class="key-terms-notice__summary">{{ item.summary }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 色值一律走 `--73-*` 令牌（原稿用的是 `var(--el-*, #字面色)` 的兜底写法，
   兜底值在标准化检查里算裸色值；这里改成同档令牌，不新增色值债）。 */
.key-terms-notice {
  border: 1px solid var(--73-border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0 0 16px;
  background: var(--73-surface-strong);
}

.key-terms-notice__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.key-terms-notice__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.key-terms-notice__meta {
  margin: 0;
  font-size: 12px;
  color: var(--73-ink-muted);
}

.key-terms-notice__list {
  margin: 8px 0 0;
  padding-left: 18px;
}

.key-terms-notice__item {
  margin: 6px 0;
}

.key-terms-notice__label {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.key-terms-notice__summary {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--73-ink-soft);
}

.key-terms-notice__link {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
}
</style>
