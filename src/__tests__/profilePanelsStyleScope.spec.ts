import { readFileSync } from 'node:fs'
import { compileStyle } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

/**
 * 个人中心总览抽出四个面板后，两处「规则跟着谁走」的验证——都用 `@vue/compiler-sfc` 的
 * `compileStyle({ scoped: true })` 编译真实产物来看选择器：
 * scoped 的 data-v 属性是编译期加在**最后一段选择器**上的，规则写在哪一层，
 * 决定它还匹配不匹配得到元素。写错不会报错，只会静默丢样式。
 *
 * 渲染侧的回归网在 `profileView.spec.ts`。
 */
describe('个人中心总览：样式的 scoped 归属（编译产物验证）', () => {
  const viewSource = readFileSync('src/views/ProfileView.vue', 'utf8')

  function scopedCss(file: string) {
    const source = readFileSync(`src/components/profile/${file}`, 'utf8')
    const style = /<style[^>]*scoped[^>]*>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? ''
    return compileStyle({ source: style, filename: file, id: 'data-v-test', scoped: true }).code
  }

  it('读数条「去下划线 + hover 主色」两条随 OverviewStrip 走，视图里不再留', () => {
    const css = scopedCss('OverviewStrip.vue')
    // 0,3,0 的选择器才压得过统一层的 .wb-strip__item（0,1,0）
    expect(css).toContain('.overview-strip a.wb-strip__item[data-v-test]')
    expect(css).toContain('.overview-strip a.wb-strip__item:hover .wb-strip__value[data-v-test]')
    expect(viewSource).not.toContain('overview-strip')
  })

  it('进度条 :deep(.req-progress*) 整段随需求进度面板走（桌面那条 + @640 那条都在）', () => {
    const css = scopedCss('RequirementProgressPanel.vue')
    // 桌面那条：抽组件时最容易漏的一条
    expect(css).toMatch(
      /\.overview-requirement-progress\[data-v-test\] \.req-progress \{\s*padding: 16px 18px 14px;/,
    )
    // @640 那条：整块盖掉进度条的长相（R047 断点收敛：原档位 760px → 640px）
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.overview-requirement-progress\[data-v-test\] \.req-progress \{\s*padding: 12px 6px 10px;/,
    )
    // 六个步骤子元素的选择器也都要编译成后代形式
    for (const part of [
      '__steps',
      '__step',
      '__dot',
      '__step-title',
      '__step-desc',
      '__connector',
    ]) {
      expect(css).toContain(`.overview-requirement-progress[data-v-test] .req-progress${part}`)
    }
    // 视图那边一条都不该剩：留着也不会匹配（元素上只有面板的 data-v）
    expect(viewSource).not.toContain('req-progress')
  })
})
