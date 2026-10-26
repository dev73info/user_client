<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { TIcon, Close, Document, Link, Picture, Refresh, Share, TMessage } from 'ui_73info'

import { generateShareCard, type GenerateShareCardPayload, type ShareCardData } from '@/api/invite'
import { useAuthStore } from '@/stores/auth'

const props = withDefaults(
  defineProps<{
    shareType?: GenerateShareCardPayload['share_type']
    targetId?: string
    label?: string
  }>(),
  { shareType: 'invite', targetId: '', label: '分享' },
)
const auth = useAuthStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const cardData = ref<ShareCardData | null>(null)
const loading = ref(false)
const previewOpen = ref(false)
const loadError = ref('')

function themePalette() {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const read = (name: string) => {
    probe.style.color = `var(${name})`
    return style.color
  }
  const palette = {
    surface: read('--73-surface-strong'),
    accentSoft: read('--73-accent-soft'),
    ink: read('--73-ink'),
    accent: read('--73-accent'),
    muted: read('--73-ink-muted'),
    border: read('--73-border'),
  }
  probe.remove()
  return palette
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let next = text
  while (next.length > 0 && ctx.measureText(`${next}…`).width > maxWidth) next = next.slice(0, -1)
  return `${next || text.slice(0, 1)}…`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

async function renderCard() {
  const canvas = canvasRef.value
  const data = cardData.value
  if (!canvas || !data) return
  const width = 720
  const height = 960
  const scale = Math.max(window.devicePixelRatio || 1, 1)
  canvas.width = width * scale
  canvas.height = height * scale
  canvas.style.aspectRatio = `${width} / ${height}`
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法绘制分享卡')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const colors = themePalette()
  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, colors.surface)
  background.addColorStop(1, colors.accentSoft)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = colors.accent
  ctx.fillRect(0, 0, width, 12)
  ctx.fillStyle = colors.ink
  ctx.font = '800 34px sans-serif'
  ctx.fillText('73Info 柒叁信息', 54, 84)
  ctx.fillStyle = colors.accent
  ctx.font = '700 20px sans-serif'
  ctx.fillText('资源共享与定制需求平台', 54, 120)
  roundRect(ctx, 44, 160, 632, 380, 8)
  ctx.fillStyle = colors.surface
  ctx.fill()
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = colors.ink
  ctx.font = '900 40px sans-serif'
  ctx.fillText(fitText(ctx, data.title, 560), 76, 234)
  ctx.fillStyle = colors.muted
  ctx.font = '700 24px sans-serif'
  ctx.fillText(fitText(ctx, data.subtitle, 540), 76, 286)
  let tagLeft = 76
  ctx.font = '800 19px sans-serif'
  for (const tag of data.tags.slice(0, 4)) {
    const label = fitText(ctx, tag, 170)
    const tagWidth = Math.min(ctx.measureText(label).width + 28, 198)
    roundRect(ctx, tagLeft, 326, tagWidth, 42, 8)
    ctx.fillStyle = colors.accentSoft
    ctx.fill()
    ctx.fillStyle = colors.accent
    ctx.fillText(label, tagLeft + 14, 354)
    tagLeft += tagWidth + 10
  }
  ctx.fillStyle = colors.muted
  ctx.font = '700 23px sans-serif'
  ctx.fillText(`来自 ${data.sharer} 的分享`, 76, 474)
  const qrImage = new Image()
  qrImage.src = await QRCode.toDataURL(data.qr_url, { margin: 1, width: 230 })
  await new Promise<void>((resolve, reject) => {
    qrImage.onload = () => resolve()
    qrImage.onerror = () => reject(new Error('二维码生成失败'))
  })
  roundRect(ctx, 74, 574, 572, 248, 8)
  ctx.fillStyle = colors.surface
  ctx.fill()
  ctx.strokeStyle = colors.border
  ctx.stroke()
  ctx.drawImage(qrImage, 98, 618, 160, 160)
  ctx.fillStyle = colors.ink
  ctx.font = '900 28px sans-serif'
  ctx.fillText('扫码查看详情', 300, 664)
  ctx.fillStyle = colors.muted
  ctx.font = '700 20px sans-serif'
  ctx.fillText('通过邀请链接加入 73Info', 300, 716)
  ctx.fillText(fitText(ctx, data.qr_url, 292), 300, 766)
  ctx.font = '700 18px sans-serif'
  ctx.fillText('73info.cn', 54, 914)
}

