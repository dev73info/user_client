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
  {
    shareType: 'invite',
    targetId: '',
    label: '分享',
  },
)

const auth = useAuthStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const cardData = ref<ShareCardData | null>(null)
const loading = ref(false)
const previewOpen = ref(false)

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text
  }
  let next = text
  while (next.length > 0 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1)
  }
  return `${next || text.slice(0, 1)}...`
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
  if (!canvas || !data) {
    return
  }

  const width = 760
  const height = 1080
  const scale = Math.max(window.devicePixelRatio || 1, 1)
  canvas.width = width * scale
  canvas.height = height * scale
  canvas.style.width = ''
  canvas.style.aspectRatio = `${width} / ${height}`

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  const qrImage = new Image()
  qrImage.src = await QRCode.toDataURL(data.qr_url, { margin: 1, width: 230 })
  await new Promise<void>((resolve, reject) => {
    qrImage.onload = () => resolve()
    qrImage.onerror = () => reject(new Error('二维码生成失败'))
  })

  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#f8fbff')
  gradient.addColorStop(0.52, '#eef8f2')
  gradient.addColorStop(1, '#fff7ed')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(37, 99, 235, 0.1)'
  ctx.fillRect(0, 0, width, 14)
  ctx.fillStyle = 'rgba(16, 185, 129, 0.16)'
  ctx.fillRect(0, 14, width, 10)

  ctx.fillStyle = '#0f172a'
  ctx.font = '800 36px sans-serif'
  ctx.fillText('73Info 柒叁信息', 68, 96)
  ctx.fillStyle = '#2563eb'
  ctx.font = '700 20px sans-serif'
  ctx.fillText('资源共享与定制需求平台', 68, 130)

  roundRect(ctx, 62, 210, 636, 372, 8)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(191, 219, 254, 0.9)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = '#0f172a'
  ctx.font = '900 42px sans-serif'
  ctx.fillText(fitText(ctx, data.title, 540), 104, 305)
  ctx.fillStyle = '#475569'
  ctx.font = '700 25px sans-serif'
  ctx.fillText(fitText(ctx, data.subtitle, 520), 104, 360)

  let tagLeft = 104
  ctx.font = '800 20px sans-serif'
  for (const tag of data.tags.slice(0, 4)) {
    const label = fitText(ctx, tag, 180)
    const tagWidth = Math.min(ctx.measureText(label).width + 30, 210)
    roundRect(ctx, tagLeft, 426, tagWidth, 42, 8)
    ctx.fillStyle = 'rgba(219, 234, 254, 0.96)'
    ctx.fill()
    ctx.fillStyle = '#1d4ed8'
    ctx.fillText(label, tagLeft + 15, 454)
    tagLeft += tagWidth + 12
  }

  ctx.fillStyle = '#64748b'
  ctx.font = '700 24px sans-serif'
  ctx.fillText(`来自 ${data.sharer} 的分享`, 104, 526)

  roundRect(ctx, 84, 666, 592, 250, 8)
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.95)'
  ctx.stroke()
  ctx.drawImage(qrImage, 124, 706, 170, 170)
  ctx.fillStyle = '#0f172a'
  ctx.font = '900 30px sans-serif'
  ctx.fillText('扫码查看详情', 336, 762)
  ctx.fillStyle = '#64748b'
  ctx.font = '700 21px sans-serif'
  ctx.fillText('通过邀请链接加入 73Info', 336, 806)
  ctx.fillText(fitText(ctx, data.qr_url, 290), 336, 842)

  ctx.fillStyle = '#94a3b8'
  ctx.font = '700 18px sans-serif'
  ctx.fillText('73info.cn', 68, 1010)
}

async function loadCard() {
  auth.hydrate()
  if (!auth.token) {
    TMessage.warning('请先登录后生成分享卡')
    return
  }
  loading.value = true
  try {
    previewOpen.value = true
    const payload = await generateShareCard(auth.token, {
      share_type: props.shareType,
      ...(props.targetId ? { target_id: props.targetId } : {}),
    })
    cardData.value = payload.card_data
    await nextTick()
    await renderCard()
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '生成分享卡失败')
  } finally {
    loading.value = false
  }
}

function closePreview() {
  previewOpen.value = false
}

function canvasBlob(): Promise<Blob> {
  const canvas = canvasRef.value
  if (!canvas) {
    return Promise.reject(new Error('分享卡还未生成'))
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('图片导出失败'))
      }
    }, 'image/png')
  })
}

async function copyImage() {
  try {
    if (!('ClipboardItem' in window)) {
      throw new Error('当前浏览器不支持复制图片')
    }
    const blob = await canvasBlob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    TMessage.success('分享卡已复制')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '复制分享卡失败')
  }
}

async function copyLink() {
  const data = cardData.value
  if (!data) {
    TMessage.warning('分享链接还未生成')
    return
  }

  try {
    await navigator.clipboard.writeText(data.qr_url)
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
    URL.revokeObjectURL(url)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '下载分享卡失败')
  }
}

watch(
  () => [props.shareType, props.targetId, auth.token],
  () => {
    cardData.value = null
    if (previewOpen.value) {
      void loadCard()
    }
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
      <TIcon>
        <Share />
      </TIcon>
      <span>{{ props.label }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="previewOpen"
        class="share-card-generator__overlay"
        role="dialog"
        aria-modal="true"
        aria-label="分享卡片预览"
        @click.self="closePreview"
      >
        <section class="share-card-generator__dialog">
          <header class="share-card-generator__head">
            <h2>分享预览</h2>
            <div class="share-card-generator__actions">
              <button
                type="button"
                :disabled="loading"
                @click="loadCard"
                aria-label="重新生成分享卡"
              >
                <TIcon>
                  <Refresh />
                </TIcon>
              </button>
              <button type="button" @click="closePreview" aria-label="收起分享卡预览">
                <TIcon>
                  <Close />
                </TIcon>
              </button>
            </div>
          </header>
          <div v-if="loading && !cardData" class="share-card-generator__loading" role="status">
            分享卡生成中...
          </div>
          <canvas v-show="cardData" ref="canvasRef" class="share-card-generator__canvas" />
          <footer class="share-card-generator__footer">
            <button type="button" :disabled="!cardData" @click="copyLink" aria-label="复制分享链接">
              <TIcon>
                <Link />
              </TIcon>
              <span>链接</span>
            </button>
            <button type="button" :disabled="!cardData" @click="copyImage" aria-label="复制分享卡">
              <TIcon>
                <Document />
              </TIcon>
              <span>复制</span>
            </button>
            <button
              type="button"
              :disabled="!cardData"
              @click="downloadImage"
              aria-label="下载分享卡"
            >
              <TIcon>
                <Picture />
              </TIcon>
              <span>下载</span>
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./share-card-generator.css"></style>
