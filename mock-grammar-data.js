// Grammar 练习题（来自 grammartestmaterial.text）
// 级别1=选择题 级别2=填空题 级别3=引导造句（语音转文字，正确后AI提示）
window.MOCK_GRAMMAR_TOPICS = [
  {
    id: 'subject-verb',
    title: '2.1 主谓一致（单数主语）',
    level1: {
      type: 'mcq',
      questions: [
        { q: 'Online learning _____ many advantages.', options: ['have', 'has', 'are'], correctIndex: 1 },
        { q: 'Reading books _____ my favorite hobby.', options: ['is', 'are', 'be'], correctIndex: 0 },
        { q: 'The teacher _____ us every day.', options: ['help', 'helps', 'helping'], correctIndex: 1 }
      ]
    },
    level2: {
      type: 'fill',
      questions: [
        { prompt: 'My brother _____ (play) basketball every weekend.', answer: 'plays' },
        { prompt: 'The information on the internet _____ (be) very useful.', answer: 'is' },
        { prompt: 'Each of the students _____ (have) a different opinion.', answer: 'has' }
      ]
    },
    level3: {
      type: 'speak',
      scenario: '描述你每天的学习习惯。',
      hints: ['my favorite subject', 'online learning', 'the teacher'],
      requirement: '用这三个短语造三个句子，注意主谓一致。',
      aiPrompt: '很好！但"my favorite subject"是单数，应该用"is"。试试看："My favorite subject is math."'
    }
  },
  {
    id: 'causative',
    title: '2.2 使役动词（make/let）',
    level1: {
      type: 'mcq',
      questions: [
        { q: 'My parents _____ me study every day.', options: ['make', 'make to', 'makes'], correctIndex: 0 },
        { q: 'The teacher let us _____ in groups.', options: ['work', 'to work', 'working'], correctIndex: 0 },
        { q: 'This course _____ me improve my skills.', options: ['made', 'made to', 'make'], correctIndex: 0 }
      ]
    },
    level2: {
      type: 'fill',
      questions: [
        { prompt: 'My coach _____ (让) me practice every day. (用make)', answer: 'makes' },
        { prompt: 'Please _____ (让) me know your decision. (用let)', answer: 'let' },
        { prompt: 'The movie _____ (使得) me cry.', answer: 'made' }
      ]
    },
    level3: {
      type: 'speak',
      scenario: '描述别人对你的影响。',
      hints: ['make me', 'let me'],
      requirement: '用make me和let me各造一个句子，描述老师或父母对你的帮助。',
      aiPrompt: '很好！但有两个小问题：1. "my teacher"是单数，动词应该用"makes" 2. "make"后面不需要"to"。正确应该是："My teacher makes me do homework." 现在请用"let me"再试一个句子。'
    }
  },
  {
    id: 'confused-words',
    title: '2.3 易混淆词（affected/effective, prove/use）',
    level1: {
      type: 'mcq',
      questions: [
        { q: 'This method is very _____.', options: ['affected', 'effective', 'effect'], correctIndex: 1 },
        { q: 'We should _____ technology in the classroom.', options: ['prove', 'use', 'proof'], correctIndex: 1 },
        { q: 'His speech deeply _____ the audience.', options: ['effected', 'affected', 'effective'], correctIndex: 1 }
      ]
    },
    level2: {
      type: 'fill',
      questions: [
        { prompt: 'Self-directed learning can be very _____ (有效的) if you are disciplined.', answer: 'effective' },
        { prompt: 'We need to _____ (使用) what we learn in real life.', answer: 'use' },
        { prompt: 'The new policy will _____ (影响) all students.', answer: 'affect' }
      ]
    },
    level3: {
      type: 'speak',
      scenario: '讨论学习方法的效果。',
      hints: ['effective', 'use', 'affect'],
      requirement: '用这三个词各造一个句子，描述你的学习经验。',
      aiPrompt: '很好的尝试！可以再把句子丰富一下："Using a computer to study is very effective because..." 试着用"affect"造一个关于老师如何影响你的句子。'
    }
  },
  {
    id: 'preposition',
    title: '2.4 介词错误（focus on, at the same time）',
    level1: {
      type: 'mcq',
      questions: [
        { q: 'You should focus _____ your studies.', options: ['at', 'on', 'in'], correctIndex: 1 },
        { q: 'I can listen to music and study _____ the same time.', options: ['in', 'on', 'at'], correctIndex: 2 },
        { q: 'We need a break _____ screens.', options: ['of', 'from', 'on'], correctIndex: 1 }
      ]
    },
    level2: {
      type: 'fill',
      questions: [
        { prompt: 'Please focus _____ (在) your homework.', answer: 'on' },
        { prompt: 'I eat breakfast and read news _____ _____ _____ _____ (同时).', answer: 'at the same time' },
        { prompt: 'Reading paper books gives me a break _____ (远离) screens.', answer: 'from' }
      ]
    },
    level3: {
      type: 'speak',
      scenario: '描述你的日常习惯。',
      hints: ['focus on', 'at the same time', 'a break from'],
      requirement: '用这三个短语描述你的一天。',
      aiPrompt: '很好！注意"listen"后面要加"to"哦。"I focus on studying and listen to music at the same time." 现在试试用"a break from"造一个句子。'
    }
  },
  {
    id: 'good-well',
    title: '2.5 词性混淆（good/well）',
    level1: {
      type: 'mcq',
      questions: [
        { q: 'She speaks English very _____.', options: ['good', 'well', 'goodly'], correctIndex: 1 },
        { q: 'This is a _____ book.', options: ['good', 'well', 'goodly'], correctIndex: 0 },
        { q: 'He did _____ on the test.', options: ['good', 'well', 'goodly'], correctIndex: 1 }
      ]
    },
    level2: {
      type: 'fill',
      questions: [
        { prompt: 'She is a _____ (好的) teacher.', answer: 'good' },
        { prompt: 'She teaches _____ (好).', answer: 'well' },
        { prompt: "I don't feel very _____ (好) today.", answer: 'well' }
      ]
    },
    level3: {
      type: 'speak',
      scenario: '描述你的老师或朋友。',
      hints: ['good', 'well'],
      requirement: '用good造一个句子描述人，用well造一个句子描述动作。',
      aiPrompt: '很好！注意"she"是第三人称单数，动词应该是"teaches"哦。"My teacher is good. She teaches well." 完美！'
    }
  },
  {
    id: 'collocation',
    title: '2.6 搭配错误（stay with, on the right path）',
    level1: {
      type: 'mcq',
      questions: [
        { q: 'These memories will _____ with me forever.', options: ['keep', 'stay', 'remain'], correctIndex: 1 },
        { q: 'The teacher put me on the right _____.', options: ['road', 'path', 'way'], correctIndex: 1 },
        { q: 'Too much screen time will _____ me blind.', options: ['get', 'make', 'let'], correctIndex: 1 }
      ]
    },
    level2: {
      type: 'fill',
      questions: [
        { prompt: 'Good habits will _____ (伴随) you for life.', answer: 'stay with' },
        { prompt: 'A mentor can put you on the right _____ (道路).', answer: 'path' },
        { prompt: 'Reading in dim light might _____ (使) your eyes tired.', answer: 'make' }
      ]
    },
    level3: {
      type: 'speak',
      scenario: '谈论对你影响深远的人或事。',
      hints: ['stay with me', 'put me on the right path'],
      requirement: '用这两个短语造两个句子。',
      aiPrompt: '很好！但英语中更常说"on the right path"。试试看："My teacher put me on the right path." 现在用"stay with me"造一个句子。'
    }
  }
];
