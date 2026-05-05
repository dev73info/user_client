<template>
  <main class="agreement-page">
    <section class="agreement-card">
      <header class="agreement-head">
        <h1>开发者入驻协议</h1>
        <p>适用于在 73Info 平台申请入驻、接单、交付与结算的开发者。</p>
      </header>

      <article class="agreement-body">
        <h3>1. 协议主体</h3>
        <p>本协议由柒叁信息 73Info 平台（以下简称“平台”）与入驻开发者（以下简称“开发者”）共同订立。开发者注册、登录、接单或使用开发者服务即视为同意本协议。</p>

        <h3>2. 入驻资格与信息承诺</h3>
        <p>开发者应具备与承接需求相匹配的技术能力与履约能力，并确保提交资料真实、准确、完整。平台有权根据风控与合规要求进行审核与复核。</p>

        <h3>3. 接单与履约义务</h3>
        <p>开发者应基于真实能力接单，按约定里程碑交付成果，及时沟通项目进展。未经授权，不得擅自转包、弃单或泄露项目资料与用户信息。</p>

        <h3>4. 结算与保证机制</h3>
        <p>开发者同意平台依据订单状态、验收结果和争议处理规则进行收益结算。平台可根据已公示规则执行保证金冻结、释放或扣减等风控措施。</p>

        <h3>5. 知识产权与合规责任</h3>
        <p>开发者应保证交付成果不侵犯第三方知识产权，不得植入恶意代码或违法内容。因开发者原因导致纠纷或损失的，由开发者依法承担责任。</p>

        <h3>6. 禁止行为</h3>
        <p>开发者不得进行虚假宣传、刷单刷评、诱导线下交易、恶意引流、骚扰用户等行为。平台有权对违规行为进行限制接单、冻结账号或终止合作。</p>

        <h3>7. 违约与处置</h3>
        <p>如开发者存在拒不履约、失联、严重延期、恶意投诉反制等行为，平台可按规则采取风控处置，并保留追究法律责任的权利。</p>

        <h3>8. 协议更新</h3>
        <p>平台可根据业务和监管要求更新本协议。更新内容通过页面公告或站内通知生效，开发者继续使用平台服务即视为接受更新。</p>

        <h3>9. 争议解决</h3>
        <p>本协议适用中华人民共和国法律。双方争议应先协商处理；协商不成的，提交平台所在地有管辖权人民法院处理。</p>
      </article>
    </section>
  </main>
</template>

<style scoped>
.agreement-page {
  min-height: 100vh;
  padding: 32px 16px;
  background: linear-gradient(180deg, #f4f7fb 0%, #f7fbff 100%);
}

.agreement-card {
  max-width: 900px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  padding: 28px;
}

.agreement-head h1 {
  margin: 0;
  font-size: 28px;
  color: #1f2937;
}

.agreement-head p {
  margin: 10px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.agreement-body {
  margin-top: 22px;
  line-height: 1.9;
  color: #374151;
}

.agreement-body h3 {
  margin: 18px 0 8px;
  color: #111827;
  font-size: 18px;
}

.agreement-body p {
  margin: 0;
}
</style>
