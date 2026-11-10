import { describe, expect, it } from 'vitest'

import { resourceIconMime } from '@/shared/resourceIcon'

describe('资源图标格式白名单', () => {
  it('接受 PNG / JPEG / WebP / GIF', () => {
    expect(resourceIconMime({ type: 'image/png', name: 'icon.png' })).toBe('image/png')
    expect(resourceIconMime({ type: 'image/jpeg', name: 'icon.jpg' })).toBe('image/jpeg')
    expect(resourceIconMime({ type: 'image/webp', name: 'icon.webp' })).toBe('image/webp')
    expect(resourceIconMime({ type: 'image/gif', name: 'icon.gif' })).toBe('image/gif')
  })

  it('拒绝 SVG 等白名单外的格式', () => {
    expect(resourceIconMime({ type: 'image/svg+xml', name: 'icon.svg' })).toBe('')
    expect(resourceIconMime({ type: 'image/avif', name: 'icon.avif' })).toBe('')
    expect(resourceIconMime({ type: 'application/pdf', name: 'icon.pdf' })).toBe('')
    expect(resourceIconMime({ type: '', name: 'icon.bmp' })).toBe('')
  })

  it('浏览器没给 MIME 时按扩展名兜底', () => {
    expect(resourceIconMime({ type: '', name: 'icon.PNG' })).toBe('image/png')
    expect(resourceIconMime({ type: '', name: 'icon.jpeg' })).toBe('image/jpeg')
    expect(resourceIconMime({ type: 'application/octet-stream', name: 'icon.webp' })).toBe(
      'image/webp',
    )
  })

  it('非标准的 image/jpg 归一到 image/jpeg', () => {
    expect(resourceIconMime({ type: 'image/jpg', name: 'icon.jpg' })).toBe('image/jpeg')
  })
})
