<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import {
  TButton,
  TIcon,
  TMessage,
  TOption,
  TRadio,
  TRadioGroup,
  TSelect,
  TSwitch,
  type SelectModelValue,
  type SelectValue,
  Refresh,
} from 'ui_73info'

import { getMyPoints, setPerkEquipped, setUsernameAppearance, type UserPerk } from '@/api/points'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const perks = ref<UserPerk[]>([])
const loading = ref(false)
const error = ref('')
const perkSaving = ref('')
const appearanceSaving = ref(false)
const appearanceMode = ref<'gradient' | 'color'>('gradient')
const selectedColor = ref('')

function onAppearanceModeChange(value: SelectValue) {
  appearanceMode.value = value as 'gradient' | 'color'
}
function onColorChange(value: SelectModelValue) {
  selectedColor.value = value as string
}

const ownedPerkCount = computed(() => perks.value.filter((item) => item.owned).length)
const equippedPerkCount = computed(() => perks.value.filter((item) => item.equipped).length)

function perkTitle(code: string) {
  if (code === 'username_gradient') return '用户名渐变'
  if (code.startsWith('username_color')) {
    const hex = code.split(':')[1] ?? ''
    return hex ? `用户名特定颜色 #${hex}` : '用户名特定颜色'
  }
  if (code === 'home_background_static') return '主页静态背景自定义'
  if (code === 'home_background_dynamic') return '主页动态背景自定义'
  return code
}
function perkExpireText(perk: UserPerk) {
  return perk.expires_at ? `有效期至 ${perk.expires_at}` : '永久有效'
}

const colorPerks = computed(() =>
  perks.value.filter((p) => p.perk_code.startsWith('username_color:') && p.owned),
)
const gradientPerk = computed(() =>
  perks.value.find((p) => p.perk_code === 'username_gradient' && p.owned),
)
const hasUsernameAppearance = computed(() => !!gradientPerk.value || colorPerks.value.length > 0)
const displayedPerks = computed(() =>
  perks.value.filter(
    (p) => p.perk_code !== 'username_gradient' && !p.perk_code.startsWith('username_color'),
  ),
)

function perkCodeHex(code: string): string {
  const hex = code.split(':')[1] ?? ''
  return hex ? `#${hex}` : ''
}

function initUsernameAppearance() {
  const equippedColor = perks.value.find(
    (p) => p.perk_code.startsWith('username_color:') && p.equipped,
  )
  appearanceMode.value = equippedColor ? 'color' : 'gradient'
  if (equippedColor) selectedColor.value = equippedColor.perk_code
}

async function loadPerks() {
  loading.value = true
  error.value = ''
  try {
    const data = await getMyPoints(auth.token, { page: 1, page_size: 1 })
    perks.value = data.perks ?? []
    initUsernameAppearance()
  } catch (err) {
    error.value = describeBackendError(err, '加载权益失败')
  } finally {
    loading.value = false
  }
}

async function saveAppearance() {
  if (!auth.token || appearanceSaving.value) return
  appearanceSaving.value = true
  try {
    if (appearanceMode.value === 'gradient') {
      await setUsernameAppearance(auth.token, 'gradient')
    } else {
      if (!selectedColor.value) {
        TMessage.warning('请选择颜色')
        return
      }
      await setUsernameAppearance(auth.token, 'color', perkCodeHex(selectedColor.value))
    }
    TMessage.success('用户名颜色设置已更新')
    await loadPerks()
  } catch (err) {
    TMessage.error(describeBackendError(err, '设置用户名颜色失败'))
  } finally {
    appearanceSaving.value = false
  }
}

async function togglePerk(code: string, value: boolean | string | number) {
  const equipped = Boolean(value)
  perkSaving.value = code
  try {
    const res = await setPerkEquipped(auth.token, code, equipped)
    const idx = perks.value.findIndex((p) => p.perk_code === code)
    if (idx >= 0) perks.value.splice(idx, 1, res)
    else perks.value.push(res)
    TMessage.success(equipped ? `已佩戴「${perkTitle(code)}」` : `已卸下「${perkTitle(code)}」`)
  } catch (err) {
    TMessage.error(describeBackendError(err, '更新权益佩戴状态失败'))
  } finally {
    perkSaving.value = ''
  }
}

