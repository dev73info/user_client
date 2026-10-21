<script setup lang="ts">
import { TAlert, TButton, TForm, TFormItem, TInput, TSwitch } from 'ui_73info'

/**
 * R028「接口资源接入配置」整块：回调地址 / 回调密钥 / 购买限制 / 允许来源，
 * 加一次性密钥面板与「接入提示词」样张。
 *
 * 两条提示是互斥的：渠道上一次保存失败（`channelRetryOnly`）优先于「还没配齐」，
 * 因为前者决定下一次点「保存」会不会只重发这一半。
 */
defineProps<{
  /** 资源主页已保存、只有渠道配置没成功——提示「再点保存只重发这一半」。 */
  retryOnly: boolean
  channelSaveError: string
  /** 还缺哪几项（空数组表示已配齐）。 */
  blockers: string[]
  callbackInvalid: boolean
  /** 第一条格式不对的允许来源（null = 都对）。 */
  invalidOrigin: string | null
  /** 已保存密钥的展示口径：`未生成` / 掩码 / `本次已生成`。 */
  secretMaskedLabel: string
  /** 后端首次生成的明文：只在这一屏出现。 */
  revealedSecretPlain: string
  integrationPrompt: string
}>()

const emit = defineEmits<{
  copySecret: []
  copyPrompt: []
  repeatChange: [next: boolean]
}>()

const callbackUrl = defineModel<string>('callbackUrl', { required: true })
const callbackSecret = defineModel<string>('callbackSecret', { required: true })
const allowedOrigins = defineModel<string>('allowedOrigins', { required: true })
const repeatPurchasable = defineModel<boolean>('repeatPurchasable', { required: true })
</script>

<template>
  <section class="dev-upload-block dev-upload-block--split">
    <header class="dev-card-head">
      <section class="dev-card-head__title-block">
        <h3 class="dev-section-title">接口资源接入配置</h3>
      </section>
    </header>

    <TAlert
      v-if="retryOnly"
      tone="danger"
      variant="soft"
      class="dev-api-retry-notice"
      data-testid="api-channel-retry-notice"
      title="资源主页已保存，接口资源渠道配置还没成功"
      :description="`原因：${channelSaveError}。修正后点「保存」只会重发渠道配置这一半；主页字段若也要改，渠道补上后再点一次即可。`"
    />

    <TAlert
      v-else-if="blockers.length"
      tone="warning"
      variant="soft"
      class="dev-api-notice"
      title="配置还没配齐，暂不可被下单"
      :description="`${blockers.join('；')}。可以先保存，配齐后再保存一次。`"
    />

    <TForm label-position="top" class="dev-upload-form">
      <div class="dev-upload-grid dev-upload-grid--form">
        <TFormItem label="回调地址" class="dev-form-item--wide">
          <TInput
            v-model="callbackUrl"
            :maxlength="500"
            placeholder="https://shop.example.com/73info/callback"
          />
          <p v-if="callbackInvalid" class="dev-field-hint dev-field-hint--error">
            当前不合法：请填 http(s) 绝对地址。
          </p>
        </TFormItem>

        <TFormItem label="回调密钥" class="dev-form-item--wide">
          <TInput
            v-model="callbackSecret"
            type="password"
            :maxlength="128"
            autocomplete="new-password"
            placeholder="留空 = 不改"
          />
          <p class="dev-field-hint">当前：{{ secretMaskedLabel }}</p>
        </TFormItem>

        <TFormItem label="购买限制" class="dev-form-item--switch">
          <div class="dev-api-switch-row">
            <label class="dev-api-switch">
              <TSwitch
                v-model="repeatPurchasable"
                aria-label="允许重复购买"
                @change="emit('repeatChange', $event)"
              />
            </label>
          </div>
        </TFormItem>

        <!-- 顺序是有意的：可伸缩的多行清单放最后，行尾余量落在它身上，
             最后一行不会被撑成半空；购买限制按内容取宽，和它并排成一行。 -->
        <TFormItem label="允许的来源地址" class="dev-form-item--wide">
          <TInput
            v-model="allowedOrigins"
            type="textarea"
            :autosize="{ minRows: 5, maxRows: 12 }"
            :maxlength="2000"
            placeholder="https://shop.example.com&#10;*.example.com&#10;203.0.113.9"
          />
          <p v-if="invalidOrigin" class="dev-field-hint dev-field-hint--error">
            当前不合法：{{ invalidOrigin }}
          </p>
        </TFormItem>
      </div>
    </TForm>

    <div v-if="revealedSecretPlain" class="dev-api-secret">
      <p class="dev-api-secret__title">回调密钥（只显示这一次，请立即复制保存）</p>
      <code class="dev-api-secret__value">{{ revealedSecretPlain }}</code>
      <TButton variant="outline" @click="emit('copySecret')">复制密钥</TButton>
    </div>

    <div class="dev-api-sample">
      <div class="dev-api-sample__head">
        <h4 class="dev-api-sample__title">接入提示词（复制给 AI 编码代理）</h4>
        <TButton variant="outline" @click="emit('copyPrompt')">复制提示词</TButton>
      </div>
      <pre class="dev-api-sample__code">{{ integrationPrompt }}</pre>
    </div>
  </section>
</template>