async function loadCard() {
  auth.hydrate()
  if (!auth.token) {
    TMessage.warning('请先登录后生成分享卡')
    return
  }
  loading.value = true
  loadError.value = ''
  previewOpen.value = true
  try {
    const payload = await generateShareCard(auth.token, {
      share_type: props.shareType,
      ...(props.targetId ? { target_id: props.targetId } : {}),
    })
    cardData.value = payload.card_data
    await nextTick()
    await renderCard()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '生成分享卡失败'
  } finally {
    loading.value = false
  }
}

function canvasBlob(): Promise<Blob> {
  const canvas = canvasRef.value
  if (!canvas || !cardData.value) return Promise.reject(new Error('分享卡还未生成'))
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片导出失败'))),
      'image/png',
    ),
  )
}

async function copyImage() {
  try {
    if (!('ClipboardItem' in window)) throw new Error('当前浏览器不支持复制图片')
    const blob = await canvasBlob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    TMessage.success('分享卡已复制')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '复制分享卡失败')
  }
}

async function copyLink() {
  if (!cardData.value) return
  try {
    await navigator.clipboard.writeText(cardData.value.qr_url)
    TMessage.success('分享链接已复制')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '复制分享链接失败')
  }
}

async function downloadImage() {
  try {
    const blob = await canvasBlob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '73info-share-card.png'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '下载分享卡失败')
  }
}

watch(
  () => [props.shareType, props.targetId, auth.token],
  () => {
    cardData.value = null
    if (previewOpen.value) void loadCard()
  },
)
</script>

<template>
  <section class="share-card-generator" aria-label="分享卡片">
    <button
      class="share-card-generator__start"
      type="button"
      :disabled="loading"
      :aria-busy="loading"
      @click="loadCard"
    >
      <TIcon><Share /></TIcon><span>{{ props.label }}</span>
    </button>
    <Teleport to="body">
      <div
        v-if="previewOpen"
        class="share-card-generator__overlay"
        role="dialog"
        aria-modal="true"
        aria-label="分享卡片预览"
        @click.self="previewOpen = false"
      >
        <section class="share-card-generator__dialog">
          <header class="share-card-generator__head">
            <h2>分享预览</h2>
            <div class="share-card-generator__actions">
              <button
                type="button"
                :disabled="loading"
                aria-label="重新生成分享卡"
                @click="loadCard"
              >
                <TIcon><Refresh /></TIcon>
              </button>
              <button type="button" aria-label="收起分享卡预览" @click="previewOpen = false">
                <TIcon><Close /></TIcon>
              </button>
            </div>
          </header>
          <div v-if="loadError" class="share-card-generator__loading" role="alert">
            <span>{{ loadError }}</span
            ><button type="button" @click="loadCard">重试</button>
          </div>
          <div v-else-if="loading && !cardData" class="share-card-generator__loading" role="status">
            分享卡生成中…
          </div>
          <canvas v-show="cardData" ref="canvasRef" class="share-card-generator__canvas" />
          <footer class="share-card-generator__footer">
            <button type="button" :disabled="!cardData" aria-label="复制分享链接" @click="copyLink">
              <TIcon><Link /></TIcon><span>链接</span>
            </button>
            <button type="button" :disabled="!cardData" aria-label="复制分享卡" @click="copyImage">
              <TIcon><Document /></TIcon><span>复制</span>
            </button>
            <button
              type="button"
              :disabled="!cardData"
              aria-label="下载分享卡"
              @click="downloadImage"
            >
              <TIcon><Picture /></TIcon><span>下载</span>
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./share-card-generator.css"></style>
