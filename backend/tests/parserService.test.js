jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('axios', () => ({ get: jest.fn(() => { throw new Error('Unexpected network access'); }) }));
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({
  convertToHtml: jest.fn(),
  images: { imgElement: jest.fn(callback => callback) }
}));
jest.mock('../src/config/supabaseClient', () => ({
  storage: { from: jest.fn() }
}));
jest.mock('../src/services/structuredAiService', () => ({ requestJson: jest.fn() }));

const fs = require('fs/promises');
const axios = require('axios');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const supabase = require('../src/config/supabaseClient');
const { requestJson } = require('../src/services/structuredAiService');
const { parseFile, normalizeQuestion, questionChunks, parseQuestionText } = require('../src/services/parserService');

const localPath = 'G:/Projects/qpgen/backend/tests/mock-question-bank';
const syllabus = { courseOutcomes: [
  { id: 'CO7', description: 'Calculate resistor current', modules: ['M1'] },
  { id: 'CO8', description: 'Explain capacitor charging', modules: ['M2'] }
] };
const csvLine = cells => cells.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');

beforeEach(() => {
  jest.resetAllMocks();
  mammoth.images.imgElement.mockImplementation(callback => callback);
  axios.get.mockImplementation(() => { throw new Error('Unexpected network access'); });
});
afterEach(() => {
  expect(axios.get).not.toHaveBeenCalled();
});

describe('Local structured question-bank formats', () => {
  test('parses real CSV offline, normalizes M1/1/Unit 2 and preserves original mismatched tags', async () => {
    const text = [
      csvLine(['Question Text', 'Marks', 'BTL', 'CO', 'Module']),
      csvLine(['1. Calculate resistor current at 12 V and 6 ohms. [L6] [CO99]', 5, 'L6', 'CO99', 'M1']),
      csvLine(['Define resistor current and its standard SI unit.', 2, 'L1', 'CO7', '1']),
      csvLine(['Explain capacitor charging for the given 25 ms observation.', 4, 'L2', 'CO8', 'Unit 2']),
      csvLine(['12345', 2, 'L1', '', 'M1'])
    ].join('\n');
    fs.readFile.mockResolvedValue(Buffer.from(text));
    const questions = await parseFile(localPath, '.csv', 'tenant-offline', syllabus);
    expect(questions).toHaveLength(3);
    expect(questions.map(q => q.module)).toEqual(['M1', 'M1', 'M2']);
    expect(questions[0]).toMatchObject({
      questionText: 'Calculate resistor current at 12 V and 6 ohms.',
      marks: 5, btl: 'L3', originalBtl: 'L6', originalCo: 'CO99',
      co: 'CO7', coMappingSource: 'syllabus-keywords-provisional', reviewRequired: true
    });
    expect(questions[2]).toMatchObject({ btl: 'L2', co: 'CO8', originalCo: 'CO8' });
    expect(fs.readFile).toHaveBeenCalledWith(localPath);
    expect(requestJson).not.toHaveBeenCalled();
  });

  test('reads every XLSX sheet, including after an empty sheet, and removes cross-sheet duplicates', async () => {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
      { Question: 'Calculate resistor current for 24 V and 8 ohms.', Mark: 5, RBT: 'L6', Course_Outcome: 'CO99', Unit: '1' }
    ]), 'Unit one');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([]), 'Empty');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
      { Question: 'Explain capacitor charging for a 100 microfarad capacitor.', Marks: 4, Bloom_Level: 'L2', CO: 'CO8', Module_Number: 'Unit 2' },
      { Question: 'Calculate resistor current for 24 V and 8 ohms.', Marks: 5, BTL: 'L3', Module: 'M1' }
    ]), 'Unit two');
    fs.readFile.mockResolvedValue(xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const questions = await parseFile(localPath, '.XLSX', 'tenant-offline', syllabus);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ btl: 'L3', originalBtl: 'L6', originalCo: 'CO99', module: 'M1', marks: 5 });
    expect(questions[1]).toMatchObject({ module: 'M2', btl: 'L2', marks: 4 });
    expect(questions[1].questionText).toContain('100 microfarad');
    expect(requestJson).not.toHaveBeenCalled();
  });

  test('preserves multiline CSV Markdown tables and numerical scenario values', async () => {
    const question = '1. Calculate resistor current using the table.\n\n| Voltage (V) | Resistance (ohm) |\n| --- | --- |\n| 12.5 | 6.25 |\n\n(a) Compute the current. [L6] [5 marks]';
    fs.readFile.mockResolvedValue(Buffer.from([
      csvLine(['Question', 'Unit']), csvLine([question, 'Unit 2'])
    ].join('\n')));
    const [parsed] = await parseFile(localPath, '.csv', 'tenant-offline');
    expect(parsed.questionText).toContain('| 12.5 | 6.25 |');
    expect(parsed.questionText).toContain('(a) Compute the current.');
    expect(parsed.questionText).not.toMatch(/\[L6\]|\[5 marks\]|^1\./);
    expect(parsed).toMatchObject({ btl: 'L3', originalBtl: 'L6', marks: 5, module: 'M2', co: null, reviewRequired: true });
  });

  test('rejects an unsupported format and a CSV without valid questions', async () => {
    fs.readFile.mockResolvedValue(Buffer.from('Question,Marks\n12345,2'));
    await expect(parseFile(localPath, '.zip', 'tenant-offline')).rejects.toMatchObject({ status: 400 });
    await expect(parseFile(localPath, '.csv', 'tenant-offline')).rejects.toMatchObject({ status: 422 });
  });
});

