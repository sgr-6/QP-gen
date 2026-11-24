jest.mock('../src/config/firebaseAdmin', () => ({
  db: {
    collection: jest.fn()
  },
  admin: {}
}));

jest.mock('../src/services/structuredAiService', () => ({ requestJson: jest.fn() }));
const { db } = require('../src/config/firebaseAdmin');
const { requestJson } = require('../src/services/structuredAiService');
const { generatePaper, buildValidSplit, validateAcademicRigor, getL1L2Marks } = require('../src/services/paperGeneratorService');
const slotsFromPrompt = prompt => JSON.parse(prompt.match(/^SLOTS: (.+)$/m)[1]);
const answerSlots = prompt => ({ questions: slotsFromPrompt(prompt).map(slot => ({ slotId: slot.slotId, questionText: `Calculate the current using Ohm's law for a 12 V source and 6 ohm resistor in case ${slot.slotId}.`, co: 'CO99' })) });
const approvedBank = (marks = [5, 15, 10]) => Array.from({ length: 5 }, (_, module) => marks.map((mark, index) => ({ id: `${module}_${index}`, module: `M${module + 1}`, btl: index === 0 ? 'L1' : 'L3', marks: mark, co: 'CO1', reviewStatus: 'approved', questionText: `${index === 0 ? 'State' : 'Calculate'} the circuit quantities for supplied resistor network case ${module}_${index}.` }))).flat();

function mockPaperSources(questions, { syllabus = true } = {}) {
  const bank = { data: () => ({ subjectCode: 'TEST' }), ref: { collection: () => ({ get: async () => ({ size: questions.length, forEach: callback => questions.forEach(question => callback({ id: question.id, data: () => question })) }) }) } };
  const banks = { where: jest.fn().mockReturnThis(), get: async () => ({ empty: !questions.length, docs: questions.length ? [bank] : [] }) };
  db.collection.mockImplementation(name => {
    if (name === 'question_banks') return banks;
    if (name === 'syllabi') return { doc: () => ({ get: async () => ({ exists: syllabus, data: () => ({ courseTitle: 'Circuits', modules: Array.from({ length: 5 }, (_, index) => ({ moduleNumber: `M${index + 1}`, topics: ['Resistor networks'] })), courseOutcomes: [] }) }) }) };
    if (name === 'notes') return { doc: () => ({ get: async () => ({ exists: false }) }) };
    throw new Error(`Unexpected collection ${name}`);
  });
}

describe('L1–L3 paper policy', () => {
  beforeEach(() => { jest.clearAllMocks(); requestJson.mockReset(); });
  test('excludes higher-level bank questions from deterministic paper selection', async () => {
    const questions = Array.from({ length: 5 }, (_, module) => Array.from({ length: 6 }, (_, index) => ({ id: `${module}_${index}`, module: `M${module + 1}`, btl: index < 2 ? 'L5' : 'L3', marks: 10, co: 'CO5', reviewStatus: 'approved', questionText: `Apply the given resistor network equation for measured case ${module}_${index}.` }))).flat();
    mockPaperSources(questions);
    const paper = await generatePaper('Circuits', 'semester', null, 'offline-tenant');
    const selected = paper.modules.flatMap(module => [...module.splitA, ...module.splitB]);
    expect(selected).toHaveLength(20);
    expect(selected.every(question => question.btl === 'L3' && question.co === 'CO5')).toBe(true);
    expect(requestJson).not.toHaveBeenCalled();
  });
  test.each(['L4', 'L5', 'L6'])('rejects AI-created %s questions instead of silently lowering their labels', async btl => {
    mockPaperSources([]);
    const action = { L4: 'Analyze the causes of', L5: 'Evaluate options against safety criteria for', L6: 'Design an original constrained solution for' }[btl];
    requestJson.mockImplementation(async ({ prompt }) => ({ questions: slotsFromPrompt(prompt).map(slot => ({ slotId: slot.slotId, btl, questionText: `${action} resistor networks in measured circuit ${slot.slotId}.` })) }));
    await expect(generatePaper('Circuits', 'semester', null, 'offline-tenant')).rejects.toThrow(/only Bloom L1–L3 is allowed/);
    expect(requestJson.mock.calls[0][0].prompt).toContain('Every question MUST be Bloom L3');
  });
  test('rejects a higher cognitive demand even when AI labels it L3', async () => {
    mockPaperSources([]);
    requestJson.mockImplementation(async ({ prompt }) => ({ questions: slotsFromPrompt(prompt).map(slot => ({ slotId: slot.slotId, btl: 'L3', questionText: `Evaluate resistor choices against cost and safety criteria for case ${slot.slotId}.` })) }));
    await expect(generatePaper('Circuits', 'semester', null, 'offline-tenant')).rejects.toThrow(/only Bloom L1–L3 is allowed/);
  });
});

