/** 业务错误 + 错误码表：前端按 code 分流，日志按 level 采集 */
const CODES = {
  0:     { http: 200, msg: 'ok' },

  // 通用 4xx
  40000: { http: 400, msg: '请求参数不合法' },
  40001: { http: 400, msg: '用户名和密码不能为空' },
  40002: { http: 400, msg: '日期格式应为 YYYY-MM-DD' },
  40003: { http: 400, msg: '参数不合法' },
  40004: { http: 400, msg: '不能预约过去的日期' },
  40005: { http: 400, msg: '该时段不开放' },
  40006: { http: 400, msg: '同一天最多预约 3 个时段' },
  40007: { http: 400, msg: 'action 只能是 approve 或 reject' },

  40100: { http: 401, msg: '未登录' },
  40101: { http: 401, msg: '登录已失效，请重新登录' },
  40102: { http: 401, msg: '用户名或密码错误' },

  40300: { http: 403, msg: '无权限' },

  40400: { http: 404, msg: '接口不存在' },
  40401: { http: 404, msg: '场馆不存在' },
  40402: { http: 404, msg: '场馆不存在或已停用' },
  40403: { http: 404, msg: '预约不存在或已不可取消' },

  40901: { http: 409, msg: '该时段刚被约走，请换一个时段' },
  40902: { http: 409, msg: '该预约已被处理' },
  40903: { http: 409, msg: '座位保留已过期，请重新选座' },
  40904: { http: 409, msg: '票码无效或已使用' },
  40905: { http: 409, msg: '该订单已退款' },
  40906: { http: 409, msg: '只有已支付订单可退款' },
  40907: { http: 409, msg: '开场前 24 小时起不可退票' },
  40908: { http: 409, msg: '该订单已有票核销，不能整单退' },
  40909: { http: 409, msg: '票码已过期，请刷新后重新出示' },
  40910: { http: 409, msg: '票码签名无效' },
  40911: { http: 409, msg: '超过单场限购数量' },
  40912: { http: 409, msg: '退款处理中，请稍后再试' },
  40404: { http: 404, msg: '座位不存在' },

  42900: { http: 429, msg: '请求太频繁，请稍后再试' },

  // 5xx
  50000: { http: 500, msg: '服务器开小差了，请稍后再试' },
  50300: { http: 503, msg: '服务暂不可用' },
};

export class AppError extends Error {
  constructor(code, message, extra) {
    const def = CODES[code] || CODES[50000];
    super(message || def.msg);
    this.code = code in CODES ? code : 50000;
    this.http = def.http;
    this.expose = def.http < 500;   // 5xx 不把内部信息给前端
    this.extra = extra;
  }
  static of(code, message, extra) { return new AppError(code, message, extra); }
}

export function codeInfo(code) {
  return CODES[code] ?? { http: 500, msg: '服务器开小差了' };
}

export default AppError;
