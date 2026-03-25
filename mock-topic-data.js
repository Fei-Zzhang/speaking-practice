// Topic Development 练习题（来自 topicdevelopmenttestmaterial.text）
// 初阶：选词填空、合并句子、改错；中阶：易混淆词、改写、改错；高阶：段落填空、重组、改写、自由写作
window.MOCK_TOPIC = {
  beginner: {
    title: '初阶：选择正确的连接词',
    goal: '掌握最常用的连接词（and, but, because, so, in conclusion）',
    fillBlank: {
      intro: '从方框中选择正确的连接词填空：[and, but, because, so, in conclusion]',
      items: [
        { sentence: 'I like reading novels, ______ my brother prefers history books.', answer: 'but' },
        { sentence: 'She studies hard ______ she wants to get good grades.', answer: 'because' },
        { sentence: 'He was tired, ______ he went to bed early.', answer: 'so' },
        { sentence: 'I enjoy both fiction ______ non-fiction books.', answer: 'and' },
        { sentence: '______, I believe that reading is important for everyone.', answer: 'In conclusion' }
      ]
    },
    merge: {
      intro: '用括号里的连接词把两个句子合并成一个：',
      items: [
        { s1: 'I like coffee.', s2: "I don't like tea.", connector: 'but', answer: "I like coffee, but I don't like tea." },
        { s1: 'She was hungry.', s2: 'She made a sandwich.', connector: 'so', answer: 'She was hungry, so she made a sandwich.' },
        { s1: 'He passed the exam.', s2: 'He studied very hard.', connector: 'because', answer: 'He passed the exam because he studied very hard.' },
        { s1: 'I bought a book.', s2: 'I read it in one day.', connector: 'and', answer: 'I bought a book and read it in one day.' }
      ]
    },
    fixError: {
      intro: '找出句子中连接词的问题并改正：',
      items: [
        { wrong: 'I like to read, I think reading is important.', hint: '缺少连接词', answer: 'I like to read, and I think reading is important.' },
        { wrong: 'If novels are popular because they tell good stories.', hint: 'If多余', answer: 'Novels are popular because they tell good stories.' },
        { wrong: 'The book was interesting, I finished it quickly.', hint: '缺少连接词', answer: 'The book was interesting, so I finished it quickly.' }
      ]
    }
  },
  intermediate: {
    title: '中阶：区分相似连接词',
    goal: '掌握易混淆的连接词（while/whereas, because/as/since, however/nevertheless）',
    fillBlank: {
      intro: '选择正确的词填空：',
      items: [
        { sentence: '______ I was reading, my brother was watching TV.', answer: 'While', options: ['While', 'Whereas'] },
        { sentence: 'Some people prefer paper books, ______ others like e-books.', answer: 'whereas', options: ['while', 'whereas'] },
        { sentence: "______ you're already here, let's start the meeting.", answer: 'Since', options: ['Because', 'Since', 'As'] },
        { sentence: 'He was late ______ he missed the bus.', answer: 'because', options: ['because', 'since', 'as'] },
        { sentence: 'The book was long. ______, it was very interesting.', answer: 'However', options: ['However', 'Nevertheless'] },
        { sentence: "It was raining; ______, we went for a walk.", answer: 'nevertheless', options: ['however', 'nevertheless'] }
      ]
    },
    rewrite: {
      intro: '用括号里的连接词改写句子，保持意思不变：',
      items: [
        { sentence: 'Because it was raining, we stayed inside.', connector: 'so', answer: 'It was raining, so we stayed inside.' },
        { sentence: 'He is rich, but he is not happy.', connector: 'however', answer: 'He is rich. However, he is not happy.' },
        { sentence: 'She studied hard, so she passed the exam.', connector: 'because', answer: 'She passed the exam because she studied hard.' }
      ]
    },
    fixError: {
      intro: '找出并改正连接词错误：',
      items: [
        { wrong: "...since it's not about the things you read in childhood.", hint: '应该用like/unlike', answer: "...unlike the things you read in childhood." },
        { wrong: 'And while e-books are convenient...', hint: 'and和while重复', answer: 'While e-books are convenient...' }
      ]
    }
  },
  advanced: {
    title: '高阶：段落连贯性训练',
    goal: '在段落层面正确使用连接词，实现逻辑流畅',
    paragraphFill: {
      intro: '在空白处填入合适的连接词（可能多个答案）：',
      text: 'Reading books has many benefits. ______, it improves vocabulary and critical thinking. ______, it can reduce stress and improve empathy. ______, some people prefer watching movies ______ they are faster. ______, I believe that nothing can replace the experience of reading a good book. ______, I try to read at least 30 minutes every day.',
      answers: ['First/Firstly', 'Second/Additionally', 'However', 'because', 'Therefore', 'So/Thus']
    },
    reorder: {
      intro: '把下面的句子重新排序，并用合适的连接词连接成一段连贯的文字：',
      sentences: ['Reading before bed helps me relax.', 'I learn new things from books.', 'I read every night.', 'Books are my favorite hobby.'],
      sample: 'I read every night because reading before bed helps me relax. Also, I learn new things from books. In conclusion, books are my favorite hobby.'
    },
    freeWrite: {
      topic: 'Compare reading paper books and e-books.',
      requirement: '写一段话（5-7句），使用：至少1个对比连接词（while, whereas, however）；至少1个因果连接词（because, so, therefore）；至少1个递进连接词（also, moreover, furthermore）；1个总结连接词（in conclusion, overall）。'
    }
  }
};
