import './McqResult.css'

export function McqResult({ section, answers, hasSpeaking, onGoToSpeaking, onBack }) {
  const results = section.mcqQuestions.map((q) => ({
    ...q,
    selected: answers[q.id],
    correct: answers[q.id] === q.correctIndex,
  }))
  const correctCount = results.filter((r) => r.correct).length
  const total = results.length

  return (
    <div className="mcq-result">
      <div className="card">
        <h2>选择题批改结果</h2>
        <p className="mcq-score">
          得分：{correctCount} / {total}
        </p>
      </div>

      {results.map((r) => (
        <div key={r.id} className={`card result-item ${r.correct ? 'correct' : 'wrong'}`}>
          <p className="result-question">{r.question}</p>
          <p className="result-your">
            你的答案：{r.options[r.selected]}
            {!r.correct && (
              <span className="result-correct">
                正确：{r.options[r.correctIndex]}
              </span>
            )}
          </p>
        </div>
      ))}

      <div className="mcq-result-actions">
        <button type="button" className="btn-back" onClick={onBack}>
          返回分区
        </button>
        {hasSpeaking && (
          <button type="button" className="btn-primary" onClick={onGoToSpeaking}>
            进入口语作答
          </button>
        )}
      </div>
    </div>
  )
}
