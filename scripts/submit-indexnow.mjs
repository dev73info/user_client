import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const productionEnv = readEnvFile(resolve(projectRoot, '.env.production'))

const siteUrl = normalizeBaseUrl(
  process.env.INDEXNOW_SITE_URL || process.env.SITEMAP_SITE_URL || process.env.VITE_SITE_URL || 'https://73info.cn',
)
const indexNowKey = String(process.env.INDEXNOW_KEY || productionEnv.INDEXNOW_KEY || 'cd0094f00a6448a18e37caa8f756ca72').trim()
const endpoint = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow'
const sitemapPath = resolve(
  projectRoot,
  process.env.INDEXNOW_SITEMAP_PATH || 'dist/sitemap.xml',
)
const fallbackSitemapPath = resolve(projectRoot, 'public/sitemap.xml')
const dryRun = process.env.INDEXNOW_DRY_RUN === '1'

async function main() {
  const host = new URL(siteUrl).host
  const keyLocation = new URL(`/${indexNowKey}.txt`, siteUrl).toString()
  const sitemapXml = readExistingFile(sitemapPath) || readExistingFile(fallbackSitemapPath)
  const urlList = sitemapXml ? parseSitemapUrls(sitemapXml) : [siteUrl]

  if (urlList.length === 0) {
    throw new Error('[indexnow] no urls found in sitemap')
  }

  const body = {
    host,
    key: indexNowKey,
    keyLocation,
    urlList,
  }

  if (dryRun) {
    console.log(`[indexnow] dry run: would submit ${urlList.length} urls to ${endpoint}`)
    console.log(JSON.stringify(body, null, 2))
    return
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`[indexnow] submit failed: HTTP ${response.status}${text ? ` ${text}` : ''}`)
  }

  console.log(`[indexnow] submitted ${urlList.length} urls for ${host}: HTTP ${response.status}`)
}

function parseSitemapUrls(xml) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => decodeXml(match[1]))
    .map((url) => url.trim())
    .filter((url) => url.startsWith(`${siteUrl}/`) || url === siteUrl)
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