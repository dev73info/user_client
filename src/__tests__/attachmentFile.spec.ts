import { describe, expect, it } from 'vitest'

import {
  MAX_ATTACHMENT_BYTES,
  defaultAttachmentName,
  formatBytes,
  isImageAttachment,
  mimeTypeFromName,
} from '@/shared/attachmentFile'

describe('附件 MIME 猜测', () => {
  it('按扩展名认出四种图片，大小写不敏感', () => {
    expect(mimeTypeFromName('a.png')).toBe('image/png')
    expect(mimeTypeFromName('a.JPG')).toBe('image/jpeg')
    expect(mimeTypeFromName('a.jpeg')).toBe('image/jpeg')
    expect(mimeTypeFromName('a.webp')).toBe('image/webp')
    expect(mimeTypeFromName('a.gif')).toBe('image/gif')
    expect(mimeTypeFromName('截图 2026-10-21.PNG')).toBe('image/png')
  })

  it('认不出的扩展名返回空串（调用方据此给「仅支持图片」）', () => {
    expect(mimeTypeFromName('a.pdf')).toBe('')
    expect(mimeTypeFromName('a.png.exe')).toBe('')
    expect(mimeTypeFromName('')).toBe('')
    expect(mimeTypeFromName('noversion')).toBe('')
  })
})

describe('附件命名兜底', () => {
  it('按 MIME 给出可读文件名', () => {
    expect(defaultAttachmentName('image/jpeg')).toBe('screenshot.jpg')
    expect(defaultAttachmentName('image/webp')).toBe('screenshot.webp')
    expect(defaultAttachmentName('image/gif')).toBe('screenshot.gif')
    // 其它一律按 png：截图工具粘贴进来的位图最常见的就是它
    expect(defaultAttachmentName('image/png')).toBe('screenshot.png')
    expect(defaultAttachmentName('')).toBe('screenshot.png')
  })
})

describe('字节格式化', () => {
  it('0、负数、空值都给 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(undefined)).toBe('0 B')
  })

  it('B 档不带小数，KB 档按 10 分界', () => {
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB')
  })

  it('MB / GB 档进位正确，GB 是最后一档', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(8 * 1024 * 1024)).toBe('8.0 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatBytes(1024 ** 4)).toBe('1024 GB')
  })
})

describe('附件大小上限', () => {
  it('正好 8MB 算合格，超一字节不合格', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(8 * 1024 * 1024)
    expect(MAX_ATTACHMENT_BYTES - 1 > MAX_ATTACHMENT_BYTES).toBe(false)
    expect(MAX_ATTACHMENT_BYTES + 1 > MAX_ATTACHMENT_BYTES).toBe(true)
  })
})

describe('历史消息里的附件是不是图片', () => {
  it('先看后端记的 MIME', () => {
    expect(isImageAttachment({ attachment_mime: 'image/png' })).toBe(true)
    expect(
      isImageAttachment({ attachment_mime: 'application/pdf', attachment_url: '/a.pdf' }),
    ).toBe(false)
  })

  it('没有 MIME 时按 URL 后缀兜底', () => {
    expect(isImageAttachment({ attachment_url: '/files/a.PNG' })).toBe(true)
    expect(isImageAttachment({ attachment_url: '/files/a.jpeg' })).toBe(true)
    expect(isImageAttachment({ attachment_url: '/files/a.webp' })).toBe(true)
    expect(isImageAttachment({ attachment_url: '/files/a.gif' })).toBe(true)
    expect(isImageAttachment({ attachment_url: '/files/a.pdf' })).toBe(false)
  })

  it('两者都没有就是不是图片', () => {
    expect(isImageAttachment({})).toBe(false)
    expect(isImageAttachment({ attachment_mime: null, attachment_url: null })).toBe(false)
  })
})
