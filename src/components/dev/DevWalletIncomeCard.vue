<script setup lang="ts">
/**
 * 「接单收入」卡：可提现余额大数、待提现/已提现、是否满足提现条件，以及两条并存的出款路径
 * （自动提现开关 / 手动申请提现）与出款通道未就绪时的提醒。
 *
 * 卡只画与 `emit`：读数来自 `useDevWalletOverview` 的投影，开关状态只由服务端的
 * `withdrawalSetting` 推导（点开关不本地翻转），提现弹窗与回刷都在页面。
 *
 * 样式走全局 `styles/dev-wallet.css` 的 `.wallet-hero*` / `.wallet-payout*`，本组件不带 style 块。
 */
import type { DevWalletOverview } from '@/api/devWallet'
import { money } from '@/shared/devFundDisplay'

import { TButton, TCard, TIcon, TSwitch, TTag, Wallet, WarningFilled } from 'ui_73info'

const props = defineProps<{
  /** 收入池总览：余额、待提现、已提现都从这里取 */
  overview: DevWalletOverview | null
  /** 可提现余额是否达标（不达标时大数与标签都压弱） */
  canWithdraw: boolean
  autoWithdrawEnabled: boolean
  autoWithdrawSaving: boolean
  /** 自动提现开关是否可点：通道不可用时禁用，但已开启的要允许关闭 */
  autoWithdrawReady: boolean
  /** 手动提现入口是否可点：余额达标且通道可用 */
  canSubmitWithdrawal: boolean
  /** 设置接口是否已返回：返回前不判断通道状态，避免误报「通道未就绪」 */
  withdrawalSettingLoaded: boolean
  payoutChannelReady: boolean
  payoutChannelMessage: string
}>()

const emit = defineEmits<{
  /** 切换自动提现：等服务端确认后再动开关 */
  'toggle-auto-withdraw': [next: boolean]
  /** 打开收入提现弹窗 */
  withdraw: []
  /** 去账号中心绑定收款银行卡 */
  'bind-account': []
}>()
</script>

<template>
  <TCard class="dev-surface-card wallet-hero__card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">接单收入</h3>
      </div>
      <div class="dev-card-head__actions">
        <TTag variant="outline" tone="info"
          >已提现 {{ money(props.overview?.paid_withdraw_cny) }}</TTag
        >
      </div>
    </div>
    <div class="wallet-hero__body">
      <div class="wallet-hero__main">
        <span class="dev-figure" :class="{ 'dev-figure--muted': !props.canWithdraw }">
          {{ money(props.overview?.withdrawable_balance_cny) }}
        </span>
      </div>
      <!-- 状态标签一行：只留「提现处理中」这类真实在途状态 -->
      <div class="wallet-hero__meta">
        <div class="wallet-hero__tags">
          <TTag
            variant="outline"
            v-if="(props.overview?.pending_withdraw_cny ?? 0) > 0"
            tone="warning"
          >
            提现处理中 {{ money(props.overview?.pending_withdraw_cny) }}
          </TTag>
        </div>
      </div>
    </div>

    <!-- 自动提现与手动提现是并存的两条出款路径：并成一行展示，说明折到行下方 -->
    <div class="wallet-payout">
      <div class="wallet-payout__paths">
        <div class="wallet-payout__path">
          <span class="wallet-payout__title">自动提现</span>
          <TSwitch
            class="wallet-payout__switch"
            :model-value="props.autoWithdrawEnabled"
            :loading="props.autoWithdrawSaving"
            :disabled="!props.autoWithdrawReady"
            aria-label="自动提现"
            @update:model-value="(next: boolean) => emit('toggle-auto-withdraw', next)"
          />
        </div>
        <div class="wallet-payout__path">
          <TButton
            variant="solid"
            tone="accent"
            :disabled="!props.canSubmitWithdrawal"
            @click="emit('withdraw')"
          >
            <TIcon>
              <Wallet />
            </TIcon>
            <span>申请提现</span>
          </TButton>
        </div>
      </div>
      <div
        v-if="props.withdrawalSettingLoaded && !props.payoutChannelReady"
        class="wallet-payout__alert"
        role="status"
      >
        <TIcon>
          <WarningFilled />
        </TIcon>
        <span>{{ props.payoutChannelMessage || '出款通道暂未就绪，请先绑定收款银行卡' }}</span>
        <TButton variant="text" tone="accent" @click="emit('bind-account')">去绑定</TButton>
      </div>
    </div>
  </TCard>
</template>
