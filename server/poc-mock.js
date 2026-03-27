/**
 * 商业化联调 PoC：模拟短信 OTP + 模拟支付回调开通权益。
 * 仅内存存储，进程重启即清空；切勿在生产环境开启。
 *
 * 挂载条件：环境变量 POC_MODE=1（见 server.js）
 */

const otpByPhone = new Map();
const entitlementsByPhone = new Map();

function isCnMobile(phone) {
  return /^1\d{10}$/.test(String(phone || '').trim());
}

module.exports = function mountPocMock(app) {
  app.get('/api/poc/health', (req, res) => {
    res.json({ ok: true, service: 'speaking-practice-poc-mock', warning: 'POC only; in-memory' });
  });

  /** 模拟发短信：验证码打印在服务端日志 */
  app.post('/api/poc/sms/send', (req, res) => {
    try {
      const phone = String((req.body && req.body.phone) || '').trim();
      if (!isCnMobile(phone)) {
        return res.status(400).json({ ok: false, message: '请输入 11 位中国大陆手机号' });
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      otpByPhone.set(phone, { code, exp: Date.now() + 10 * 60 * 1000 });
      console.log('[POC SMS] phone=%s code=%s (valid 10min)', phone, code);
      return res.json({
        ok: true,
        message: '已发送（PoC：验证码见 Node 控制台日志）',
        devOnly: true,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: String(e && e.message) });
    }
  });

  /** 模拟校验验证码，返回假 token（不含真实 JWT 校验链） */
  app.post('/api/poc/sms/verify', (req, res) => {
    try {
      const phone = String((req.body && req.body.phone) || '').trim();
      const code = String((req.body && req.body.code) || '').trim();
      if (!isCnMobile(phone) || !code) {
        return res.status(400).json({ ok: false, message: '需要 phone 与 code' });
      }
      const row = otpByPhone.get(phone);
      if (!row || row.exp < Date.now()) {
        return res.status(400).json({ ok: false, message: '验证码无效或已过期' });
      }
      if (row.code !== code) {
        return res.status(400).json({ ok: false, message: '验证码错误' });
      }
      otpByPhone.delete(phone);
      const token =
        'poc_' + Buffer.from(phone + ':' + Date.now(), 'utf8').toString('base64url').slice(0, 48);
      return res.json({ ok: true, token, phone, mock: true });
    } catch (e) {
      return res.status(500).json({ ok: false, message: String(e && e.message) });
    }
  });

  /** 模拟支付成功回调：为手机号写入一条「已付费」权益（内存） */
  app.post('/api/poc/pay/mock-callback', (req, res) => {
    try {
      const phone = String((req.body && req.body.phone) || '').trim();
      const orderId = String((req.body && req.body.orderId) || '').trim() || 'poc-' + Date.now();
      if (!isCnMobile(phone)) {
        return res.status(400).json({ ok: false, message: '需要 11 位 phone' });
      }
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const ent = {
        plan: 'paid-month-mock',
        validUntil,
        orderId,
        paidAt: new Date().toISOString(),
      };
      entitlementsByPhone.set(phone, ent);
      return res.json({ ok: true, phone, entitlement: ent, mock: true });
    } catch (e) {
      return res.status(500).json({ ok: false, message: String(e && e.message) });
    }
  });

  /** 查询某手机号的模拟权益（联调） */
  app.get('/api/poc/entitlement', (req, res) => {
    const phone = String((req.query && req.query.phone) || '').trim();
    if (!isCnMobile(phone)) {
      return res.status(400).json({ ok: false, message: '需要 query phone' });
    }
    const ent = entitlementsByPhone.get(phone) || null;
    return res.json({ ok: true, entitlement: ent });
  });
};
