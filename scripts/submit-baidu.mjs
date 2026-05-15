import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const productionEnv = readEnvFile(resolve(projectRoot, '.env.production'))

const siteUrl = normalizeBaseUrl(
  process.env.BAIDU_PUSH_SITE || productionEnv.BAIDU_PUSH_SITE || 'https://www.73info.cn',
)
const token = String(process.env.BAIDU_PUSH_TOKEN || productionEnv.BAIDU_PUSH_TOKEN || '').trim()
const endpoint = process.env.BAIDU_PUSH_ENDPOINT || 'http://data.zz.baidu.com/urls'
const sitemapPath = resolve(projectRoot, process.env.BAIDU_PUSH_SITEMAP_PATH || 'dist/sitemap.xml')
const fallbackSitemapPath = resolve(projectRoot, 'public/sitemap.xml')
const dryRun = process.env.BAIDU_PUSH_DRY_RUN === '1'
const batchSize = positiveInteger(process.env.BAIDU_PUSH_BATCH_SIZE, 2000)

async function main() {
  if (!dryRun && !token) {
    throw new Error('[baidu] missing BAIDU_PUSH_TOKEN')
  }

  const sitemapXml = readExistingFile(sitemapPath) || readExistingFile(fallbackSitemapPath)
  const urlList = dedupeUrls(sitemapXml ? parseSitemapUrls(sitemapXml).map(toBaiduSiteUrl) : [`${siteUrl}/`])

  if (urlList.length === 0) {
    throw new Error('[baidu] no urls found in sitemap')
  }

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
  const url = new URL(endpoint)
  url.searchParams.set('site', siteUrl)
  url.searchParams.set('token', token)

  const response = await fetch(url, {
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
          const value = line.slice(index + 1).trim().replace(/^[\"']|[\"']$/g, '')
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