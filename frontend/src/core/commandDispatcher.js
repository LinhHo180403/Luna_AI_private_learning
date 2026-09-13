export const CommandTypes = Object.freeze({
  OPEN_GAME: 'OPEN_GAME',
  CLOSE_GAME: 'CLOSE_GAME',
  CHANGE_EMOTION: 'CHANGE_EMOTION',
  CHANGE_ANIMATION: 'CHANGE_ANIMATION',
  SPEAK: 'SPEAK',
  UPDATE_MEMORY: 'UPDATE_MEMORY',
  SHOW_PLAN: 'SHOW_PLAN',
  CLEAR_CHAT: 'CLEAR_CHAT',
});

export function dispatchCommands(commands, handlers) {
  if (!Array.isArray(commands) || commands.length === 0) return;
  for (const command of commands) {
    dispatchOne(command, handlers);
  }
}

function dispatchOne(command, handlers) {
  const { type, payload } = command || {};
  switch (type) {
    case CommandTypes.OPEN_GAME:
      handlers.setActiveGame?.({ game: payload.game, id: payload.id, status: 'open' });
      break;
    case CommandTypes.CLOSE_GAME:
      handlers.setActiveGame?.((prev) => (prev && prev.game === payload.game ? null : prev));
      break;
    case CommandTypes.CHANGE_EMOTION:
      handlers.setEmotion?.(payload.emotion);
      break;
    case CommandTypes.CHANGE_ANIMATION:
      handlers.setAnimation?.(payload.animation);
      break;
    case CommandTypes.SPEAK:
      handlers.speak?.(payload.text);
      break;
    case CommandTypes.UPDATE_MEMORY:
      handlers.setMemory?.(payload.memory);
      break;
    case CommandTypes.SHOW_PLAN:
      handlers.setPlan?.(payload.plan);
      break;
    case CommandTypes.CLEAR_CHAT:
      handlers.clearChat?.();
      break;
    default:
      console.warn(`[commandDispatcher] Command type không rõ, bỏ qua: "${type}"`);
  }
}