describe('Bounded draft generation', () => {
  beforeEach(() => { jest.clearAllMocks(); requestJson.mockReset(); });

  test('asks for only missing questions in batches of at most four and fixes marks in code', async () => {
    const bank = approvedBank();
    mockPaperSources(bank);
    requestJson.mockImplementation(async ({ prompt }) => ({ questions: answerSlots(prompt).questions.map(q => ({ ...q, marks: 999, module: 'M9' })) }));
    const paper = await generatePaper('Circuits', 'semester', null, 'offline-tenant');
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(requestJson.mock.calls.map(([{ prompt }]) => slotsFromPrompt(prompt).length)).toEqual([4, 1]);
    for (const [{ prompt, maxTokens }] of requestJson.mock.calls) {
      expect(prompt).not.toContain('headerMetadata');
      expect(maxTokens).toBeLessThanOrEqual(3100);
    }
    const selected = paper.modules.flatMap(m => [...m.splitA, ...m.splitB]);
    expect(selected.filter(q => q.isNew)).toHaveLength(5);
    expect(selected.filter(q => q.isNew).every(q => q.marks === 10 && q.btl === 'L3' && q.co === null && q.reviewRequired)).toBe(true);
    for (const q of selected.filter(q => !q.isNew)) {
      const original = bank.find(b => b.id === q.id);
      expect(q.questionText).toBe(original.questionText);
      expect(q.marks).toBe(original.marks);
      expect(q.btl).toBe(original.btl);
    }
    for (const mod of paper.modules) for (const split of [mod.splitA, mod.splitB]) expect(split.reduce((n, q) => n + q.marks, 0)).toBe(20);
    expect(paper.totalMarks).toBe(100);
    expect(validateAcademicRigor(paper)).toBe(true);
    expect(paper.warnings.join(' ')).toMatch(/5 new L3.*Review them/);
    expect(selected.every(q => q.htmlText)).toBe(true);
  });

  test('preserves the zero-AI path when uneven L1/L2 allocations meet the overall limit', async () => {
    const bank = approvedBank([10, 10, 10, 10]).map(q => ({ ...q, btl: q.module === 'M1' && ['0_0', '0_2'].includes(q.id) ? 'L2' : 'L3' }));
    mockPaperSources(bank);
    const paper = await generatePaper('Circuits', 'semester', null, 'offline-tenant');
    expect(validateAcademicRigor(paper)).toBe(true);
    expect(requestJson).not.toHaveBeenCalled();
  });

  test('retries truncated batches one question at a time without redoing accepted questions', async () => {
    mockPaperSources([]);
    requestJson.mockImplementation(async ({ prompt }) => answerSlots(prompt));
    requestJson.mockImplementationOnce(async ({ prompt }) => answerSlots(prompt));
    requestJson.mockRejectedValueOnce(new Error('AI response was incomplete (length). No partial JSON was accepted.'));
    const paper = await generatePaper('Circuits', 'internal', null, 'offline-tenant');
    expect(requestJson.mock.calls.map(([{ prompt }]) => slotsFromPrompt(prompt).length)).toEqual([4, 4, 1, 1, 1, 1]);
    const accepted = slotsFromPrompt(requestJson.mock.calls[0][0].prompt).map(s => s.slotId);
    const retried = requestJson.mock.calls.slice(2).flatMap(([{ prompt }]) => slotsFromPrompt(prompt).map(s => s.slotId));
    expect(retried.some(id => accepted.includes(id))).toBe(false);
    expect(paper.modules).toHaveLength(2);
    expect(paper.totalMarks).toBe(50);
    for (const mod of paper.modules) for (const split of [mod.splitA, mod.splitB]) expect(split.reduce((n, q) => n + q.marks, 0)).toBe(25);
  });

  test('repairs only a missing slot, leaving other completed batches untouched', async () => {
    mockPaperSources([]);
    requestJson.mockImplementation(async ({ prompt }) => answerSlots(prompt));
    requestJson.mockImplementationOnce(async ({ prompt }) => ({ questions: answerSlots(prompt).questions.slice(1) }));
    const paper = await generatePaper('Circuits', 'internal', null, 'offline-tenant');
    expect(requestJson.mock.calls.map(([{ prompt }]) => slotsFromPrompt(prompt).length)).toEqual([4, 4, 1]);
    expect(slotsFromPrompt(requestJson.mock.calls[2][0].prompt)[0].slotId).toBe('M1-A1');
    expect(paper.modules.flatMap(m => [...m.splitA, ...m.splitB])).toHaveLength(8);
  });

  test('stops further calls on credit exhaustion and reports missing sections instead of a partial paper', async () => {
    mockPaperSources([]);
    requestJson.mockImplementationOnce(async ({ prompt }) => answerSlots(prompt));
    requestJson.mockRejectedValueOnce(Object.assign(new Error('No OpenRouter credits remain.'), { status: 402 }));
    await expect(generatePaper('Circuits', 'internal', null, 'offline-tenant')).rejects.toThrow(/Could not write 4 required.*M2.*No OpenRouter credits/);
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  test('bounds retries when even single-question output is truncated', async () => {
    mockPaperSources(approvedBank());
    requestJson.mockRejectedValue(new Error('AI response was incomplete (length). No partial JSON was accepted.'));
    await expect(generatePaper('Circuits', 'semester', null, 'offline-tenant')).rejects.toThrow(/Could not write 5 required.*incomplete \(length\)/);
    expect(requestJson.mock.calls.map(([{ prompt }]) => slotsFromPrompt(prompt).length)).toEqual([4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test('does not use pending-review questions or request AI before approval', async () => {
    mockPaperSources(approvedBank([10, 10, 10, 10]).map(q => ({ ...q, reviewStatus: 'pending_review' })));
    await expect(generatePaper('Circuits', 'semester', null, 'offline-tenant')).rejects.toThrow(/approve/);
    expect(requestJson).not.toHaveBeenCalled();
  });

  test('rejects duplicates and sends precise repair feedback', async () => {
    mockPaperSources([]);
    requestJson.mockImplementation(async ({ prompt }) => answerSlots(prompt));
    requestJson.mockImplementationOnce(async ({ prompt }) => {
      const result = answerSlots(prompt);
      result.questions[1].questionText = result.questions[0].questionText;
      return result;
    });
    await generatePaper('Circuits', 'internal', null, 'offline-tenant');
    expect(requestJson.mock.calls).toHaveLength(3);
    expect(requestJson.mock.calls[2][0].prompt).toContain('it repeated an existing question');
    expect(slotsFromPrompt(requestJson.mock.calls[2][0].prompt).map(s => s.slotId)).toEqual(['M1-A2']);
  });

  test('never relabels a lower-demand question as L3 to meet the marks limit', async () => {
    mockPaperSources(approvedBank());
    requestJson.mockImplementation(async ({ prompt }) => ({ questions: slotsFromPrompt(prompt).map(slot => ({ slotId: slot.slotId, questionText: `Explain the behavior of resistor network ${slot.slotId}.`, bloomRationale: 'This is an application question according to the provider.' })) }));
    await expect(generatePaper('Circuits', 'semester', null, 'offline-tenant')).rejects.toThrow(/L2 \(Understand\).*requires L3/);
  });
});

describe('Paper Generator Service', () => {
  describe('buildValidSplit', () => {
    it('should create a valid 2-question split totaling exactly targetMarks', () => {
      const pool = [
        { questionText: 'Q1', marks: 10, btl: 'L1', co: 'CO1' },
        { questionText: 'Q2', marks: 8, btl: 'L2', co: 'CO2' },
        { questionText: 'Q3', marks: 12, btl: 'L3', co: 'CO3' }
      ];
      
      const split = buildValidSplit(pool, 20);
      expect(split).toBeDefined();
      expect(split.length).toBe(2);
      
      const totalMarks = split.reduce((sum, q) => sum + q.marks, 0);
      expect(totalMarks).toBe(20);
    });

    it('should create a valid 3-question split if 2-question is not possible', () => {
      const pool = [
        { questionText: 'Q1', marks: 6, btl: 'L1', co: 'CO1' },
        { questionText: 'Q2', marks: 6, btl: 'L2', co: 'CO2' },
        { questionText: 'Q3', marks: 8, btl: 'L3', co: 'CO3' },
        { questionText: 'Q4', marks: 2, btl: 'L1', co: 'CO1' }
      ];
      
      const split = buildValidSplit(pool, 20);
      expect(split).toBeDefined();
      
      const totalMarks = split.reduce((sum, q) => sum + q.marks, 0);
      expect(totalMarks).toBe(20);
    });

    it('should reject an insufficient pool without inflating marks', () => {
      const pool = [
        { questionText: 'Q1', marks: 10, btl: 'L1', co: 'CO1' }
      ];
      const split = buildValidSplit(pool, 20);
      
      expect(split).toBeNull();
      expect(pool[0].marks).toBe(10);
    });
  });

  describe('validateAcademicRigor', () => {
    it('should not add a warning if max possible L1/L2 marks is <= 30', () => {
      const paper = {
        warnings: [],
        modules: [
          {
            moduleNumber: 'M1',
            splitA: [{ marks: 5, btl: 'L1' }, { marks: 15, btl: 'L3' }], // 5
            splitB: [{ marks: 10, btl: 'L2' }, { marks: 10, btl: 'L4' }] // 10
          }
        ]
      };
      
      validateAcademicRigor(paper);
      expect(paper.warnings.length).toBe(0);
    });

    it('should add a warning if max possible L1/L2 marks exceeds 30', () => {
      const paper = {
        warnings: [],
        modules: [
          {
            moduleNumber: 'M1',
            splitA: [{ marks: 20, btl: 'L1' }], // 20
            splitB: [{ marks: 10, btl: 'L2' }, { marks: 10, btl: 'L4' }] // 10
          },
          {
            moduleNumber: 'M2',
            splitA: [{ marks: 15, btl: 'L2' }, { marks: 5, btl: 'L3' }], // 15
            splitB: [{ marks: 20, btl: 'L3' }] // 0
          }
        ]
      };
      // Max L1/L2 = 20 (M1) + 15 (M2) = 35 > 30.
      
      validateAcademicRigor(paper);
      expect(paper.warnings.length).toBe(1);
      expect(paper.warnings[0]).toMatch(/exceeds the 30% limit/);
    });
  });
});

describe('Legacy banks without a syllabus', () => {
  beforeEach(() => { jest.clearAllMocks(); requestJson.mockReset(); });
  // Each module has only L2 questions, so every split needs new L3 questions.
  const l2Bank = modules => modules.flatMap(module => [0, 1].map(index => ({ id: `${module}_${index}`, module: `MODULE - ${module}`, btl: 'L2', marks: 5, co: 'CO1', questionText: `Explain the resistor network behaviour for module ${module} case ${index}.` })));

  test('writes missing L3 questions from the module\'s approved bank questions', async () => {
    mockPaperSources(l2Bank([1, 2, 3, 4, 5]), { syllabus: false });
    requestJson.mockImplementation(async ({ prompt }) => answerSlots(prompt));
    const paper = await generatePaper('Circuits', 'internal', null, 'offline-tenant');
    expect(paper.totalMarks).toBe(50);
    const context = JSON.parse(requestJson.mock.calls[0][0].prompt.match(/^MODULE CONTEXT: (.+)$/m)[1]);
    expect(context.M1.bankTopicExamples[0]).toMatch(/module 1 case 0/);
    expect(context.M1.topics).toEqual([]);
  });

  test('names modules with no syllabus, notes or bank questions instead of calling AI', async () => {
    mockPaperSources(l2Bank([1]), { syllabus: false });
    await expect(generatePaper('Circuits', 'internal', null, 'offline-tenant')).rejects.toThrow(/M2 has no syllabus topics, notes or approved questions/);
    expect(requestJson).not.toHaveBeenCalled();
  });
});
