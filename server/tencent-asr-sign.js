/**
 * 腾讯云「实时语音识别」WebSocket 鉴权 URL 生成
 * 文档：https://cloud.tencent.com/document/product/1093/48982
 * 签名原文：asr.cloud.tencent.com/asr/v2/<appid>?<除 signature 外参数按字典序 key=value&...>
 */
const crypto = require('crypto');

/**
 * @param {string} appId 控制台 API 密钥页的 AppID
 * @param {string} secretId
 * @param {string} secretKey
 * @param {object} extra 可选：engine_model_type（默认 16k_en）、voice_id（默认随机 UUID）
 */
function buildTencentRealtimeAsrUrl(appId, secretId, secretKey, extra = {}) {
  const engineModelType = extra.engine_model_type || '16k_en';
  const voiceId = extra.voice_id || crypto.randomUUID();

  const ts = Math.floor(Date.now() / 1000);
  const expired = ts + 3600;
  const nonce = Math.floor(Math.random() * 1e12);

  const params = {
    engine_model_type: engineModelType,
    expired: String(expired),
    needvad: '1',
    nonce: String(nonce),
    secretid: secretId,
    timestamp: String(ts),
    voice_format: '1',
    voice_id: voiceId,
  };

  const keys = Object.keys(params).sort();
  const queryForSign = keys.map((k) => `${k}=${params[k]}`).join('&');
  const signPlain = `asr.cloud.tencent.com/asr/v2/${appId}?${queryForSign}`;

  const signature = crypto.createHmac('sha1', secretKey).update(signPlain, 'utf8').digest('base64');

  const allParams = { ...params, signature };
  const allKeys = Object.keys(allParams).sort();
  const queryFinal = allKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const url = `wss://asr.cloud.tencent.com/asr/v2/${appId}?${queryFinal}`;
  return { url, voiceId, engineModelType };
}

module.exports = { buildTencentRealtimeAsrUrl };
