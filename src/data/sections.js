// 题目分区数据
// hasSpeaking: true 表示该分区包含「先选择题 → 批改 → 再口语」流程
export const sections = [
  {
    id: 'part1',
    title: 'Part 1 - 基础问答',
    description: '先完成选择题，批改后再进行口语作答',
    hasMcq: true,
    hasSpeaking: true,
    mcqQuestions: [
      {
        id: 'q1',
        question: 'What is the main purpose of the passage?',
        options: ['To entertain', 'To inform', 'To persuade', 'To describe'],
        correctIndex: 1,
      },
      {
        id: 'q2',
        question: 'According to the text, which statement is true?',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctIndex: 2,
      },
    ],
    speakingPrompt: 'Please summarize the main idea of the passage in your own words (about 45 seconds).',
  },
  {
    id: 'part2',
    title: 'Part 2 - 观点表达',
    description: '选择题 + 口语输出',
    hasMcq: true,
    hasSpeaking: true,
    mcqQuestions: [
      {
        id: 'q1',
        question: 'The author’s attitude can best be described as ___.',
        options: ['Neutral', 'Critical', 'Supportive', 'Uncertain'],
        correctIndex: 2,
      },
    ],
    speakingPrompt: 'Do you agree with the author? Give your opinion and reasons (about 45 seconds).',
  },
  {
    id: 'part3',
    title: 'Part 3 - 仅选择题',
    description: '只做选择题并批改',
    hasMcq: true,
    hasSpeaking: false,
    mcqQuestions: [
      {
        id: 'q1',
        question: 'What would be the best title for this passage?',
        options: ['Title A', 'Title B', 'Title C', 'Title D'],
        correctIndex: 0,
      },
    ],
    speakingPrompt: null,
  },
]
