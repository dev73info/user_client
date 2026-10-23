import { describe, expect, it } from 'vitest'

import { md5Hex } from '@/shared/auth/md5'

/**
 * 标准测试向量来自 RFC 1321 附录 A.5，另外补两条本仓会遇到的实际输入：
 * 统一口令与含中文的密码（验证 UTF-8 编码分支）。
 */
describe('md5Hex', () => {
  it('RFC 1321 标准向量', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5Hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    expect(md5Hex('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b')
    expect(
      md5Hex('12345678901234567890123456789012345678901234567890123456789012345678901234567890'),
    ).toBe('57edf4a22be3c955ac49da2e2107b67a')
  })

  it('本仓实际输入：统一开发口令', () => {
    expect(md5Hex('Test@123456')).toBe('aff8c7c4f8d9fab3bb7322ea79cc5170')
  })

  it('含中文的密码按 UTF-8 取摘要', () => {
    expect(md5Hex('密码Test@123456')).toBe('4f12124de759ba8b44bd8140e2907ed9')
  })

  it('超过一个分组的输入（长度补位分支）', () => {
    expect(md5Hex('a'.repeat(1000))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8')
  })
})
