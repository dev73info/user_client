// 「验收标准」快捷模板：选中后在发布弹窗的验收标准编辑器中填入结构化骨架，
// 用户按括号内的提示补齐具体内容即可，避免漏写关键验收项。
// 模板 HTML 只使用富文本编辑器允许的标签（p / strong / ul / li），
// 保证经过 sanitizeRichHtml 后内容不会被剥掉。

export type AcceptanceTemplateId = "phased" | "functional";

export type AcceptanceTemplate = {
  id: AcceptanceTemplateId;
  name: string;
  description: string;
  html: string;
};

export const acceptanceTemplates: AcceptanceTemplate[] = [
  {
    id: "phased",
    name: "阶段性模板",
    description: "分阶段交付，逐阶段验收",
    html: [
      "<p><strong>验收方式：</strong>按阶段交付、逐阶段验收，每阶段验收通过后再进入下一阶段。</p>",
      "<p><strong>阶段一 ·（填写阶段名称，如：需求梳理与原型）</strong></p>",
      "<ul>",
      "<li>交付物：（如：原型图、页面清单）</li>",
      "<li>验收要点：（如：页面覆盖完整，交互可演示）</li>",
      "<li>阶段款：（如：总价的 30%）</li>",
      "</ul>",
      "<p><strong>阶段二 ·（填写阶段名称，如：开发与联调）</strong></p>",
      "<ul>",
      "<li>交付物：（如：可运行的功能版本、测试记录）</li>",
      "<li>验收要点：（如：约定功能均可正常使用，无阻塞性缺陷）</li>",
      "<li>阶段款：（如：总价的 40%）</li>",
      "</ul>",
      "<p><strong>阶段三 ·（填写阶段名称，如：上线与收尾）</strong></p>",
      "<ul>",
      "<li>交付物：（如：源代码、部署文档、使用说明）</li>",
      "<li>验收要点：（如：在约定环境部署成功，文档齐全）</li>",
      "<li>阶段款：（如：总价的 30%）</li>",
      "</ul>",
      "<p><strong>补充：</strong>每阶段交付后 3 个工作日内反馈验收意见，逾期未提出异议视为该阶段通过。</p>",
    ].join(""),
  },
  {
    id: "functional",
    name: "功能性模板",
    description: "按功能清单逐项验收",
    html: [
      "<p><strong>验收方式：</strong>按功能清单逐项验收，全部通过即视为验收完成。</p>",
      "<p><strong>一、功能验收</strong></p>",
      "<ul>",
      "<li>（功能点 1）：（填写预期表现，如：可正常登录并跳转首页）</li>",
      "<li>（功能点 2）：（填写预期表现）</li>",
      "<li>（功能点 3）：（填写预期表现）</li>",
      "</ul>",
      "<p><strong>二、质量验收</strong></p>",
      "<ul>",
      "<li>兼容性：（如：Chrome / Edge 最新版、常见手机机型）</li>",
      "<li>性能：（如：主要页面加载不超过 3 秒，操作无明显卡顿）</li>",
      "<li>稳定性：（如：连续运行 24 小时无崩溃、无数据错误）</li>",
      "</ul>",
      "<p><strong>三、交付物验收</strong></p>",
      "<ul>",
      "<li>源代码（含必要注释）、部署文档、使用说明齐全，可在约定环境运行。</li>",
      "</ul>",
      "<p><strong>补充：</strong>验收不通过时，由开发者限期整改后重新验收。</p>",
    ].join(""),
  },
];
