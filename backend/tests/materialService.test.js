jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));
jest.mock('pdf-parse', () => jest.fn());
jest.mock('../src/services/aiKeyManager', () => ({ executeWithAI: jest.fn() }));
jest.mock('../src/services/structuredAiService', () => ({
  ...jest.requireActual('../src/services/structuredAiService'),
  requestJson: jest.fn()
}));

const fs = require('fs/promises');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { requestJson, chunkText } = require('../src/services/structuredAiService');
const { extractDocument, validateSyllabus, parseSyllabus, parseNotes } = require('../src/services/materialService');

const source = 'Module 1\nResistor networks; Kirchhoff equations\nUnit 2\nCapacitor charging\nCO7: Analyze resistor networks\nCO8: Explain capacitor charging';
function extractedSyllabus() {
  return {
    modules: [
      { moduleNumber: '1', topics: [' Resistor networks ', 'Kirchhoff equations', 'Resistor networks'] },
      { moduleNumber: 'Unit 2', topics: ['Capacitor charging'] }
    ],
    courseOutcomes: [
      { id: 'CO7', description: 'Analyze resistor networks', modules: ['1', 'M1', 'M99'] },
      { id: 'CO8', description: 'Explain capacitor charging', modules: ['Unit 2'] }
    ]
  };
}

beforeEach(() => jest.resetAllMocks());

