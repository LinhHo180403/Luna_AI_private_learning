const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');
const CommandTypes = require('../core/commandTypes');

const OPEN_PATTERNS = [
  /chơi (rắn|ran san moi|rắn săn mồi)/i,
  /mở (game )?rắn/i,
  /play snake/i,
  /open snake/i,
];

const CLOSE_PATTERNS = [
  /(đóng|dong|tắt|tat) (game )?rắn/i,
  /close snake/i,
  /stop snake/i,
  /thoát rắn/i,
];

const SNAKE_AI_COMMENTARY = {
  eating: [
    { vi: 'Ăn được rồi nè, ngon quá! 😋', en: 'Got one, yum!' },
    { vi: 'Táo này là của Luna!', en: 'That apple is mine now!' },
    { vi: 'Một điểm nữa cho Luna~', en: 'One more point for Luna~' },
  ],
  closeCall: [
    { vi: 'Suýt nữa thì đụng tường rồi đó!', en: 'Almost hit the wall there!' },
    { vi: 'Né kịp trong gang tấc!', en: 'Dodged that by a hair!' },
  ],
  gameOver: [
    { vi: 'Ối, Luna va vào chính mình rồi 😅', en: 'Oops, ran into myself!' },
    { vi: 'Thua rồi, chơi lại nha!', en: "Game over, let's go again!" },
  ],
  idle: [
    { vi: 'Đang tìm đường đi ngon nhất đây...', en: 'Plotting the best route...' },
    { vi: 'Rắn Luna đang bò tới mục tiêu!', en: 'Slithering toward the target!' },
  ],
};

function pickRandomCommentary(category) {
  const pool = SNAKE_AI_COMMENTARY[category] || SNAKE_AI_COMMENTARY.idle;
  return pool[Math.floor(Math.random() * pool.length)];
}

class SnakeSkill extends Skill {
  constructor() {
    super('SnakeSkill');
  }

  canHandle(context) {
    const msg = (context.message || '').trim();
    if (!msg) return false;
    return (
      OPEN_PATTERNS.some((re) => re.test(msg)) ||
      CLOSE_PATTERNS.some((re) => re.test(msg))
    );
  }

  async handle(context) {
    const msg = (context.message || '').trim();
    const builder = new ResponseBuilder().setSource('snake');
    const gameId = `snake-${Date.now()}`;

    if (OPEN_PATTERNS.some((re) => re.test(msg))) {
      return builder
        .setReply('Được thôi, Luna mở game Rắn săn mồi liền đây! 🐍')
        .setEmotion('excited')
        .setAnimation('wave')
        .addCommand(CommandTypes.OPEN_GAME, { game: 'snake', type: 'open', id: gameId })
        .build();
    }

    if (CLOSE_PATTERNS.some((re) => re.test(msg))) {
      return builder
        .setReply('Luna đóng game Rắn lại nha, hẹn chơi lại sau!')
        .setEmotion('neutral')
        .setAnimation('idle')
        .addCommand(CommandTypes.CLOSE_GAME, { game: 'snake', type: 'close', id: gameId })
        .build();
    }

    return builder.setReply('Luna chưa hiểu bạn muốn làm gì với game Rắn.').build();
  }
}

module.exports = SnakeSkill;
module.exports.pickRandomCommentary = pickRandomCommentary;
module.exports.SNAKE_AI_COMMENTARY = SNAKE_AI_COMMENTARY;
