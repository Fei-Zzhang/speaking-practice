import { useState } from 'react'
import './McqStep.css'

export function McqStep({ section, onSubmit, onBack }) {
  const [selected, setSelected] = useState({}) // { questionId: optionIndex }

  const allAnswered = section.mcqQuestions.every(
    (q) => selected[q.id] !== undefined && selected[q.id] !== null
  )

  const handleSubmit = () => {
    if (!allAnswered) return
    onSubmit(selected)
  }

  return (
    <div className="mcq-step">
      <div className="card">
        <h2>{section.title} · 选择题</h2>
        <p>完成以下题目后提交，将进行批改。</p>
      </div>

      {section.mcqQuestions.map((q) => (
        <div key={q.id} className="card mcq-question">
          <p className="mcq-question-text">{q.question}</p>
          <div className="mcq-options">
            {q.options.map((opt, idx) => (
              <label key={idx} className="mcq-option">
                <input
                  type="radio"
                  name={q.id}
                  checked={selected[q.id] === idx}
                  onChange={() => setSelected((prev) => ({ ...prev, [q.id]: idx }))}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="mcq-actions">
        <button type="button" className="btn-back" onClick={onBack}>
          返回
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!allAnswered}
          onClick={handleSubmit}
        >
          提交并批改
        </button>
      </div>
    </div>
  )
}