describe('Question normalization', () => {
  test('strips only serial numbers and tags, not the actual numbers or equations', () => {
    expect(normalizeQuestion({
      questionText: '12. Calculate resistor current with V = 12.5 V and R = 6.25 ohms. [L6] [CO99] [5 marks]',
      module: '1'
    })).toMatchObject({
      questionText: 'Calculate resistor current with V = 12.5 V and R = 6.25 ohms.',
      btl: 'L3', originalBtl: 'L6', originalCo: 'CO99', co: null,
      coMappingSource: 'unavailable', marks: 5, module: 'M1', reviewRequired: true
    });
  });

  test.each([0, -1, 101, 2.5, 'invalid'])('leaves invalid imported marks %p unresolved', marks => {
    expect(normalizeQuestion({ question: 'Define resistor current.', marks, module: 'M1' })).toMatchObject({ marks: null, reviewRequired: true });
  });

  test.each(['', '   ', '1234', '---'])('drops non-question rows %p', question => {
    expect(normalizeQuestion({ question })).toBeNull();
  });
});

describe('Question-safe chunking and mocked text extraction', () => {
  test('keeps a main question with its table and lettered subparts within the byte bound', () => {
    const first = '1. Calculate current using these measurements.\n| V | R |\n| --- | --- |\n| 12 | 6 |\na) Calculate current.\nb) Calculate power.\n';
    const second = '2. Explain capacitor charging with a 20 ms time constant.\n';
    const chunks = questionChunks(first + second, 150);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain(first);
    expect(chunks[0]).toContain('| 12 | 6 |');
    expect(chunks[0]).toContain('b) Calculate power.');
    expect(chunks[1]).toContain(second);
    for (const chunk of chunks) expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(150);
  });

  test('recognizes module headings and numbering restarts', () => {
    const text = 'Unit 1\n1. Define resistance.\n2. Explain current.\nUnit 2\n1. Define capacitance.\n';
    expect(questionChunks(text, 60).join('').trimEnd()).toBe(text.trimEnd());
    expect(questionChunks(text, 60).length).toBeGreaterThan(1);
  });

  test('rejects an oversized Unicode question block instead of splitting its table or text', () => {
    expect(() => questionChunks(`1. Explain 电阻 ${'电'.repeat(40)}`, 100)).toThrow(/block is too large/);
    try {
      questionChunks(`1. Explain ${'x'.repeat(9000)}`);
    } catch (error) {
      expect(error.status).toBe(413);
    }
  });

  test('preserves numeric data and tables and carries the previous module into continuation chunks', async () => {
    const table = '| V | R |\n| --- | --- |\n| 12 | 6 |';
    const first = `1. Calculate current using this table.\n${table}\n(a) Compute current.\n${'x'.repeat(4500)}\n`;
    const second = `2. Explain capacitor charging at 25 ms.\n${'y'.repeat(4500)}\n`;
    const extracted = `Calculate current using this table.\n${table}\n(a) Compute current.`;
    requestJson
      .mockResolvedValueOnce({ questions: [{ questionText: extracted, module: 'Unit 2', marks: 5, btl: 'L6', co: 'CO99' }] })
      .mockResolvedValueOnce({ questions: [{ questionText: 'Explain capacitor charging at 25 ms.', module: null, marks: 4 }] });
    const questions = await parseQuestionText(first + second);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ questionText: extracted, module: 'M2', btl: 'L6', co: 'CO99' });
    expect(questions[1]).toMatchObject({ module: 'M2', questionText: 'Explain capacitor charging at 25 ms.' });
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(requestJson.mock.calls[1][0].prompt).toContain('Previous module: M2');
    expect(requestJson.mock.calls[0][0].prompt).toContain(table);
  });

  test.each([
    [{}, /invalid schema/],
    [{ questions: [] }, /omitted a nonempty question/],
    [{ questions: [{ questionText: '' }] }, /empty question/]
  ])('rejects unusable extraction output %p', async (output, message) => {
    requestJson.mockResolvedValueOnce(output);
    await expect(parseQuestionText('1. What is electrical resistance?')).rejects.toThrow(message);
  });

  test('rejects empty input and the 80-chunk overflow before AI requests', async () => {
    await expect(parseQuestionText(' \n')).rejects.toMatchObject({ status: 422 });
    const text = Array.from({ length: 81 }, (_, n) => `${n + 1}. Explain resistance? ${'x'.repeat(5000)}\n`).join('');
    await expect(parseQuestionText(text)).rejects.toMatchObject({ status: 413 });
    expect(requestJson).not.toHaveBeenCalled();
  });

  test.each(['txt', 'pdf'])('uses the mocked AI boundary for local %s input', async ext => {
    fs.readFile.mockResolvedValue(Buffer.from('1. Calculate current at 12 V and 6 ohms.'));
    pdfParse.mockResolvedValue({ text: '1. Calculate current at 12 V and 6 ohms.' });
    requestJson.mockResolvedValueOnce({ questions: [{ questionText: 'Calculate current at 12 V and 6 ohms.', module: '1', marks: 5, btl: 'L6' }] });
    const [question] = await parseFile(localPath, `.${ext}`, 'tenant-offline');
    expect(question).toMatchObject({ btl: 'L3', originalBtl: 'L6', module: 'M1' });
    expect(question.questionText).toContain('12 V and 6 ohms');
  });
});

