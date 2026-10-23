import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeSseResponse } from '../src/core/sseClient.js';

function responseFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }));
}

test('consumeSseResponse handles split CRLF blocks, multiple events, and final block', async () => {
  const events = [];
  await consumeSseResponse(responseFromChunks([
    'event: token\r\ndata: {"token":"He',
    'llo"}\r\n\r\nevent: error\ndata: {"error":"x"}\n\n',
    'event: done\ndata: {"response":{"reply":"Hello"}}',
  ]), (event, payload) => events.push([event, payload]));
  assert.deepEqual(events, [
    ['token', { token: 'Hello' }],
    ['error', { error: 'x' }],
    ['done', { response: { reply: 'Hello' } }],
  ]);
});

test('consumeSseResponse rejects malformed JSON and unreadable bodies', async () => {
  await assert.rejects(
    () => consumeSseResponse(responseFromChunks(['event: token\ndata: {bad}\n\n']), () => {}),
    /Streaming response có dữ liệu không hợp lệ\./,
  );
  await assert.rejects(
    () => consumeSseResponse({}, () => {}),
    /Streaming response không có readable body\./,
  );
});
