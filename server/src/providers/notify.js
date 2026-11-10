/**
 * 通知 Provider 抽象
 *
 * 业务层只调 notify.send({ to, template, data })，具体渠道由 NOTIFY_PROVIDER 决定。
 * 现在只有 console：写结构化日志，方便本地验证"该发的时候有没有发"。
 * 接真实短信 / 企微 / 微信模板消息时补实现即可。
 *
 * 已登记的模板（与业务一一对应）：
 *   booking_submitted   预约已提交，等待审核
 *   booking_approved    预约通过
 *   booking_rejected    预约被驳回（带原因）
 *   ticket_paid         购票成功（带票数与金额）
 *   ticket_refunded     退票成功（带退款金额）
 *   session_reminder    开场提醒（定时任务触发，暂未接入调度）
 */
import { logger } from '../logger.js';

const CHANNEL = process.env.NOTIFY_PROVIDER || 'console';

const TEMPLATES = {
  booking_submitted: (d) => `【校园场馆】你已提交 ${d.venue} ${d.date} ${d.slot} 的预约，等待审核。`,
  booking_approved: (d) => `【校园场馆】预约通过：${d.venue} ${d.date} ${d.slot}。请按时到场。`,
  booking_rejected: (d) => `【校园场馆】预约未通过：${d.venue} ${d.date} ${d.slot}${d.reason ? `，原因：${d.reason}` : ''}。`,
  ticket_paid: (d) => `【校园场馆】购票成功：${d.session}，${d.seats} 张，¥${(d.amountCents / 100).toFixed(0)}。入场请出示票夹二维码。`,
  ticket_refunded: (d) => `【校园场馆】退票成功：${d.session}，退款 ¥${(d.amountCents / 100).toFixed(0)}，3 个工作日内到账。`,
  session_reminder: (d) => `【校园场馆】提醒：${d.session} 将于 ${d.startAt} 开始，请提前 30 分钟到场。`,
};

/** console：只记录，不真发 */
const consoleChannel = {
  name: 'console',
  async send({ to, template, data }) {
    const render = TEMPLATES[template];
    const text = render ? render(data) : `【校园场馆】${template}`;
    logger.info('[notify]', { to, template, text });
    return { ok: true, channel: 'console', text };
  },
};

/** 短信：接口留位 */
const smsChannel = {
  name: 'sms',
  async send({ to, template, data }) {
    const render = TEMPLATES[template];
    const text = render ? render(data) : template;
    const { SMS_ACCESS_KEY, SMS_SIGN, SMS_TEMPLATE_CODE } = process.env;
    if (!SMS_ACCESS_KEY || !SMS_SIGN || !SMS_TEMPLATE_CODE) {
      throw Object.assign(
        new Error('短信未配置：缺 SMS_ACCESS_KEY / SMS_SIGN / SMS_TEMPLATE_CODE'),
        { http: 503, code: 50300 },
      );
      // 实现步骤：
      // 1. 按所选服务商（阿里云/腾讯云）签名请求
      // 2. 把 template+data 映射成服务商的模板变量
    }
    return { ok: true, channel: 'sms', text };
  },
};

/** 企业微信机器人：只差一个 webhook，最简单可用的真实通道 */
const wecomChannel = {
  name: 'wecom',
  async send({ template, data }) {
    const url = process.env.WECOM_WEBHOOK;
    if (!url) throw Object.assign(new Error('企微未配置：缺 WECOM_WEBHOOK'), { http: 503, code: 50300 });
    const render = TEMPLATES[template];
    const text = render ? render(data) : template;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
    });
    return { ok: res.ok, channel: 'wecom', text };
  },
};

const IMPL = { console: consoleChannel, sms: smsChannel, wecom: wecomChannel };
const impl = IMPL[CHANNEL] ?? consoleChannel;

/**
 * 发送通知。失败**不影响主流程**：业务已经落库，通知是尽力而为。
 * 调用方不需要 try/catch。
 */
export async function notify({ to = '', template, data = {} }) {
  try {
    const r = await impl.send({ to, template, data });
    return r;
  } catch (e) {
    logger.warn('[notify] 发送失败（不影响主流程）', { template, err: e.message });
    return { ok: false, error: e.message };
  }
}

export const notifyChannel = impl.name;
export const NOTIFY_TEMPLATES = Object.keys(TEMPLATES);
export default notify;
