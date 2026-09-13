const CommandTypes = require('./commandTypes');

const VALID_EMOTIONS = ['happy', 'shy', 'excited', 'sad', 'curious', 'neutral'];
const VALID_ANIMATIONS = ['wave', 'talk', 'thinking', 'idle'];

class ResponseBuilder {
  constructor() {
    this._reply = '';
    this._source = 'unknown';
    this._emotion = 'neutral';
    this._animation = 'idle';
    this._voice = true;
    this._commands = [];
    this._memory = null;
    this._data = null;
  }

  setReply(text) {
    this._reply = typeof text === 'string' ? text : String(text ?? '');
    return this;
  }

  setSource(source) {
    this._source = source || 'unknown';
    return this;
  }

  setEmotion(emotion) {
    this._emotion = VALID_EMOTIONS.includes(emotion) ? emotion : 'neutral';
    return this;
  }

  setAnimation(animation) {
    this._animation = VALID_ANIMATIONS.includes(animation) ? animation : 'idle';
    return this;
  }

  setVoice(enabled) {
    this._voice = Boolean(enabled);
    return this;
  }

  addCommand(type, payload = {}) {
    if (!CommandTypes[type]) {
      throw new Error(`ResponseBuilder: command type không hợp lệ: "${type}"`);
    }
    this._commands.push({ type, payload });
    return this;
  }

  setMemory(memoryPatch) {
    this._memory = memoryPatch;
    return this;
  }

  setData(data) {
    this._data = data;
    return this;
  }

  build() {
    return {
      reply: this._reply,
      source: this._source,
      emotion: this._emotion,
      animation: this._animation,
      voice: this._voice,
      commands: this._commands,
      memory: this._memory,
      data: this._data,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = ResponseBuilder;
module.exports.VALID_EMOTIONS = VALID_EMOTIONS;
module.exports.VALID_ANIMATIONS = VALID_ANIMATIONS;