describe('Image preservation without storage or provider calls', () => {
  const placeholder = '__IMAGE_PLACEHOLDER_0__';
  const image = '![Circuit](https://example.invalid/images/circuit.png)';

  test('restores every occurrence of a supplied image placeholder', async () => {
    requestJson.mockResolvedValueOnce({ questions: [{ questionText: `Analyze this circuit ${placeholder} and compare it with ${placeholder}.`, module: 'M1' }] });
    const [question] = await parseQuestionText(`1. Analyze this circuit ${placeholder}.`, { [placeholder]: image });
    expect(question.questionText.split(image)).toHaveLength(3);
    expect(question.questionText).not.toContain(placeholder);
  });

  test('rejects dropped and unresolved images rather than silently losing diagrams', async () => {
    requestJson.mockResolvedValueOnce({ questions: [{ questionText: 'Analyze this circuit.', module: 'M1' }] });
    await expect(parseQuestionText(`1. Analyze this circuit ${placeholder}.`, { [placeholder]: image })).rejects.toThrow(/dropped a source image/);
    requestJson.mockResolvedValueOnce({ questions: [{ questionText: `Analyze this circuit ${placeholder}.`, module: 'M1' }] });
    await expect(parseQuestionText(`1. Analyze this circuit ${placeholder}.`)).rejects.toThrow(/unresolved image/);
  });

  test('DOCX conversion preserves its diagram and table through mocked upload and extraction', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.invalid/images/circuit.png' } });
    supabase.storage.from.mockReturnValue({ upload, getPublicUrl });
    fs.readFile.mockResolvedValue(Buffer.from('offline docx'));
    mammoth.convertToHtml.mockImplementationOnce(async (_input, options) => {
      const converted = await options.convertImage({
        contentType: 'image/png', read: jest.fn().mockResolvedValue(Buffer.from('diagram').toString('base64'))
      });
      return { value: `<p>1. Analyze the circuit.</p><p><img alt="Circuit" src="${converted.src}" /></p><table><tr><th>V</th><th>R</th></tr><tr><td>12</td><td>6</td></tr></table>` };
    });
    requestJson.mockImplementationOnce(async ({ prompt }) => {
      expect(prompt).toContain(placeholder);
      expect(prompt).toMatch(/\|\s*12\s*\|\s*6\s*\|/);
      return { questions: [{ questionText: `Analyze the circuit ${placeholder}.\n| V | R |\n| --- | --- |\n| 12 | 6 |`, module: 'M1', marks: 8, btl: 'L1' }] };
    });
    const [question] = await parseFile(localPath, '.docx', 'tenant-offline');
    expect(question.questionText).toContain(image);
    expect(question.questionText).toContain('| 12 | 6 |');
    expect(question).toMatchObject({ btl: 'L4', originalBtl: 'L1', reviewRequired: true });
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^tenant-offline\/[a-f0-9]{64}\.png$/), Buffer.from('diagram'), { contentType: 'image/png', upsert: true });
    expect(getPublicUrl).toHaveBeenCalledTimes(1);
  });

  test('fails clearly when a mocked DOCX diagram upload fails', async () => {
    supabase.storage.from.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: new Error('offline failure') }) });
    fs.readFile.mockResolvedValue(Buffer.from('offline docx'));
    mammoth.convertToHtml.mockImplementationOnce(async (_input, options) => {
      await options.convertImage({ contentType: 'image/png', read: jest.fn().mockResolvedValue('aW1hZ2U=') });
      return { value: '' };
    });
    await expect(parseFile(localPath, '.docx', 'tenant-offline')).rejects.toThrow(/Failed to store a question diagram/);
    expect(requestJson).not.toHaveBeenCalled();
  });
});
