function isDebugEnabled() {
  return require('../config/config').DEBUG_LOG;
}

function write(method, message, meta, { always = false } = {}) {
  if (!always && !isDebugEnabled()) return;
  if (meta === undefined) {
    console[method](message);
    return;
  }
  console[method](message, meta);
}

module.exports = {
  debug(message, meta) {
    write('log', `[debug] ${message}`, meta);
  },
  info(message, meta) {
    write('log', `[info] ${message}`, meta);
  },
  warn(message, meta) {
    write('warn', `[warn] ${message}`, meta);
  },
  error(message, meta) {
    write('error', `[error] ${message}`, meta, { always: true });
  },
};
