const { EventEmitter } = require('events');

class LunaEventBus extends EventEmitter {}

const eventBus = new LunaEventBus();
eventBus.setMaxListeners(50);

module.exports = eventBus;
