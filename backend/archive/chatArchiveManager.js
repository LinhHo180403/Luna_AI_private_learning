const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class ChatArchiveError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'ChatArchiveError';
    this.cause = cause;
  }
}

function createChatArchiveManager(filePath = config.CHAT_ARCHIVE_FILE_PATH, { fileSystem = fs } = {}) {
  const archivePath = path.resolve(__dirname, '..', filePath.replace(/^\.\//, ''));

  function writeArchive(archive) {
    const directory = path.dirname(archivePath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(archivePath)}.${process.pid}.${Date.now()}.tmp`
    );

    try {
      fileSystem.writeFileSync(temporaryPath, JSON.stringify(archive, null, 2), 'utf-8');
      fileSystem.renameSync(temporaryPath, archivePath);
    } catch (err) {
      try {
        if (fileSystem.existsSync(temporaryPath)) fileSystem.unlinkSync(temporaryPath);
      } catch {
        // Preserve the original write error; temporary cleanup is best effort.
      }
      throw new ChatArchiveError('Chat archive could not be written.', err);
    }
  }

  function ensureArchiveFile() {
    const directory = path.dirname(archivePath);
    if (!fileSystem.existsSync(directory)) fileSystem.mkdirSync(directory, { recursive: true });
    if (!fileSystem.existsSync(archivePath)) writeArchive({ version: 1, conversations: [] });
  }

  function readArchive() {
    ensureArchiveFile();
    try {
      const archive = JSON.parse(fileSystem.readFileSync(archivePath, 'utf-8'));
      if (!archive || archive.version !== 1 || !Array.isArray(archive.conversations)) {
        throw new ChatArchiveError('Chat archive has an unsupported format.');
      }
      return archive;
    } catch (err) {
      if (err instanceof ChatArchiveError) throw err;
      throw new ChatArchiveError('Chat archive could not be read.', err);
    }
  }

  function appendConversationTurn({ sessionId, userMessage, assistantMessage, assistantSource = 'unknown' }) {
    if (!sessionId || typeof userMessage !== 'string' || typeof assistantMessage !== 'string') {
      throw new ChatArchiveError('Chat archive turn is invalid.');
    }

    const archive = readArchive();
    const timestamp = new Date().toISOString();
    let conversation = archive.conversations.find((item) => item.id === sessionId);
    if (!conversation) {
      conversation = { id: sessionId, createdAt: timestamp, updatedAt: timestamp, messages: [] };
      archive.conversations.push(conversation);
    }

    conversation.messages.push(
      { role: 'user', content: userMessage, timestamp },
      { role: 'assistant', content: assistantMessage, source: assistantSource, timestamp }
    );
    conversation.updatedAt = timestamp;
    writeArchive(archive);
    return conversation;
  }

  return { archivePath, readArchive, appendConversationTurn };
}

const chatArchiveManager = createChatArchiveManager();

module.exports = { ChatArchiveError, createChatArchiveManager, chatArchiveManager };
