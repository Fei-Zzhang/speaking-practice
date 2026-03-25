import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import tencentcloud from 'tencentcloud-sdk-nodejs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const upload = multer();

// 初始化腾讯云 智聆口语评测（Soe）客户端
const SoeClient = tencentcloud.soe.v20180724.Client;

const client = new SoeClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY
  },
  region: process.env.TENCENT_REGION || 'ap-guangzhou',
  profile: {
    httpProfile: {
      endpoint: 'soe.tencentcloudapi.com'
    }
  }
});

/**
 * 智聆口语评测接口（一次性评测）
 * POST /api/oral-eval
 * form-data:
 *   - audio: 录音音频文件（二进制）
 *   - refText: 参考文本（本题的标准答案 / 示例答案）
 *   - evalMode: 评测模式，可选，默认 0
 */
app.post('/api/oral-eval', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: '缺少音频文件 audio' });
    }
    const refText = (req.body.refText || '').trim();
    if (!refText) {
      return res.status(400).json({ ok: false, error: '缺少参考文本 refText' });
    }

    const base64Audio = req.file.buffer.toString('base64');
    const sessionId = uuidv4();

    const params = {
      SeqId: 1,
      IsEnd: 1,
      VoiceFileType: 2, // 2 = 上传本地 base64
      VoiceEncodeType: 1, // 1 = pcm。前端录音编码需要和这里匹配
      UserVoiceData: base64Audio,
      SessionId: sessionId,
      RefText: refText,
      WorkMode: 1, // 1 = 非流式，一次性评测
      EvalMode: Number(req.body.evalMode ?? 0),
      ScoreCoeff: 1.0,
      ServerType: 1 // 1 = 中文，0 = 英文
    };

    const result = await client.TransmitOralProcessWithInit(params);

    // 字段名称请根据你在 API Explorer 里看到的实际返回为准
    const overall =
      result?.PronContent?.SuggestedScore ??
      result?.PronContent?.Score ??
      null;

    res.json({
      ok: true,
      sessionId,
      overall,
      pronDetail: result?.PronContent ?? null,
      words: result?.Words ?? [],
      raw: result
    });
  } catch (err) {
    console.error('Oral eval error:', err);
    res.status(500).json({ ok: false, error: '口语评测调用失败' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Oral eval API server running at http://localhost:${PORT}`);
});

