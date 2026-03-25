/**
 * 口语/文本批改 API 封装
 *
 * 选择题批改：不需要 API，在本地对比正确答案即可（已在 McqResult 中实现）。
 *
 * 口语批改：若只做「提交并保存文本」，不需要 API；
 * 若要对内容做「语法/流利度/内容」等智能批改，则需要接入外部 API，例如：
 * - 大模型 API（OpenAI / 国内大模型）：把题目 + 学生文本发给模型，返回评分与评语
 * - 第三方口语/作文批改 API
 *
 * 本文件预留接口，便于后续接入。
 */

const API_BASE = import.meta.env.VITE_GRADING_API_BASE || ''

/**
 * 提交口语作答并获取批改结果（需后端/API 支持）
 * @param {Object} params
 * @param {string} params.sectionId - 分区 id
 * @param {string} params.prompt - 题目/提示
 * @param {string} params.text - 学生提交的文本
 * @returns {Promise<{ score?: number, feedback?: string, error?: string }>}
 */
export async function submitSpeakingForGrading({ sectionId, prompt, text }) {
  if (!API_BASE) {
    return { feedback: '未配置批改 API，仅作提交。请在 .env 中配置 VITE_GRADING_API_BASE 并实现后端批改。' }
  }
  try {
    const res = await fetch(`${API_BASE}/grade/speaking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, prompt, text }),
    })
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  } catch (err) {
    return { error: err.message }
  }
}
