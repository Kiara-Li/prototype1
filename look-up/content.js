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

  calibrate: 'Look at the screen.',
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

  last: 'Now look up from your screen.',

  // ---- 羽毛图纸背面
  sheet: {
    heights: 'Pigeons you found',
    answers: 'Your answers',
    none: 'None this time.',
  },
};
