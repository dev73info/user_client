<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { Close, Document, Link, Picture, Refresh, Share } from '@element-plus/icons-vue'

import { generateShareCard, type GenerateShareCardPayload, type ShareCardData } from '@/api/invite'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

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
const { showToast } = useToast()
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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
        showToast('请先登录后生成分享卡', 'warning')
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
        showToast(error instanceof Error ? error.message : '生成分享卡失败', 'error')
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
        showToast('分享卡已复制', 'success')
    } catch (error) {
        showToast(error instanceof Error ? error.message : '复制分享卡失败', 'error')
    }
}

async function copyLink() {
    const data = cardData.value
    if (!data) {
        showToast('分享链接还未生成', 'warning')
        return
    }

    try {
        await navigator.clipboard.writeText(data.qr_url)
        showToast('分享链接已复制', 'success')
    } catch (error) {
        showToast(error instanceof Error ? error.message : '复制分享链接失败', 'error')
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
        showToast(error instanceof Error ? error.message : '下载分享卡失败', 'error')
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
        <button class="share-card-generator__start" type="button" :disabled="loading" :aria-busy="loading"
            @click="loadCard">
            <el-icon>
                <Share />
            </el-icon>
            <span>{{ props.label }}</span>
        </button>

        <Teleport to="body">
            <div v-if="previewOpen" class="share-card-generator__overlay" role="dialog" aria-modal="true"
                aria-label="分享卡片预览" @click.self="closePreview">
                <section class="share-card-generator__dialog">
                    <header class="share-card-generator__head">
                        <h2>分享预览</h2>
                        <div class="share-card-generator__actions">
                            <button type="button" :disabled="loading" @click="loadCard" aria-label="重新生成分享卡">
                                <el-icon>
                                    <Refresh />
                                </el-icon>
                            </button>
                            <button type="button" @click="closePreview" aria-label="收起分享卡预览">
                                <el-icon>
                                    <Close />
                                </el-icon>
                            </button>
                        </div>
                    </header>
                    <div v-if="loading && !cardData" class="share-card-generator__loading" role="status">
                        分享卡生成中...
                    </div>
                    <canvas v-show="cardData" ref="canvasRef" class="share-card-generator__canvas" />
                    <footer class="share-card-generator__footer">
                        <button type="button" :disabled="!cardData" @click="copyLink" aria-label="复制分享链接">
                            <el-icon>
                                <Link />
                            </el-icon>
                            <span>链接</span>
                        </button>
                        <button type="button" :disabled="!cardData" @click="copyImage" aria-label="复制分享卡">
                            <el-icon>
                                <Document />
                            </el-icon>
                            <span>复制</span>
                        </button>
                        <button type="button" :disabled="!cardData" @click="downloadImage" aria-label="下载分享卡">
                            <el-icon>
                                <Picture />
                            </el-icon>
                            <span>下载</span>
                        </button>
                    </footer>
                </section>
            </div>
        </Teleport>
    </section>
</template>

<style scoped>
.share-card-generator {
    display: inline-flex;
    align-items: center;
}

.share-card-generator__start {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 14px;
    border: 1px solid rgba(37, 99, 235, 0.28);
    border-radius: 999px;
    background: #fff;
    color: #1d4ed8;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
    transition:
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease,
        opacity 160ms ease;
}

.share-card-generator__start:hover:not(:disabled) {
    border-color: rgba(37, 99, 235, 0.5);
    background: rgba(239, 246, 255, 0.96);
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.14);
    transform: translateY(-1px);
}

.share-card-generator__start:disabled {
    cursor: not-allowed;
    opacity: 0.58;
    transform: none;
}

.share-card-generator__overlay {
    position: fixed;
    z-index: 3000;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.44);
}

.share-card-generator__dialog {
    position: relative;
    display: grid;
    width: min(360px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    gap: 10px;
    overflow: hidden;
    padding: 14px;
    border: 1px solid rgba(219, 234, 254, 0.92);
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.share-card-generator__head,
.share-card-generator__actions,
.share-card-generator__footer {
    display: flex;
    align-items: center;
    gap: 10px;
}

.share-card-generator__head {
    justify-content: space-between;
}

.share-card-generator__head h2 {
    margin: 0;
    color: #0f172a;
    font-size: 20px;
}

.share-card-generator__actions button {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: #eff6ff;
    color: #2563eb;
    cursor: pointer;
}

.share-card-generator__footer {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    gap: 8px;
    margin: 0;
    padding: 2px 0 0;
    background: transparent;
}

.share-card-generator__footer button {
    display: inline-flex;
    min-width: 0;
    height: 34px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid rgba(191, 219, 254, 0.95);
    border-radius: 999px;
    background: #eff6ff;
    color: #2563eb;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition:
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;
}

.share-card-generator__footer button:hover:not(:disabled) {
    border-color: rgba(37, 99, 235, 0.36);
    background: #fff;
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.12);
    transform: translateY(-1px);
}

.share-card-generator__actions button:disabled,
.share-card-generator__footer button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
}

.share-card-generator__loading {
    display: grid;
    min-height: 120px;
    place-items: center;
    border: 1px dashed rgba(191, 219, 254, 0.96);
    border-radius: 8px;
    background: rgba(248, 250, 252, 0.72);
    color: #64748b;
    font-size: 14px;
    font-weight: 700;
}

.share-card-generator__canvas {
    width: min(100%, 292px, 40vh);
    justify-self: center;
    border: 1px solid rgba(226, 232, 240, 0.96);
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08);
}

@media (max-width: 640px) {
    .share-card-generator__start {
        width: 100%;
    }

    .share-card-generator__overlay {
        padding: 10px;
    }

    .share-card-generator__dialog {
        width: calc(100vw - 20px);
        max-height: calc(100dvh - 20px);
        gap: 8px;
        padding: 12px;
    }

    .share-card-generator__head h2 {
        font-size: 18px;
    }

    .share-card-generator__canvas {
        width: min(100%, 280px, 38vh);
    }

    .share-card-generator__footer button {
        padding: 0 8px;
    }
}
</style>