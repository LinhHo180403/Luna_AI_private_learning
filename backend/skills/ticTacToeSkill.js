const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');
const CommandTypes = require('../core/commandTypes');

const OPEN_PATTERNS = [
  /chơi (cờ )?(ca rô|caro|ca-rô)/i,
  /chơi gomoku/i,
  /mở (game )?(cờ )?(ca ?rô|caro)/i,
  /play (tic ?tac ?toe|gomoku)/i,
  /open (tic ?tac ?toe|gomoku)/i,
];

const CLOSE_PATTERNS = [
  /(đóng|dong|tắt|tat) (game )?(cờ )?(ca ?rô|caro)/i,
  /close (tic ?tac ?toe|gomoku)/i,
  /stop (tic ?tac ?toe|gomoku)/i,
  /thoát (cờ )?(ca ?rô|caro)/i,
];

class TicTacToeSkill extends Skill {
  constructor() {
    super('TicTacToeSkill');
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
    const builder = new ResponseBuilder().setSource('tictactoe');
    const gameId = `tictactoe-${Date.now()}`;

    if (OPEN_PATTERNS.some((re) => re.test(msg))) {
      return builder
        .setReply('Cờ ca-rô nha! Luna mở game liền, coi ai thắng ai thua 😏')
        .setEmotion('excited')
        .setAnimation('wave')
        .addCommand(CommandTypes.OPEN_GAME, { game: 'tictactoe', type: 'open', id: gameId })
        .build();
    }

    if (CLOSE_PATTERNS.some((re) => re.test(msg))) {
      return builder
        .setReply('Đóng game Cờ ca-rô lại nhé, chơi lại lúc khác!')
        .setEmotion('neutral')
        .setAnimation('idle')
        .addCommand(CommandTypes.CLOSE_GAME, { game: 'tictactoe', type: 'close', id: gameId })
        .build();
    }

    return builder.setReply('Luna chưa hiểu bạn muốn làm gì với game Cờ ca-rô.').build();
  }
}

module.exports = TicTacToeSkill;