describe('Syllabus extraction provenance', () => {
  test('normalizes source module numbering and deduplicates verbatim topics and outcome scope', () => {
    expect(validateSyllabus(extractedSyllabus(), source)).toEqual({
      modules: [
        { moduleNumber: 'M1', topics: ['Resistor networks', 'Kirchhoff equations'] },
        { moduleNumber: 'M2', topics: ['Capacitor charging'] }
      ],
      courseOutcomes: [
        { id: 'CO7', description: 'Analyze resistor networks', modules: ['M1'] },
        { id: 'CO8', description: 'Explain capacitor charging', modules: ['M2'] }
      ]
    });
  });

  test('permits whitespace/case normalization but not invented or paraphrased topics', () => {
    const data = extractedSyllabus();
    data.modules[0].topics = ['resistor   networks'];
    expect(validateSyllabus(data, source).modules[0].topics).toEqual(['resistor   networks']);
    const invented = extractedSyllabus();
    invented.modules[0].topics.push('Quantum entanglement');
    expect(() => validateSyllabus(invented, source)).toThrow(/appear verbatim/);
    const paraphrased = extractedSyllabus();
    paraphrased.modules[0].topics = ['Networks of resistors'];
    expect(() => validateSyllabus(paraphrased, source)).toThrow(/appear verbatim/);
  });

  test.each([
    { id: 'CO9', description: 'Design an original aircraft' },
    { id: 'Outcome1', description: 'Analyze resistor networks' },
    { id: 'CO9', description: 42 }
  ])('rejects unsupported outcome data %p', outcome => {
    const data = extractedSyllabus();
    data.courseOutcomes.push(outcome);
    expect(() => validateSyllabus(data, source)).toThrow(/not supported/);
  });

  test('rejects duplicate outcomes and malformed outcome arrays', () => {
    const data = extractedSyllabus();
    data.courseOutcomes.push({ ...data.courseOutcomes[0] });
    expect(() => validateSyllabus(data, source)).toThrow(/not supported/);
    expect(() => validateSyllabus({ ...extractedSyllabus(), courseOutcomes: {} }, source)).toThrow(/Invalid course outcomes/);
  });

  test('does not manufacture outcomes when the source has none', () => {
    const data = { modules: [{ moduleNumber: 'M1', topics: ['Resistor networks'] }] };
    expect(validateSyllabus(data, 'Module 1: Resistor networks').courseOutcomes).toEqual([]);
  });

  test.each([
    { modules: [] },
    { modules: [{ moduleNumber: 'M0', topics: ['Resistor networks'] }] },
    { modules: [{ moduleNumber: 'M1', topics: [] }] },
    { modules: [{ moduleNumber: 'M1', topics: [' ', 4] }] },
    { modules: [{ moduleNumber: 'M1', topics: ['Resistor networks'] }, { moduleNumber: '1', topics: ['Kirchhoff equations'] }] }
  ])('rejects empty, invalid or duplicate modules %p', ({ modules }) => {
    expect(() => validateSyllabus({ modules }, source)).toThrow();
  });

  test('merges continuation chunks, ignores an empty administrative chunk and reports provenance', async () => {
    const text = `${'x'.repeat(8000)}\n${source}\n${'y'.repeat(8000)}\nResistor networks`;
    const chunks = chunkText(text, 8000);
    expect(chunks).toHaveLength(4);
    requestJson
      .mockResolvedValueOnce({ modules: [], courseOutcomes: [] })
      .mockResolvedValueOnce(extractedSyllabus())
      .mockResolvedValueOnce({ modules: [], courseOutcomes: [] })
      .mockResolvedValueOnce({ modules: [{ moduleNumber: 'M1', topics: ['Resistor networks'] }], courseOutcomes: [] });
    const parsed = await parseSyllabus(text, 'Circuit analysis');
    expect(parsed.courseTitle).toBe('Circuit analysis');
    expect(parsed.modules.map(mod => mod.moduleNumber)).toEqual(['M1', 'M2']);
    expect(parsed.modules[0].topics).toEqual(['Resistor networks', 'Kirchhoff equations']);
    expect(parsed.extraction).toEqual({ chunksProcessed: 4, totalChunks: 4, sourceCharacters: text.length, topicCount: 3, reviewRequired: true });
    expect(requestJson).toHaveBeenCalledTimes(4);
    expect(requestJson.mock.calls[2][0].prompt).toContain('Previous module for continuation: M2');
    expect(requestJson.mock.calls[0][0].prompt).toContain('source chunk 1/4');
  });

  test('rejects malformed extraction schemas and all-empty syllabus chunks', async () => {
    requestJson.mockResolvedValueOnce({ modules: [], courseOutcomes: null });
    await expect(parseSyllabus(source, 'Circuits')).rejects.toThrow(/invalid syllabus structure/);
    requestJson.mockResolvedValueOnce({ modules: [], courseOutcomes: [] });
    await expect(parseSyllabus(source, 'Circuits')).rejects.toThrow(/No syllabus modules/);
  });

  test('rejects conflicting CO descriptions across chunks even when both occur in source', async () => {
    const text = `Analyze resistor networks\n${'x'.repeat(7980)}\nExplain capacitor charging\nCapacitor charging`;
    requestJson
      .mockResolvedValueOnce({ modules: [{ moduleNumber: 'M1', topics: ['Analyze resistor networks'] }], courseOutcomes: [{ id: 'CO1', description: 'Analyze resistor networks' }] })
      .mockResolvedValueOnce({ modules: [{ moduleNumber: 'M2', topics: ['Capacitor charging'] }], courseOutcomes: [{ id: 'CO1', description: 'Explain capacitor charging' }] });
    await expect(parseSyllabus(text, 'Circuits')).rejects.toThrow(/Conflicting course outcome/);
  });

  test('enforces the 40-chunk bound before making any AI request', async () => {
    await expect(parseSyllabus('x'.repeat(8000 * 41), 'Circuits')).rejects.toThrow(/40-chunk/);
    expect(requestJson).not.toHaveBeenCalled();
  });
});

