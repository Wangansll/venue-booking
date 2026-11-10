/** 参数校验：声明式 schema，失败抛 AppError(40000) */
import { AppError } from './errors.js';

export function v(spec) {
  return (source) => {
    const out = {};
    const errors = [];

    for (const [key, rule] of Object.entries(spec)) {
      let val = source?.[key];

      // 必填
      if (val === undefined || val === null || val === '') {
        if (rule.required) { errors.push(`${key} 必填`); continue; }
        if (rule.default !== undefined) out[key] = rule.default;
        continue;
      }

      // 类型转换 + 校验
      if (rule.type === 'int') {
        const n = Number(val);
        if (!Number.isInteger(n)) { errors.push(`${key} 必须是整数`); continue; }
        if (rule.min !== undefined && n < rule.min) { errors.push(`${key} 不能小于 ${rule.min}`); continue; }
        if (rule.max !== undefined && n > rule.max) { errors.push(`${key} 不能大于 ${rule.max}`); continue; }
        out[key] = n;
      } else if (rule.type === 'bool') {
        out[key] = val === true || val === 'true' || val === 1 || val === '1';
      } else if (rule.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(val))) { errors.push(`${key} 日期格式应为 YYYY-MM-DD`); continue; }
        out[key] = String(val);
      } else if (rule.type === 'enum') {
        if (!rule.values.includes(val)) { errors.push(`${key} 只能是 ${rule.values.join(' / ')}`); continue; }
        out[key] = val;
      } else {
        let s = String(val);
        if (rule.maxLen && s.length > rule.maxLen) s = s.slice(0, rule.maxLen);
        if (rule.minLen && s.length < rule.minLen) { errors.push(`${key} 长度不能少于 ${rule.minLen}`); continue; }
        if (rule.trim !== false) s = s.trim();
        out[key] = s;
      }
    }

    if (errors.length) throw new AppError(40000, errors[0], { errors });
    return out;
  };
}

export default v;
