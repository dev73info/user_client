import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
// 站点口径必须与 canonical / sitemap 一致：sitemap 里全是 `https://73info.cn/...`，
// 推送站点写成 www 会被百度判成 not_same_site，白推一遍。
const productionEnv = {
  ...readEnvFile(resolve(projectRoot, '.env.production')),
  ...readEnvFile(resolve(projectRoot, '.env.local')),
}

const siteUrl = normalizeBaseUrl(
  process.env.BAIDU_PUSH_SITE || productionEnv.BAIDU_PUSH_SITE || 'https://73info.cn',
)
const token = String(process.env.BAIDU_PUSH_TOKEN || productionEnv.BAIDU_PUSH_TOKEN || '').trim()
const endpoint = process.env.BAIDU_PUSH_ENDPOINT || 'http://data.zz.baidu.com/urls'
const sitemapPath = resolve(projectRoot, process.env.BAIDU_PUSH_SITEMAP_PATH || 'dist/sitemap.xml')
const fallbackSitemapPath = resolve(projectRoot, 'public/sitemap.xml')
const dryRun = process.env.BAIDU_PUSH_DRY_RUN === '1'
const batchSize = positiveInteger(process.env.BAIDU_PUSH_BATCH_SIZE, 2000)
const urlOffset = nonNegativeInteger(process.env.BAIDU_PUSH_OFFSET, 0)
const urlLimit = nonNegativeInteger(process.env.BAIDU_PUSH_LIMIT, 0)

async function main() {
  if (!dryRun && !token) {
    throw new Error(
      '[baidu] missing BAIDU_PUSH_TOKEN（在 .env.local 里放一行 BAIDU_PUSH_TOKEN=… 即可，该文件不入库）',
    )
  }

  const sitemapXml = readExistingFile(sitemapPath) || readExistingFile(fallbackSitemapPath)
  const allUrls = dedupeUrls(sitemapXml ? parseSitemapUrls(sitemapXml).map(toBaiduSiteUrl) : [`${siteUrl}/`])
  const urlList = urlLimit > 0 ? allUrls.slice(urlOffset, urlOffset + urlLimit) : allUrls.slice(urlOffset)

  if (urlList.length === 0) {
    throw new Error('[baidu] no urls found in sitemap')
  }

  warnOnSitemapHostMismatch(sitemapXml)

  if (dryRun) {
    console.log(`[baidu] dry run: would submit ${urlList.length} urls for ${siteUrl}`)
    for (const url of urlList) {
      console.log(url)
    }
    return
  }

  let submitted = 0
  let remain = null
  const notSameSite = []
  const notValid = []

  for (let index = 0; index < urlList.length; index += batchSize) {
    const batch = urlList.slice(index, index + batchSize)
    const result = await submitBatch(batch)
    submitted += Number(result.success || 0)
    remain = result.remain ?? remain
    notSameSite.push(...(Array.isArray(result.not_same_site) ? result.not_same_site : []))
    notValid.push(...(Array.isArray(result.not_valid) ? result.not_valid : []))
  }

  console.log(`[baidu] submitted ${submitted}/${urlList.length} urls for ${siteUrl}${remain === null ? '' : `, remain ${remain}`}`)

  if (notSameSite.length > 0) {
    console.warn(`[baidu] not_same_site: ${notSameSite.join(', ')}`)
  }
  if (notValid.length > 0) {
    console.warn(`[baidu] not_valid: ${notValid.join(', ')}`)
  }
}

async function submitBatch(urls) {
  const response = await fetch(buildSubmitUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `${urls.join('\n')}\n`,
  })

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`[baidu] invalid response: HTTP ${response.status} ${text}`)
  }

  if (!response.ok || data.error) {
    throw new Error(`[baidu] submit failed: HTTP ${response.status} ${data.message || data.error || text}`)
  }

  return data
}

function buildSubmitUrl() {
  const separator = endpoint.includes('?') ? '&' : '?'
  return `${endpoint}${separator}site=${siteUrl}&token=${encodeURIComponent(token)}`
}

// sitemap 里的域名和推送站点对不上时明确告警：百度按「已验证站点」校验，
// 域名不一致会整批返回 not_same_site（这次的坑就是 sitemap 用裸域、脚本默认 www）。
function warnOnSitemapHostMismatch(sitemapXml) {
  if (!sitemapXml) {
    return
  }

  const siteHost = new URL(siteUrl).host
  const hosts = new Set(
    parseSitemapUrls(sitemapXml)
      .map((url) => {
        try {
          return new URL(url).host
        } catch {
          return ''
        }
      })
      .filter(Boolean),
  )
  const mismatched = [...hosts].filter((host) => host !== siteHost)

  if (mismatched.length > 0) {
    console.warn(
      `[baidu] sitemap 里的域名（${mismatched.join(', ')}）与推送站点 ${siteUrl} 不一致，百度会判 not_same_site`,
    )
  }
}

function parseSitemapUrls(xml) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => decodeXml(match[1]))
    .map((url) => url.trim())
    .filter(Boolean)
}

function toBaiduSiteUrl(value) {
  try {
    const url = new URL(value)
    return new URL(`${url.pathname}${url.search}`, `${siteUrl}/`).toString()
  } catch {
    return ''
  }
}

function dedupeUrls(urls) {
  const seen = new Set()
  return urls.filter((url) => {
    if (!url || seen.has(url)) {
      return false
    }
    seen.add(url)
    return true
  })
}

function readExistingFile(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=')
          const key = line.slice(0, index).trim()
          const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '')
          return [key, value]
        }),
    )
  } catch {
    return {}
  }
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})