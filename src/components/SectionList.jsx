import './SectionList.css'

export function SectionList({ sections, onStart }) {
  return (
    <div className="section-list">
      <p className="section-list-desc">选择题目分区开始练习</p>
      {sections.map((s) => (
        <div key={s.id} className="card section-card">
          <h2>{s.title}</h2>
          <p>{s.description}</p>
          <button
            type="button"
            className="btn-primary section-btn"
            onClick={() => onStart(s.id)}
          >
            开始练习
          </button>
        </div>
      ))}
    </div>
  )
}
