/**
 * 支付 Provider 抽象
 *
 * 目的：业务代码只依赖这个接口，真实渠道（微信 / 支付宝）通过配置切换。
 * 现在只有 mock 能跑通；接真实商户号时补 wechat 实现即可，业务层一行不改。
 *
 * 统一接口：
 *   createPayment(order)  → { channel, payParams }   // payParams 由前端渠道 SDK 消费
 *   verifyNotify(headers, rawBody) → { ok, orderNo, transactionId, amountCents }
 *   refund(order, amountCents, reason) → { ok, refundId }
 */
import crypto from 'node:crypto';

const CHANNEL = process.env.PAY_PROVIDER || 'mock';

// ───────── mock：本地把状态机跑通，不产生真实资金 ─────────
const mock = {
  name: 'mock',

  async createPayment(order) {
    return {
      channel: 'mock',
      payParams: {
        // 真实渠道这里返回 prepay_id / paySign 等，前端调 wx.chooseWXPay
        mockPayToken: crypto.randomBytes(8).toString('hex'),
        amountCents: order.amountCents,
        orderNo: order.orderNo,
        tip: '本地模拟支付：调用 /api/orders/:id/pay 即视为支付成功',
      },
    };
  },

  async verifyNotify(_headers, rawBody) {
    // mock 的回调就是内部调用，信任 body；真实渠道必须验签
    const b = typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody || {};
    if (!b.orderNo) return { ok: false, reason: 'missing orderNo' };
    return {
      ok: true,
      orderNo: b.orderNo,
      transactionId: 'MOCK' + Date.now(),
      amountCents: Number(b.amountCents) || 0,
    };
  },

  async refund(order, amountCents) {
    // 故障注入开关：验证「渠道退款失败时订单能回退」
    if (process.env.REFUND_FAIL_TEST === '1') {
      throw new Error('渠道退款失败（模拟）');
    }
    return { ok: true, refundId: 'MOCKREFUND' + Date.now(), amountCents };
  },
};

// ───────── wechat：接口留位，缺配置时明确失败 ─────────
const wechat = {
  name: 'wechat',

  _cfg() {
    const c = {
      mchid: process.env.WECHAT_MCHID,
      appid: process.env.WECHAT_APPID,
      serial: process.env.WECHAT_SERIAL,
      keyPath: process.env.WECHAT_KEY_PATH,
      notifyUrl: process.env.WECHAT_NOTIFY_URL,
    };
    const missing = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
    return { cfg: c, missing };
  },

  async createPayment(_order) {
    const { missing } = this._cfg();
    throw Object.assign(
      new Error(`微信支付未配置：缺 ${missing.join(', ')}`),
      { http: 503, code: 50300 },
    );
    // 实现步骤（接商户号后照此补全）：
    // 1. 组装 JSAPI/ Native 下单参数（appid, mchid, out_trade_no, amount, notify_url）
    // 2. 用商户私钥（WECHAT_KEY_PATH）做 SHA256-RSA 签名，调 /v3/pay/transactions/*
    // 3. 返回 prepay_id 与前端调起参数
  },

  async verifyNotify(headers) {
    const { missing } = this._cfg();
    if (missing.length) return { ok: false, reason: 'wechat 未配置' };
    // 真实校验：用微信平台证书验证 Wechatpay-Signature + 时间戳 + 随机串 + body
    const sig = headers['wechatpay-signature'];
    if (!sig) return { ok: false, reason: 'missing signature' };
    return { ok: false, reason: '微信回调验签尚未实现（缺证书）' };
  },

  async refund(_order, _amountCents) {
    const { missing } = this._cfg();
    throw Object.assign(
      new Error(`微信退款未配置：缺 ${missing.join(', ')}`),
      { http: 503, code: 50300 },
    );
  },
};

const IMPL = { mock, wechat };

export const payment = IMPL[CHANNEL] ?? mock;
export const paymentChannel = payment.name;
export default payment;
