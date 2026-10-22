// Look Up · 所有文字（第 5 节）。Kiara 会改。
// 规则：第二人称，现在时，很短，没有感叹号。越往上越短。
// 作品名字也只在这里改。文件夹名 look-up/ 改了也没关系，页面里都是相对路径。

window.CONTENT = {
  name: 'Look Up',                                    // TODO 作品正式名字未定

  // ---- dashboard（TODO：标题和说明文字还没定，下面都是占位）
  dashboard: {
    title: 'Look Up',                                 // TODO 占位
    lines: [                                          // TODO 占位：一两句说明
      'Pigeons live at every height of the city.',
      'Follow them up, one height at a time.',
    ],
    howTo: 'Turn on your camera. Sit down. Look at the screen.',   // TODO 占位
    howToMobile: 'Hold your phone in front of you. Raise it toward the sky.',   // TODO 占位（手机）
    begin: 'Begin',
    keysNote: 'No camera: use ↑ ↓ and drag a frame with the mouse.',
    // 结尾回到 dashboard 时
    endLines: [                                       // TODO 占位
      'This is your feather.',
      'Print it, fold it, keep it.',
    ],
    download: 'Download feather sheet',
    print: 'Print',
    tutorial: 'Folding steps — coming soon',          // TODO 之后放折叠教程（扫描 + 步骤图）
    again: 'Look up again',
    clear: 'Clear feathers on the ground',
    clearConfirm: 'Clear all feathers on the ground? Press Y to confirm.',
  },

  // ---- 电脑版 dashboard（按 Figma frame 2–14）。卡片上的字按设计稿断行：一行一个字符串
  dash: {
    thesis: 'Kiara Li thesis website',
    thesisUrl: 'https://kiarali.com',               // TODO 之后换成 living archive 的地址
    about: 'About this project',
    aboutUrl: 'https://kiarali.com',                // TODO 之后换成只介绍这个项目的页面
    feather: 'See your feather and how to fold it',
    featherLocked: 'Look all the way up to unlock this',
    headline: ['LOOK UP!', 'AN ART', 'EXPERIMENT', 'THAT HAS YOU', 'LOOK UP', 'TO FIND THE', 'PIGEONS HIDING', 'IN THE CITY.'],
    // 卡片四周：左上一组（横 + 竖）连成一句，右下一组连成一句；不再重复左边标题那句
    edgeTL: ['Pigeons live at every height of this city,', 'most of them above your eyes.'],
    edgeBR: ['So look up, slowly, one height at a time,', 'and notice the city you pass every day.'],
    tipsTitle: 'A few tips',
    tips: [                                            // 每条一行（右栏大约 30 个字母）
      'This site uses your camera.',
      'Phone or computer, both work.',
      'Do the hand gestures shown.',
      'Heads up: lots of birds.',
      'Sit somewhere with good light.',
      'Press F for full screen.',
    ],
    chaptersLocked: 'Chapters! Unlock them by looking all the way up.',
    chaptersOpen: 'Chapters! Hover over one to take a peek.',
    // 卡片
    congrats: ['Congrats! You found', 'this feather! You are', 'invited to play with', 'this website!'],
    play: 'Let’s play!',
    two: ['There are only two', 'actions you need', 'to play around.'],
    first: 'The first one',
    head: ['Now move your', 'head up to'],
    lookUp: 'LOOK UP',
    nice: ['Nice work!', 'Remember to look', 'up to keep', 'scrolling.'],
    second: 'The second one',
    hands: ['Follow the hands on', 'the bottom left and', 'top right to take a', 'peek. Now it starts!'],
    go: 'Continue',
    noCamUp: 'No camera? Press ↑',
    noCamHands: 'No camera? Click the card.',
    featherFace: ['This is your feather.', 'Print it, fold it, keep it.'],
  },

  // ---- 书页上的界面（bookui.js）
  book: {
    tutorial: 'Make a window with your hands, like these. Hold it over a pigeon until it comes loose.',
    tutorialMobile: 'Pinch until a pigeon fills the screen. Hold still until it comes loose.',
    noCam: 'No camera? Draw a square around a pigeon, and wait.',
    up: 'There is more of it above you.',
    ready: 'Before you climb any higher, one question.',
    yes: 'Ask me',
    done: 'Keep this',
    next: 'Go higher',
    inch: 'inch',
  },

  // ---- 每个 section：name（卡片上的小标签）、intro（切到第一只鸽子后卡片背面）、question（最后一页的填空，___ 是空）
  // 七句填空连起来读，是一首从雨棚一直写到天空的诗。介绍是草稿，Kiara 之后改。
  sections: [
    { name: 'Awning',
      intro: 'Before air conditioning, a shop kept cool with canvas. Every morning someone cranked the awning out to shade the window, the goods, and whoever stopped to look. The pigeons took the roof.',
      question: { prompt: 'When did you last wait out the rain under someone else’s awning?',
        sentence: 'I waited under an awning on ___, while the rain ___.' } },
    { name: 'Projecting sign',
      intro: 'A sign that sticks out from the wall turns sideways to talk to people on foot, not in cars. The city decides how far it may reach over your head. Nobody decided who would sit on top.',
      question: { prompt: 'Which sign do you read every day without meaning to?',
        sentence: 'Every day I read a sign that says ___, and think of ___.' } },
    { name: 'Ledge & sill',
      intro: 'Ledges and sills were drawn to throw rain off a façade. Pigeons come from rock doves that nested on sea cliffs; to them a building is simply another cliff, and this is the shelf.',
      question: { prompt: 'What would you leave on a ledge for someone to find?',
        sentence: 'On the ledge outside my window I would leave ___ for ___.' } },
    { name: 'Traffic signal',
      intro: 'The mast arm swings the light out over the lane, right where a driver is already looking. It was built for people in a hurry. The birds on top have nowhere to be.',
      question: { prompt: 'What do you think about while you wait for the light?',
        sentence: 'Waiting for the light, I think about ___ until it turns ___.' } },
    { name: 'Fire escape',
      intro: 'In 1867 New York began requiring fire escapes on tenements. People found every other use for them: a bed on hot nights, a line for laundry, a garden of tomatoes, a balcony for talking across the gap.',
      question: { prompt: 'Who would you sit with on a fire escape on a hot night?',
        sentence: 'On a hot night I would climb out with ___ and watch ___.' } },
    { name: 'Streetlight',
      intro: 'Broadway was lit by electric arc lamps in 1880. A streetlight is made for walking home in the dark. To a pigeon it is a high perch that stays warm after sunset.',
      question: { prompt: 'Where were you going the last time a streetlight came on above you?',
        sentence: 'The streetlight came on as I walked toward ___, feeling ___.' } },
    { name: 'In flight',
      intro: 'Up here nothing was built for anyone. A pigeon can find its way home from very far away. You have come a long way up, too.',
      question: { prompt: 'When did you last look up, only to look?',
        sentence: 'The last time I looked up, the sky was ___ and I was ___.' } },
  ],

  // ---- 书：每个 section 之前的指引（一句比一句往上）。顺序和 config.book.sections 一样
  guides: [
    'Look up, not far. Just to where the shops keep their shade.',
    'A little higher, to the signs that lean out over the sidewalk.',
    'Higher. This is where the city starts to look like a cliff.',
    'Up to the traffic lights. They have been changing all day without you.',
    'Climb the fire escapes with your eyes, floor by floor.',
    'Up to the streetlights, before they come on.',
  ],
  guideSky: 'Now past all of it. Look at the sky.',

  calibrate: 'Look at the screen.',
  calibrateMobile: 'Hold still.',                     // 手机：记下开始时的姿态
  rotate: 'Please turn your phone upright.',          // 手机横过来时
  lost: '',                                           // 人脸丢失时不显示文字，只是停下

  // ---- 和高度有关的事实（对应 config.facts 的高度）
  facts: [
    'Eye level. Most of what follows is above it.',
    'City pigeons descend from rock doves, which nested on sea-cliff ledges.',
    'On migration nights, many birds pass over the city above 1,000 m.',
  ],

  // ---- 问题（对应 config.pauses 的高度）
  questions: [
    'When did you last look at a streetlight?',
    'Have you ever leaned out of a window just to look?',
    "What's on the ledge outside your window right now?",
  ],
  answerNote: 'Your answers stay on this computer. They will be printed on your feather.',
  answerHint: 'Enter to keep · Esc to skip',
  answerHintMobile: 'Return to keep · tap outside to skip',

  last: 'Now look up from your screen.',

  // ---- 羽毛图纸背面
  sheet: {
    heights: 'Pigeons you found',
    answers: 'Your answers',
    none: 'None this time.',
  },
};
