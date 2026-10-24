/**
 * 头像裁剪的几何与出图：**纯函数，不碰响应式、不发请求**。
 *
 * 为什么单独成模块：裁剪的难点全在「舞台宽度 / 最小倍数 / 拖拽位移」三者互相钳制，
 * 这一层把每条口径固定成可单测的函数（`clampNumber` 一条边界、`rescaleAvatarCrop` 一个锚点缩放），
 * 而状态与事件留在 `useAvatarCrop` —— 那层已经贴着 300 行上限，不该被数学挤满。
 *
 * 坐标系固定：舞台是边长 `frameSize` 的正方形，图片左上角 = 舞台中心 + `offset`，
 * 宽高 = 原图尺寸 × `scale`（见 `avatarCropImageStyle`）；出图时再反解回原图坐标。
 */

export type AvatarCropOffset = {
  left: number
  top: number
}

/** 一次裁剪的几何快照：谁算都要这五项，缺一项就会和另一处的口径对不上。 */
export type AvatarCropGeometry = {
  frameSize: number
  imageWidth: number
  imageHeight: number
  scale: number
  offset: AvatarCropOffset
}

/** 原图里要取的那块正方形（`left` / `top` 相对原图左上角）。 */
export type AvatarCropRect = {
  left: number
  top: number
  size: number
}

/** 归零的几何（开窗与关窗共用）：还没选图，倍数按 1 算，位移在中心。 */
export function createAvatarCropGeometry(frameSize: number): AvatarCropGeometry {
  return { frameSize, imageWidth: 0, imageHeight: 0, scale: 1, offset: { left: 0, top: 0 } }
}

/** 把值夹在区间内：拖拽位移与缩放倍数共用这一条边界口径。 */
export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** 缩放读数：以「刚好铺满舞台」为 100%。 */
export function avatarCropZoomPercent(minScale: number, scale: number) {
  return Math.round((scale / Math.max(minScale, 0.001)) * 100)
}

/** 最小倍数：让图片最短边刚好铺满舞台（再小就会露出舞台底色）。 */
export function avatarCropMinScale(frameSize: number, imageWidth: number, imageHeight: number) {
  const shortestSide = Math.min(imageWidth, imageHeight)
  return shortestSide > 0 ? frameSize / shortestSide : 1
}

/** 图片按「舞台中心 + 拖拽位移」定位，宽高由缩放倍数乘原图尺寸算出来。 */
export function avatarCropImageStyle(geometry: AvatarCropGeometry) {
  const width = geometry.imageWidth * geometry.scale
  const height = geometry.imageHeight * geometry.scale
  const left = (geometry.frameSize - width) / 2 + geometry.offset.left
  const top = (geometry.frameSize - height) / 2 + geometry.offset.top

  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${left}px, ${top}px)`,
  }
}

/** 位移钳制：图片比舞台大多少，就允许往反方向拖多少；小于舞台则锁在 0。 */
export function clampAvatarCropOffset(geometry: AvatarCropGeometry): AvatarCropOffset {
  const horizontalLimit = Math.max(
    0,
    (geometry.imageWidth * geometry.scale - geometry.frameSize) / 2,
  )
  const verticalLimit = Math.max(
    0,
    (geometry.imageHeight * geometry.scale - geometry.frameSize) / 2,
  )

  return {
    left: clampNumber(geometry.offset.left, -horizontalLimit, horizontalLimit),
    top: clampNumber(geometry.offset.top, -verticalLimit, verticalLimit),
  }
}

/**
 * 以 `focus`（舞台内坐标，滚轮时是鼠标点）为锚点缩放：锚点下的那个像素保持不动。
 *
 * `changed` 为 false 表示倍数没变（钳制到底或只差个浮点尾巴），调用方不要覆盖状态——
 * 早先这里直接赋值，滚到上限后手指仍然拖着图片乱走。
 */
export function rescaleAvatarCrop(
  geometry: AvatarCropGeometry & {
    nextScale: number
    minScale: number
    maxScale: number
    focus?: AvatarCropOffset
  },
) {
  const clampedScale = clampNumber(geometry.nextScale, geometry.minScale, geometry.maxScale)
  if (Math.abs(clampedScale - geometry.scale) < 0.0001) {
    return { changed: false, scale: geometry.scale, offset: geometry.offset }
  }

  const size = geometry.frameSize
  const point = geometry.focus ?? { left: size / 2, top: size / 2 }
  const previousLeft = (size - geometry.imageWidth * geometry.scale) / 2 + geometry.offset.left
  const previousTop = (size - geometry.imageHeight * geometry.scale) / 2 + geometry.offset.top
  const sourceLeft = (point.left - previousLeft) / geometry.scale
  const sourceTop = (point.top - previousTop) / geometry.scale
  const nextWidth = geometry.imageWidth * clampedScale
  const nextHeight = geometry.imageHeight * clampedScale
  const offset = clampAvatarCropOffset({
    ...geometry,
    scale: clampedScale,
    offset: {
      left: point.left - sourceLeft * clampedScale - (size - nextWidth) / 2,
      top: point.top - sourceTop * clampedScale - (size - nextHeight) / 2,
    },
  })

  return { changed: true, scale: clampedScale, offset }
}

/** 反解回原图坐标：舞台里那块正方形对应原图的哪一块（边界外按图内裁，越界会画出空白）。 */
export function avatarCropSourceRect(geometry: AvatarCropGeometry): AvatarCropRect {
  const size = geometry.frameSize / geometry.scale
  const imageLeft =
    (geometry.frameSize - geometry.imageWidth * geometry.scale) / 2 + geometry.offset.left
  const imageTop =
    (geometry.frameSize - geometry.imageHeight * geometry.scale) / 2 + geometry.offset.top
  const maxLeft = Math.max(0, geometry.imageWidth - size)
  const maxTop = Math.max(0, geometry.imageHeight - size)

  return {
    left: clampNumber(-imageLeft / geometry.scale, 0, maxLeft),
    top: clampNumber(-imageTop / geometry.scale, 0, maxTop),
    size,
  }
}

/** 输出文件名：沿用原图主名，加上 `-cropped`，扩展名统一成 jpg。 */
export function avatarCropOutputName(file: File) {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'avatar'
  return `${baseName}-cropped.jpg`
}

/** 缩到 `size` 边长出 JPEG。白底是必须的：源图带透明通道时直接压 JPEG 会发黑。 */
export function drawAvatarCropCanvas(
  image: HTMLImageElement,
  rect: AvatarCropRect,
  size: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    return Promise.reject(new Error('无法生成裁剪图片'))
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    image,
    rect.left,
    rect.top,
    rect.size,
    rect.size,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('生成裁剪图片失败'))
      },
      'image/jpeg',
      0.9,
    )
  })
}
