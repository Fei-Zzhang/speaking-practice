import { useState } from 'react'
import { sections } from './data/sections'
import { SectionList } from './components/SectionList'
import { McqStep } from './components/McqStep'
import { SpeakingStep } from './components/SpeakingStep'
import { McqResult } from './components/McqResult'
import './App.css'

export default function App() {
  const [currentSectionId, setCurrentSectionId] = useState(null)
  const [step, setStep] = useState('list') // 'list' | 'mcq' | 'mcqResult' | 'speaking'
  const [mcqAnswers, setMcqAnswers] = useState({})
  const [mcqSubmitted, setMcqSubmitted] = useState(false)

  const section = sections.find((s) => s.id === currentSectionId)

  const handleStartSection = (sectionId) => {
    setCurrentSectionId(sectionId)
    setMcqAnswers({})
    setMcqSubmitted(false)
    const s = sections.find((x) => x.id === sectionId)
    if (s.hasMcq) setStep('mcq')
    else if (s.hasSpeaking) setStep('speaking')
    else setStep('list')
  }

  const handleMcqSubmit = (answers) => {
    setMcqAnswers(answers)
    setMcqSubmitted(true)
    setStep('mcqResult')
  }

  const handleGoToSpeaking = () => {
    setStep('speaking')
  }

  const handleBackToList = () => {
    setCurrentSectionId(null)
    setStep('list')
    setMcqAnswers({})
    setMcqSubmitted(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>口语练习</h1>
        {section && (
          <button type="button" className="btn-back" onClick={handleBackToList}>
            返回分区
          </button>
        )}
      </header>

      <main className="app-main">
        {step === 'list' && (
          <SectionList sections={sections} onStart={handleStartSection} />
        )}

        {step === 'mcq' && section?.hasMcq && (
          <McqStep
            section={section}
            onSubmit={handleMcqSubmit}
            onBack={handleBackToList}
          />
        )}

        {step === 'mcqResult' && section && (
          <McqResult
            section={section}
            answers={mcqAnswers}
            hasSpeaking={section.hasSpeaking}
            onGoToSpeaking={handleGoToSpeaking}
            onBack={handleBackToList}
          />
        )}

        {step === 'speaking' && section?.hasSpeaking && (
          <SpeakingStep
            section={section}
            onBack={handleBackToList}
          />
        )}
      </main>
    </div>
  )
}
