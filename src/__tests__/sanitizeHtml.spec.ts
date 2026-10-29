import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  renderMarkdownToRichHtml,
  sanitizeRichHtml,
  sanitizeRichHtmlForEditing,
} from '@/utils/sanitizeHtml'

const attacks = [
  '<script>alert(1)</script><p>正文</p>',
  '<img src="/missing.png" onerror="alert(1)">',
  '<svg><a xlink:href="javascript:alert(1)">链接</a></svg>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
  '<a href="java&#x09;script:alert(1)" target="_blank">链接</a>',
  '<a href="data:text/html,<script>alert(1)</script>">链接</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe><object data="/uploads/payload.html"></object>',
  '<form action="https://attacker.invalid"><input name="secret"></form>',
  '<p style="position:fixed;inset:0;background:url(javascript:alert(1))">正文</p>',
  '<img src="data:image/svg+xml,<svg onload=alert(1) />">',
  '<pre><code class="language-md">&lt;img src=x onerror=alert(1)&gt;\n[link](javascript:alert(1))</code></pre>',
]

function legacyHex(value: string, repeatedPrefix = false): string {
  const encoded = Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  if (repeatedPrefix) {
    return encoded
      .match(/.{2}/g)!
      .map((byte) => `\\x${byte}`)
      .join('')
  }
  return `\\x${encoded}`
}

function assertNoExecutableContent(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  expect(
    template.content.querySelector('script,svg,math,iframe,object,embed,form,input,style'),
  ).toBeNull()
  for (const element of template.content.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      expect(attribute.name).not.toMatch(/^on|^srcdoc$|^style$/i)
      if (['href', 'src', 'poster'].includes(attribute.name)) {
        expect(attribute.value.replace(/[\u0000-\u0020]/g, '')).not.toMatch(
          /^(javascript|vbscript|data):/i,
        )
      }
    }
  }
}

describe('rich HTML XSS defenses', () => {
  it.each(attacks)('removes executable markup: %s', (payload) => {
    assertNoExecutableContent(sanitizeRichHtml(payload))
    assertNoExecutableContent(sanitizeRichHtmlForEditing(payload))
    assertNoExecutableContent(renderMarkdownToRichHtml(payload))
  })

  it('preserves normal content, tables, code and secure external links', () => {
    const html = sanitizeRichHtml(
      '<h2>标题</h2><table><tbody><tr><td>单元格</td></tr></tbody></table><pre><code>const safe = 1</code></pre><img src="/uploads/safe.png"><a href="https://example.com" target="_blank">链接</a>',
    )
    const template = document.createElement('template')
    template.innerHTML = html
    expect(template.content.querySelector('h2')?.textContent).toBe('标题')
    expect(template.content.querySelector('td')?.textContent).toBe('单元格')
    expect(template.content.querySelector('code')?.textContent).toContain('const safe')
    expect(template.content.querySelector('img')?.getAttribute('src')).toBe('/uploads/safe.png')
    expect(template.content.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('decodes legacy UTF-8 byte escapes before rendering', () => {
    for (const legacy of [legacyHex('<p>迁移正文</p>'), legacyHex('<p>迁移正文</p>', true)]) {
      const html = sanitizeRichHtml(legacy)
      const template = document.createElement('template')
      template.innerHTML = html

      expect(template.content.querySelector('p')?.textContent).toBe('迁移正文')
      expect(template.content.textContent).not.toContain('\\x3c')
    }
  })

  it('still sanitizes executable markup restored from legacy escapes', () => {
    const html = sanitizeRichHtml(
      legacyHex('<script>alert(1)</script><img src="x" onerror="alert(1)"><p>安全正文</p>'),
    )
    assertNoExecutableContent(html)
    expect(html).toContain('安全正文')
  })

  it('leaves ordinary text containing a literal escape example unchanged', () => {
    expect(sanitizeRichHtml('<p>示例：\\x3c703e 不是正文</p>')).toContain('\\x3c703e')
  })

  it('keeps script and form restrictions in frontend deployment policies', () => {
    for (const file of [
      'index.html',
      'public/.htaccess',
      'deploy/openresty/73info-user-client.conf',
    ]) {
      const content = readFileSync(file, 'utf8')
      expect(content).toContain(
        "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com;",
      )
      expect(content).toContain("form-action 'self';")
      expect(content).not.toMatch(/script-src[^;]*'unsafe-inline'/)
      expect(content).not.toMatch(/script-src[^;]*'unsafe-eval'/)
    }
  })
})
