/**
 * MD5（RFC 1321），输入按 UTF-8 编码，输出 32 位小写十六进制。
 *
 * 用途只有一个：后端 2.0 的登录 / 注册 / 重置密码 / 改密接口只接受
 * `md5(明文密码)` 的 32 位小写十六进制，明文一律 400。
 * 登录请求另带一个仅兼容 1.0 迁移账号的原始密码字段，服务端只对旧 bcrypt
 * 哈希使用；这一差异由 `requestBody.ts` 收口。
 * 契约里写成「password: md5(明文密码)」，已在 `LoginRequest` / `RegisterRequest` /
 * `ResetPasswordRequest` / `UpdatePasswordRequest` 的字段说明里。
 *
 * WebCrypto 没有 MD5，项目也不引第三方哈希库，所以这里自带一份最小实现；
 * 只做「密码摘要」这一件事，不要拿它做安全用途（它不是口令派生函数）。
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
)

/**
 * 按 UTF-8 编码成字节。
 *
 * 入参假定是**合法 UTF-16 字符串**（密码框不会产生孤立代理项）；对孤立代理项的行为未定义，
 * 与 TextEncoder 的 U+FFFD 替换不一致——那种输入本来就认证不过，不做特别处理。
 */
function utf8Bytes(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000)
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
    }
  }
  return out
}

const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0

export function md5Hex(input: string): string {
  const bytes = utf8Bytes(input)
  const bitLen = bytes.length * 8

  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)

  // 64 位小端长度（低 32 位 + 高 32 位）
  const lenLo = bitLen >>> 0
  const lenHi = Math.floor(bitLen / 2 ** 32) >>> 0
  for (let i = 0; i < 4; i += 1) bytes.push((lenLo >>> (8 * i)) & 0xff)
  for (let i = 0; i < 4; i += 1) bytes.push((lenHi >>> (8 * i)) & 0xff)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const m = new Array<number>(16)
    for (let i = 0; i < 16; i += 1) {
      const j = chunk + i * 4
      m[i] =
        (bytes[j]! | (bytes[j + 1]! << 8) | (bytes[j + 2]! << 16) | (bytes[j + 3]! << 24)) >>> 0
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i += 1) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const tmp = d
      d = c
      c = b
      const sum = (a + (f >>> 0) + K[i]! + m[g]!) >>> 0
      b = (b + rotl(sum, S[i]!)) >>> 0
      a = tmp
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const toHex = (n: number) => {
    let s = ''
    for (let i = 0; i < 4; i += 1) s += ((n >>> (8 * i)) & 0xff).toString(16).padStart(2, '0')
    return s
  }
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0)
}
