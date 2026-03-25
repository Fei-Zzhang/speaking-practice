import { useState, useRef, useEffect } from 'react'
import './SpeakingStep.css'

const SPEAKING_DURATION = 45 // 秒

export function SpeakingStep({ section, onBack }) {
  const [phase, setPhase] = useState('idle') // 'idle' | 'counting' | 'done'
  const [secondsLeft, setSecondsLeft] = useState(SPEAKING_DURATION)
  const [transcript, setTranscript] = useState('')
  const [editCount, setEditCount] = useState(0) // 已修改次数，最多允许 2 次「成稿」（初次 + 第二次修改）
  const [isEditing, setIsEditing] = useState(false)
  const [finalText, setFinalText] = useState('')
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)

  // 倒计时
  useEffect(() => {
    if (phase !== 'counting' || secondsLeft <= 0) return
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current)
          setPhase('done')
          stopRecognition()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase, secondsLeft])

  const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('当前浏览器不支持语音识别，请使用 Chrome 或 Edge。')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const full = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('')
      setTranscript(full)
    }
    recognition.onerror = (e) => {
      if (e.error !== 'aborted') console.warn('Speech recognition error:', e.error)
    }
    recognition.start()
    recognitionRef.current = recognition
  }

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (_) {}
      recognitionRef.current = null
    }
  }

  const handleStart = () => {
    setPhase('counting')
    setSecondsLeft(SPEAKING_DURATION)
    setTranscript('')
    setEditCount(0)
    setIsEditing(false)
    setFinalText('')
    startRecognition()
  }

  const handleEdit = () => {
    if (editCount >= 1) return // 只允许第二次修改（初次算 0 次修改，再改 1 次）
    setIsEditing(true)
    setFinalText(transcript)
  }

  const handleSaveEdit = () => {
    setTranscript(finalText)
    setEditCount((c) => c + 1)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setFinalText(transcript)
    setIsEditing(false)
  }

  const handleSubmit = async () => {
    const toSubmit = (isEditing ? finalText : transcript).trim()
    if (!toSubmit) {
      alert('请先完成口语内容再提交。')
      return
    }
    // 可选：调用批改 API（见 src/api/grading.js）
    const { submitSpeakingForGrading } = await import('../api/grading')
    const result = await submitSpeakingForGrading({
      sectionId: section.id,
      prompt: section.speakingPrompt,
      text: toSubmit,
    })
    if (result.error) {
      alert('提交失败：' + result.error)
      return
    }
    const msg = result.feedback || '已提交。'
    if (result.score != null) {
      alert(`得分：${result.score}\n\n${msg}`)
    } else {
      alert(msg)
    }
  }

  return (
    <div className="speaking-step">
      <div className="card">
        <h2>{section.title} · 口语作答</h2>
        <p className="speaking-prompt">{section.speakingPrompt}</p>
        <p className="speaking-tip">使用浏览器自带的语音转文字，点击「开始答题」后开始 45 秒倒计时。允许在提交前修改一次文本。</p>
      </div>

      {phase === 'idle' && (
        <div className="card">
          <button type="button" className="btn-primary btn-start" onClick={handleStart}>
            开始答题
          </button>
        </div>
      )}

      {(phase === 'counting' || phase === 'done') && (
        <>
          <div className={`card countdown-card ${secondsLeft <= 10 ? 'countdown-warn' : ''}`}>
            <span className="countdown-number">{secondsLeft}</span>
            <span className="countdown-label">秒</span>
            {phase === 'done' && <p className="countdown-done">时间到</p>}
          </div>

          {!isEditing ? (
            <div className="card transcript-card">
              <label className="transcript-label">当前内容（语音转写）</label>
              <div className="transcript-text">{transcript || '（正在识别…）'}</div>
              <div className="transcript-actions">
                {editCount < 1 && phase === 'done' && (
                  <button type="button" className="btn-edit" onClick={handleEdit}>
                    修改文本（还可修改 1 次）
                  </button>
                )}
                {editCount >= 1 && <span className="edit-used">已使用二次修改</span>}
              </div>
            </div>
          ) : (
            <div className="card edit-card">
              <label className="transcript-label">修改后的文本</label>
              <textarea
                className="edit-textarea"
                value={finalText}
                onChange={(e) => setFinalText(e.target.value)}
                rows={6}
                placeholder="在此修改后保存"
              />
              <div className="edit-actions">
                <button type="button" className="btn-back" onClick={handleCancelEdit}>
                  取消
                </button>
                <button type="button" className="btn-primary" onClick={handleSaveEdit}>
                  保存（算作第二次修改）
                </button>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="speaking-submit">
              <button type="button" className="btn-back" onClick={onBack}>
                返回
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmit}
              >
                提交并批改
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
