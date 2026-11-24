const fs = require('fs/promises');
const path = require('path');
jest.mock('../src/config/supabaseClient', () => ({ storage: { from: jest.fn(() => ({ upload: jest.fn(async () => ({ error: null })), getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://offline.invalid/diagram.png' } })) })) } }));
jest.mock('../src/services/structuredAiService', () => ({ requestJson: jest.fn() }));
const { docxText, questionChunks } = require('../src/services/parserService');

describe('Actual repository DOCX question-bank fixtures (offline storage)', () => {
  test.each(['operating system Question bank.docx', 'Consolidated QB CO&ARM.docx'])('keeps %s within safe chunks without giant HTML tables', async name => {
    const buffer = await fs.readFile(path.join(__dirname, '..', '..', name));
    const { text, imageMap } = await docxText(buffer, 'offline');
    const chunks = questionChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every(chunk => Buffer.byteLength(chunk) <= 9000)).toBe(true);
    expect(text).not.toMatch(/<table>/i);
    for (const placeholder of Object.keys(imageMap)) expect(text).toContain(placeholder);
    if (name.startsWith('operating')) expect(Object.keys(imageMap).length).toBeGreaterThan(0);
  });
});