onMounted(() => {
  auth.hydrate()
  if (!auth.isAuthed) {
    void router.replace('/')
    return
  }
  void loadPerks()
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page perks-page wb-sheet" :aria-busy="loading">
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="权益概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">已解锁权益</span>
          <span class="wb-strip__value">{{ loading || error ? '—' : ownedPerkCount }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">已佩戴权益</span>
          <span class="wb-strip__value">{{ loading || error ? '—' : equippedPerkCount }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新权益" @click="loadPerks">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>
    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的权益</h3>
        </div>
      </div>
      <p v-if="loading" class="wb-empty" role="status">正在加载权益…</p>
      <div v-else-if="error" class="wb-empty" role="alert">
        <span class="wb-empty__title">加载权益失败</span>{{ error }}
        <div class="wb-empty__actions">
          <TButton @click="loadPerks"
            ><TIcon><Refresh /></TIcon><span>重新加载</span></TButton
          >
        </div>
      </div>
      <p
        v-else-if="!displayedPerks.length && !hasUsernameAppearance"
        class="wb-empty"
        role="status"
      >
        <span class="wb-empty__title">还没有解锁任何权益</span>
      </p>
      <ul v-if="displayedPerks.length" class="wb-list" aria-label="我的权益">
        <li v-for="perk in displayedPerks" :key="perk.perk_code" class="wb-item">
          <div class="wb-item__main">
            <span class="wb-item__title">{{ perkTitle(perk.perk_code) }}</span>
            <span class="wb-item__meta">{{ perkExpireText(perk) }}</span>
          </div>
          <div class="wb-item__side">
            <span class="wb-badge" :class="{ 'wb-badge--success': perk.equipped }">
              {{ perk.equipped ? '已佩戴' : '未佩戴' }}
            </span>
            <TSwitch
              :model-value="perk.equipped"
              :disabled="perkSaving === perk.perk_code"
              :loading="perkSaving === perk.perk_code"
              aria-label="佩戴权益"
              @change="togglePerk(perk.perk_code, $event)"
            />
          </div>
        </li>
      </ul>
      <div v-if="hasUsernameAppearance" class="wb-panel appearance-panel">
        <strong class="wb-subhead">用户名颜色设置</strong>
        <TRadioGroup :model-value="appearanceMode" @update:model-value="onAppearanceModeChange">
          <TRadio value="gradient" :disabled="!gradientPerk">渐变</TRadio>
          <TRadio value="color" :disabled="colorPerks.length === 0">特定颜色</TRadio>
        </TRadioGroup>
        <div v-if="appearanceMode === 'color'" class="appearance-color-row">
          <TSelect
            :model-value="selectedColor"
            placeholder="选择颜色"
            aria-label="选择用户名颜色"
            @update:model-value="onColorChange"
          >
            <TOption v-for="p in colorPerks" :key="p.perk_code" :value="p.perk_code">
              <span class="perk-color" :style="{ background: perkCodeHex(p.perk_code) }"></span>
              {{ perkTitle(p.perk_code) }}
            </TOption>
          </TSelect>
        </div>
        <div class="appearance-panel__submit">
          <TButton
            variant="solid"
            tone="accent"
            :loading="appearanceSaving"
            @click="saveAppearance"
          >
            保存
          </TButton>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.appearance-panel {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}
.appearance-color-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.appearance-color-row .t73-select {
  min-width: 200px;
}
.appearance-panel__submit {
  display: flex;
  justify-content: flex-end;
}
.perk-color {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  border: 1px solid var(--wb-line);
  border-radius: 4px;
  vertical-align: -2px;
}
</style>
