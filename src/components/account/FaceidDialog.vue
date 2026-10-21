<script setup lang="ts">
/**
 * 「人脸核身」弹窗：桌面端给二维码 + 三步指引，移动端给「打开认证页面」的说明。纯展示组件——
 * 发起、轮询、查询、撤回全在 `composables/useFaceidChallenge.ts`；`visible` 由父级持有，
 * 样式随弹窗从视图搬来。
 */
import { computed } from 'vue'

import { TButton, TDialog, TIcon, Link, RefreshRight } from 'ui_73info'

const props = defineProps<{
  visible: boolean
  enterprise: boolean
  /** 触屏档：不给二维码，改成「打开认证页面」。 */
  mobile: boolean
  /** 已生成的爱签核身二维码（data URL），空串时只显示指引。 */
  qrDataUrl: string
  checking: boolean
  withdrawing: boolean
  changeBacked: boolean
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  withdraw: []
  'open-page': []
  check: []
}>()

const headline = computed(() => {
  const target = props.enterprise ? '企业实名认证' : '人脸核身认证'
  return props.mobile ? `请完成${target}` : `请使用手机扫码，完成${target}`
})
</script>

<template>
  <TDialog
    :open="visible"
    :title="enterprise ? '企业认证' : '人脸核身认证'"
    class="realname-faceid-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="realname-faceid-panel__main">
      <div class="realname-faceid-panel__copy">
        <strong>{{ headline }}</strong>
      </div>
      <template v-if="!mobile">
        <img
          v-if="qrDataUrl"
          class="realname-faceid-panel__qr"
          :src="qrDataUrl"
          alt="爱签实名认证二维码"
        />
        <ol class="realname-faceid-panel__steps">
          <li>
            <span>用手机 <strong>微信 / 支付宝</strong> 扫描上方二维码</span>
          </li>
          <li>
            <span>在手机端按提示完成 <strong>人脸核身</strong></span>
          </li>
          <li><span>认证通过后状态自动更新为「已通过」</span></li>
        </ol>
      </template>
      <div v-else class="realname-faceid-panel__mobile-tip">
        <p>请在手机上完成人脸核身认证。</p>
        <p class="realname-faceid-panel__mobile-sub">
          点击下方「打开认证页面」，将跳转到爱签认证页面完成核身。
        </p>
      </div>
    </div>
    <div class="realname-faceid-panel__actions">
      <TButton variant="outline" tone="danger" :loading="withdrawing" @click="emit('withdraw')">
        {{ changeBacked ? '取消变更，还原原主体' : '撤回认证' }}
      </TButton>
      <TButton class="realname-plain-btn" @click="emit('open-page')">
        <TIcon><Link /></TIcon>
        {{ mobile ? '打开认证页面完成核身' : '打开认证页面' }}
      </TButton>
      <TButton
        variant="solid"
        tone="accent"
        class="realname-submit-btn"
        :loading="checking"
        @click="emit('check')"
      >
        <TIcon><RefreshRight /></TIcon>
        查询结果
      </TButton>
    </div>
    <p class="realname-faceid-panel__hint">
      实名认证需本人完成，二维码有效期约 120 分钟。若已完成核身，可点击「查询结果」刷新认证状态。
    </p>
  </TDialog>
</template>

<style scoped>
.realname-faceid-panel__main {
  display: grid;
  gap: 14px;
  justify-items: center;
  text-align: center;
}
.realname-faceid-panel__copy {
  color: var(--73-ink);
  font-size: 15px;
  font-weight: 600;
}
.realname-faceid-panel__qr {
  width: 156px;
  height: 156px;
  padding: 10px;
  border-radius: var(--73-radius-inner);
  border: 1px solid var(--73-border);
  background: var(--73-surface-strong);
  box-shadow: var(--73-shadow-card);
}
/* 三步指引：序号做成徽标（`list-style: decimal` 会把「1.」挂在居中的正文外面）。 */
.realname-faceid-panel__steps {
  margin: 0;
  padding: 12px 14px;
  width: 100%;
  display: grid;
  gap: 8px;
  list-style: none;
  counter-reset: faceid-step;
  text-align: left;
  border-radius: var(--73-radius-inner);
  border: 1px solid var(--73-border-soft);
  background: var(--73-bg-soft);
}
/* 徽标 + 正文两列。正文**必须包在单个元素里**：li 是 grid 容器，裸文本与 <strong> 会各自
   变成一个 grid 项、被塞进 20px 那一列，「微信 / 支付宝」就一个字一行地竖排（span 本身
   是 grid 项、已被 blockify，不用再写 display）。 */
.realname-faceid-panel__steps li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  color: var(--73-ink-soft);
  font-size: 13px;
  line-height: 1.6;
}
/* 徽标改强调色淡底 + 强调色文字：垫了浅底后白底圆点几乎看不见。 */
.realname-faceid-panel__steps li::before {
  counter-increment: faceid-step;
  content: counter(faceid-step);
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: var(--73-radius-pill);
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}
.realname-faceid-panel__steps strong {
  color: var(--73-ink);
  font-weight: 600;
}
.realname-faceid-panel__mobile-tip {
  display: grid;
  gap: 6px;
  color: var(--73-ink-soft);
  font-size: 13px;
  line-height: 1.6;
}
.realname-faceid-panel__mobile-sub {
  color: var(--73-ink-muted);
}
.realname-faceid-panel__hint {
  margin: 14px auto 0;
  padding-top: 12px;
  max-width: 34em;
  border-top: 1px solid var(--73-border-soft);
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
}
/* 三个动作排一行：次要/危险在左、主操作在最右。 */
.realname-faceid-panel__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  white-space: nowrap;
}
/* 触屏档：撑满并给足 44px 触摸目标（设计规范对 <640px> 的硬要求） */
@media (max-width: 640px) {
  .realname-faceid-panel__actions > * {
    flex: 1 1 100%;
    min-height: 44px;
  }
}
</style>