describe('Notes schema and chunk handling', () => {
  test('retains summaries, formulas, source topics and per-chunk metadata', async () => {
    const text = `Resistor networks: V = I R.\n${'x'.repeat(9950)}\nCapacitor charging: tau = R C.`;
    expect(chunkText(text, 10000)).toHaveLength(2);
    requestJson
      .mockResolvedValueOnce({ summary: 'Resistor networks use V = I R.', keyTopics: ['Resistor networks'] })
      .mockResolvedValueOnce({ summary: 'Capacitor charging has tau = R C.', keyTopics: ['Capacitor charging'] });
    expect(await parseNotes(text)).toEqual({
      summary: 'Resistor networks use V = I R.\n\nCapacitor charging has tau = R C.',
      keyTopics: ['Resistor networks', 'Capacitor charging'],
      sections: [
        { summary: 'Resistor networks use V = I R.', keyTopics: ['Resistor networks'], chunk: 1 },
        { summary: 'Capacitor charging has tau = R C.', keyTopics: ['Capacitor charging'], chunk: 2 }
      ],
      chunksProcessed: 2, totalChunks: 2
    });
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  test.each([
    { summary: '', keyTopics: [] },
    { summary: '   ', keyTopics: [] },
    { summary: null, keyTopics: [] },
    { summary: 'A valid summary', keyTopics: 'Resistor networks' },
    { summary: 'A valid summary', keyTopics: [42] },
    { summary: 'A valid summary', keyTopics: ['Quantum entanglement'] }
  ])('rejects an invalid or ungrounded notes schema %p', response => {
    requestJson.mockResolvedValue(response);
    return expect(parseNotes('Resistor networks use V = I R.')).rejects.toThrow(/invalid or unsupported notes/);
  });

  test('allows a summary with no extracted key topics', async () => {
    requestJson.mockResolvedValue({ summary: 'The notes contain a worked numerical example.', keyTopics: [] });
    expect(await parseNotes('A worked numerical example with V = 12 and R = 6.')).toMatchObject({ keyTopics: [], chunksProcessed: 1 });
  });

  test.each(['', ' \n\n\t'])('returns the empty notes schema without AI calls for %p', async text => {
    expect(await parseNotes(text)).toEqual({ summary: '', keyTopics: [], sections: [], chunksProcessed: 0, totalChunks: 0 });
    expect(requestJson).not.toHaveBeenCalled();
  });

  test('byte-bounded text chunks preserve Unicode and numerical content', () => {
    const text = 'Voltage 12 V\n电阻😀'.repeat(80);
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(100);
      expect(chunk).not.toContain('\uFFFD');
    }
    expect(chunks.join('').replace(/\n/g, '')).toBe(text.replace(/\n/g, ''));
  });
});

describe('Offline material document readers', () => {
  const filePath = 'G:/Projects/qpgen/backend/tests/mock-material';
  const readable = 'Resistor networks use V = I R.\r\nFor 12 V and 6 ohms, current is 2 A.';

  test('reads a local TXT buffer and preserves numerical data', async () => {
    fs.readFile.mockResolvedValue(Buffer.from(readable));
    expect(await extractDocument(filePath, 'notes.TXT')).toBe(readable.replace(/\r/g, ''));
    expect(fs.readFile).toHaveBeenCalledWith(filePath);
    expect(requestJson).not.toHaveBeenCalled();
  });

  test.each(['docx', 'pdf'])('extracts %s with a mocked reader', async ext => {
    const buffer = Buffer.from('offline document');
    fs.readFile.mockResolvedValue(buffer);
    mammoth.extractRawText.mockResolvedValue({ value: readable });
    pdfParse.mockResolvedValue({ text: readable });
    expect(await extractDocument(filePath, `notes.${ext}`)).toContain('12 V and 6 ohms');
    if (ext === 'docx') expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer });
    else expect(pdfParse).toHaveBeenCalledWith(buffer);
  });

  test('rejects unreadable scanned documents and unsupported formats', async () => {
    fs.readFile.mockResolvedValue(Buffer.from('short'));
    await expect(extractDocument(filePath, 'scan.txt')).rejects.toMatchObject({ status: 422 });
    await expect(extractDocument(filePath, 'notes.csv')).rejects.toMatchObject({ status: 400 });
  });

  test('rejects extracted text larger than the UTF-8 byte limit', async () => {
    fs.readFile.mockResolvedValue(Buffer.from('电'.repeat(200001)));
    await expect(extractDocument(filePath, 'notes.txt')).rejects.toMatchObject({ status: 413 });
  });
});
