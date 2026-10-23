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
    endLines: ['The feather you made.'],
    download: 'Your sheet',                         // 打开最后的纸（碎片拼成的网格 + 诗），在那里下载 / 打印
    print: 'Print',
    tutorial: 'Folding steps',                      // 打开折羽毛的 12 步（js/fold.js）
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
    featherFace: ['The feather you made.'],          // 结尾 dashboard 的羽毛卡片：只有这一句，点卡片打开那张纸
  },

  // ---- 书页上的界面（bookui.js）
  book: {
    tutorial: 'Frame a pigeon with your hands, like this.',
    tutorialMobile: 'Pinch in on a pigeon and hold still.',
    noCam: 'No camera? Drag a square around a pigeon.',
    skipHint: 'Or look up hard to go on.',          // 第二次示范时接在后面：用力抬头也能往上走
    skipHintKeys: 'Or hold ↑ to go on.',
    up: 'LOOK UP',                                  // 卡片上竖着排，从下往上走；指引也是这两个字往上走
    lookHint: 'Look up to go higher.',   // 该抬头、过一会儿还没抬：出现在旁边
    lookHintKeys: 'Press ↑ to look up.',
    ready: 'Before you look up again, I want to ask you something.',
    yes: 'Ask me',
    done: 'Keep this',
    next: 'Go higher',
    read: 'Next',
    skip: 'Skip',
    inch: 'inch',
  },

  // ---- 每个 section：name（卡片上的小标签）、intro（切到第一只鸽子后卡片背面）、question（最后一页的填空）
  //      sentence 里：___ 是要填的空；[ ] 里是这个构件的名字——填的时候照常显示这个词，
  //      最后那张纸上，这个词换成在这一段切下来的鸽子。height：那张纸左边尺子上写的高度（″）
  // 七句（Kiara 写的）连起来读，是一首从雨棚一直写到天空的诗。介绍只讲一个点（一句话），prompt 是草稿。
  sections: [
    { name: 'Awning',
      intro: 'Before air conditioning, a shop kept cool with canvas.',
      question: { prompt: 'Where do you usually wait for a friend?',
        sentence: 'I waited for a friend under the [awning] of ___.' }, height: 120 },
    { name: 'Ledge & sill',
      intro: 'Pigeons come from rock doves that nested on sea cliffs. To them a building is simply another cliff.',
      question: { prompt: 'What can you see from your window?',
        sentence: 'Past the [ledge] outside my window, I can see ___.' }, height: 180 },
    { name: 'Projecting sign',
      intro: 'A sign that sticks out from the wall turns sideways to talk to people on foot, not in cars.',
      question: { prompt: 'Which shop do you walk past every day?',
        sentence: 'Every day I walk past the [sign] of ___.' }, height: 159 },
    { name: 'Traffic signal',
      intro: 'The mast arm swings the light out over the lane, right where a driver is already looking.',
      question: { prompt: 'What did you think about the last time you waited to cross?',
        sentence: 'Waiting for the [traffic signal] to turn green, I thought about ___.' }, height: 216 },
    { name: 'Fire escape',
      intro: 'In 1867 New York began requiring fire escapes on tenements.',
      question: { prompt: 'What have you seen people do on a fire escape?',
        sentence: 'I’ve seen people use the [fire escape] to ___.' }, height: 300 },
    { name: 'Streetlight',
      intro: 'Broadway was lit by electric arc lamps in 1880.',
      question: { prompt: 'Where were you walking, late one night?',
        sentence: 'Late one night, under the [streetlight], I was walking to ___.' }, height: 348 },
    { name: 'In flight',
      intro: 'A pigeon can find its way home from very far away.',
      question: { prompt: 'What color was the sky the last time you looked up?',
        sentence: 'When I looked up, the [sky] was ___.' }, height: 960 },
  ],

  // ---- 每一页卡片上的历史照片：切到这一页的鸽子以后，卡片翻过来是这一句（组号 → 一句）
  // 只写图注上有的、或者有把握的事；不确定的就不写
  photoIntros: {
    '35': 'Before air conditioning, a shop kept cool with canvas.',
    '43': 'The glass canopy at Zero Irving on East 14th Street, photographed in 2023.',
    '45': 'James and Karla Murray have spent decades photographing New York storefronts and their signs.',
    '51': 'Some signs outgrow their shops. The Hollywood Sign, 2013.',
    '55': 'Berenice Abbott photographed this poultry shop in 1937 for Changing New York.',
    '39': 'Helen Levitt photographed the streets of New York, mostly children at play.',
    '53': 'André Kertész photographed this glass bust on his window in 1978.',
    '59': 'The same corner in the 1950s, under the Academy of Music’s marquee.',
    '63': 'Berkeley, 1968. A man climbs onto the traffic light at Haste and Telegraph.',
    '49': 'In 1934 the city photographed the backs of tenements, with people sitting out on the fire escapes.',
    '67': 'On hot nights people slept on the fire escapes. Weegee, around 1938.',
    '69': 'Two men balance between a fire escape and a utility line.',
    '47': 'Tom Otterness’s small bronze figures in Nelson Rockefeller Park, among the Type B lampposts.',
    '71': 'Around 1910, lamp trimmers climbed up to service each arc lamp by hand.',
    '73': 'Mark Handforth’s Lamppost, made for the Public Art Fund in 2003.',
    '75': 'Alexander Rodchenko pointed his camera straight up a fire escape in Moscow, 1925.',
    '77': 'Lewis Hine photographed the men who built the Empire State Building. He called this one Icarus.',
  },

  // ---- 书：每个 section 之前的指引（现在屏幕上只出现往上走的 LOOK UP，这些句子不用了）（一句比一句往上）。顺序和 config.book.sections 一样
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
  answerNote: 'Your answers stay on this computer.',
  answerHint: 'Enter to keep · Esc to skip',
  answerHintMobile: 'Return to keep · tap outside to skip',

  last: 'Now look up from your screen.',

  // ---- 羽毛图纸背面
  sheet: {
    // 最后的纸（js/sheet.js）
    title: 'Look Up',
    download: 'Download A4',
    print: 'Print',
    close: 'Close',
    home: 'Back to the start',                     // 结尾（天空里）那张纸下面：回到 dashboard
    fold: 'Folding steps',
    // 旧版（没有书页时）的背面
    heights: 'Pigeons you found',
    answers: 'Your answers',
    none: 'None this time.',
  },
};
