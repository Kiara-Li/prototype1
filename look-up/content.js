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
    about: 'about this project',
    aboutUrl: 'https://kiarali.com',                // TODO 之后换成只介绍这个项目的页面
    feather: 'see your feather and how to fold it',
    featherLocked: 'look all the way up to unlock this',
    headline: ['LOOK UP!', 'AN ART', 'EXPERIMENT', 'THAT HAS YOU', 'LOOK UP', 'TO FIND THE', 'PIGEONS HIDING', 'IN THE CITY.'],
    // 卡片四周：左上一组（横 + 竖）连成一句，右下一组连成一句；不再重复左边标题那句
    edgeTL: ['pigeons live at every height of this city,', 'most of them above your eyes.'],
    edgeBR: ['so look up, slowly, one height at a time,', 'and find the ones looking down.'],
    tipsTitle: 'a few tips',
    tips: [                                            // 每条一行（右栏大约 30 个字母）
      'Camera on. Nothing is saved.',
      'Phone or computer, both work.',
      'Do the hand gestures shown.',
      'Heads up: lots of birds.',
      'Sit somewhere with good light.',
      'Press F for full screen.',
    ],
    chaptersLocked: 'chapters! unlock them by looking all the way up',
    chaptersOpen: 'chapters! hover over one to take a peek',
    // 卡片
    congrats: ['congrats! you found', 'this feather! you are', 'invited to play with', 'this website!'],
    play: 'let’s play!',
    two: ['there are only two', 'actions you need', 'to play around'],
    first: 'the first one',
    head: ['now move your', 'head up to'],
    lookUp: 'LOOK UP',
    nice: ['Nice work!', 'remember to look', 'up to keep', 'scrolling'],
    second: 'the second one',
    hands: ['follow the hands on', 'the bottom left and', 'top right to take a', 'peek! now it starts!'],
    go: 'continue',
    noCamUp: 'no camera? press ↑',
    noCamHands: 'no camera? click the card',
    featherFace: ['this is your feather.', 'print it, fold it, keep it.'],
  },

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
