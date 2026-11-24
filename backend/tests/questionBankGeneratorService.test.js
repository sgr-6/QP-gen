jest.mock('../src/services/structuredAiService', () => ({
  requestJson: jest.fn(() => { throw new Error('Unexpected non-injected AI request'); }),
  models: { generation: 'offline-generation' }
}));

const { requestJson } = require('../src/services/structuredAiService');
const {
  recommendedQuestionCount, buildCoveragePlan, validateCandidate, coverageReport, generateQuestionBank, nearDuplicate
} = require('../src/services/questionBankGeneratorService');

const syllabus = {
  courseTitle: 'Circuit analysis',
  modules: [
    { moduleNumber: 'M1', topics: ['Resistor networks', 'Kirchhoff equations', 'Series circuits'] },
    { moduleNumber: 'M2', topics: ['Parallel circuits', 'Voltage dividers', 'Power dissipation'] },
    { moduleNumber: 'M3', topics: ['Capacitor charging', 'Inductor currents', 'Transient response'] },
    { moduleNumber: 'M4', topics: ['Alternating currents', 'Impedance matching', 'Resonant circuits'] },
    { moduleNumber: 'M5', topics: ['Sensor calibration', 'Signal filtering', 'Feedback control'] }
  ],
  courseOutcomes: []
};
const levels = ['L1', 'L2', 'L3'];

function slotsFromPrompt(prompt) {
  const match = prompt.match(/^SLOTS: (.+)$/m);
  if (!match) throw new Error('Generation prompt did not supply SLOTS');
  return JSON.parse(match[1]);
}

// Scenario observations and task focus vary, rather than only appending slot IDs
// to otherwise identical questions. All scenario data is supplied in the text.
function candidateFor(slot) {
  const ordinal = Number(slot.slotId.slice(1)) - 1;
  const locations = ['harbor', 'orbital', 'forest', 'hospital', 'desert', 'submarine', 'factory', 'railway', 'laboratory', 'satellite'];
  const devices = ['beacon', 'gateway', 'pump', 'monitor', 'transmitter', 'turbine', 'scanner', 'detector', 'relay', 'controller'];
  const scene = `${locations[ordinal % 10]} ${devices[Math.floor(ordinal / 10) % 10]}`;
  const data = `observation log: ${1001 + ordinal * 7}, ${4001 + ordinal * 11}, ${8001 + ordinal * 13}, ${12001 + ordinal * 17}`;
  const context = `for the ${scene}, with ${data}`;
  const topic = slot.topic;
  const templates = {
    L1: [
      `Define ${topic} and list its standard quantities ${context}.`,
      `Name the established terms used to label ${topic} measurements ${context}.`,
      `State the standard definitions associated with ${topic} ${context}.`,
      `Recall the conventional symbols describing ${topic} ${context}.`
    ],
    L2: [
      `Explain the meaning of ${topic} in a familiar monitoring situation ${context}.`,
      `Describe how the known concepts of ${topic} relate to the recorded measurements ${context}.`,
      `Summarize the usual behavior of ${topic} ${context}.`,
      `Illustrate the established interpretation of ${topic} ${context}.`
    ],
    L3: [
      `Calculate the normalized ${topic} reading using y = 2x + 3 with x = ${ordinal + 2} ${context}.`,
      `Apply the given ${topic} calibration y = 3x - 2 to x = ${ordinal + 3} ${context}.`,
      `Compute the ${topic} output from the supplied relation y = x / 2 with x = ${ordinal + 4} ${context}.`,
      `Solve the supplied ${topic} relation 4y = x + 8 with x = ${ordinal + 5} ${context}.`
    ],
    L4: [
      `Analyze the relationships among ${topic} measurements ${context}; isolate changes between successive readings.`,
      `Investigate the causes of variation in ${topic} ${context}; distinguish the contributions of the recorded components.`,
      `Examine the evidence for interacting ${topic} components ${context}; separate their observed contributions.`,
      `Differentiate the relationships governing ${topic} ${context}; organize the observations into dependent parts.`
    ],
    L5: [
      `Evaluate ${topic} options A and B against cost and reliability criteria ${context}; A costs 20 with 99% reliability, B costs 10 with 95%.`,
      `Justify a ${topic} selection against the safety criterion of error below 5% ${context}; option A has 2% error and B has 7%.`,
      `Critique a ${topic} recommendation against accuracy and energy criteria ${context}; A uses 8 W with 1% error, B uses 3 W with 4%.`,
      `Assess ${topic} alternatives against a 30 W power ceiling ${context}; A consumes 25 W and B consumes 40 W, and defend a judgment.`
    ],
    L6: [
      `Design an original ${topic} solution ${context} under constraints of a 10 W power budget and a 50 dollar cost ceiling.`,
      `Create a novel ${topic} monitoring plan ${context} under constraints of two sensors and a 5 ms response deadline.`,
      `Formulate an original ${topic} model ${context} under constraints of three components and a 2% measurement error.`,
      `Propose an original ${topic} architecture ${context} under constraints of 12 V supply and 20 W total dissipation.`
    ]
  };
  return {
    slotId: slot.slotId, questionText: templates[slot.btl][Math.floor(ordinal / 20) % 4],
    marks: slot.btl === 'L1' ? 2 : 8, btl: slot.btl, co: 'CO999',
    bloomRationale: `The requested task explicitly demands ${slot.btl} processing.`,
    topicEvidence: `The task explicitly addresses the source topic ${slot.topic}.`
  };
}

function successfulRequest() {
  return jest.fn(async ({ prompt, task, budget }) => {
    expect(task).toBe('generation');
    budget.calls++;
    budget.usedTokens += 100;
    budget.reservedTokens += 1000;
    return { questions: slotsFromPrompt(prompt).map(candidateFor) };
  });
}

beforeEach(() => jest.clearAllMocks());

describe('Coverage planning and candidate validation', () => {
  test('plans exactly 100 distinct slots covering every topic with only L1–L3', () => {
    const plan = buildCoveragePlan(syllabus);
    expect(plan).toHaveLength(100);
    expect(new Set(plan.map(slot => slot.slotId)).size).toBe(100);
    expect(new Set(plan.map(slot => slot.btl))).toEqual(new Set(levels));
    expect(levels.map(level => plan.filter(slot => slot.btl === level).length)).toEqual([34, 33, 33]);
    for (const mod of syllabus.modules) {
      expect(plan.filter(slot => slot.module === mod.moduleNumber)).toHaveLength(20);
      for (const topic of mod.topics) expect(plan.some(slot => slot.topic === topic)).toBe(true);
    }
  });

  test('sizes the default target to syllabus size within 20–100', () => {
    expect(recommendedQuestionCount({ modules: [{ moduleNumber: 'M1', topics: ['Resistor networks', 'Kirchhoff equations'] }] })).toBe(20);
    expect(recommendedQuestionCount({ modules: [{ moduleNumber: 'M1', topics: ['A', 'B', 'C'] }, { moduleNumber: 'M2', topics: ['D', 'E'] }] })).toBe(40);
    expect(recommendedQuestionCount({ modules: Array.from({ length: 5 }, (_, m) => ({ moduleNumber: `M${m + 1}`, topics: ['A', 'B', 'C', 'D'] })) })).toBe(100);
    expect(buildCoveragePlan({ modules: [{ moduleNumber: 'M1', topics: ['Resistor networks', 'Kirchhoff equations'] }] })).toHaveLength(20);
  });

  test.each([19, 101, 20.5, '100', NaN])('rejects an invalid target %p', target => {
    expect(() => buildCoveragePlan(syllabus, target)).toThrow(/integer between 20 and 100/);
  });

  test('rejects empty topics and more topics than available slots', () => {
    expect(() => buildCoveragePlan({ modules: [] })).toThrow(/at least one question/);
    expect(() => buildCoveragePlan({ modules: [{ moduleNumber: 'M1', topics: Array.from({ length: 31 }, (_, n) => `Topic ${n}`) }] }, 30)).toThrow(/at least one question/);
  });

  test.each(levels)('validates a substantive %s candidate and never fabricates its CO', level => {
    const slot = { ...buildCoveragePlan(syllabus)[0], btl: level };
    expect(validateCandidate(candidateFor(slot), slot, syllabus, [])).toMatchObject({
      btl: level, co: null, coMappingSource: 'unavailable', module: 'M1',
      sourceTopic: slot.topic, topicId: slot.topicId, slotId: slot.slotId,
      source: 'ai-syllabus', model: 'offline-generation',
      reviewRequired: true, reviewStatus: 'pending_review'
    });
  });

  test.each([0, 1, 21, -5, 2.5, 'not a mark', null, undefined])('rejects invalid marks %p', marks => {
    const slot = buildCoveragePlan(syllabus)[0];
    expect(() => validateCandidate({ ...candidateFor(slot), marks }, slot, syllabus, [])).toThrow(/marks must be an integer from 2 to 20/);
  });

  test.each(['L4', 'L5', 'L6'])('rejects disallowed planned level %s even when the candidate agrees', btl => {
    const slot = { ...buildCoveragePlan(syllabus)[0], btl };
    expect(() => validateCandidate(candidateFor(slot), slot, syllabus, [])).toThrow(/L1–L3 only/);
  });

  test('does not restrict real course outcomes to the Bloom level numbers', () => {
    const slot = { ...buildCoveragePlan(syllabus)[0], btl: 'L3' };
    const source = { ...syllabus, courseOutcomes: [{ id: 'CO5', description: 'Apply resistor network equations', modules: ['M1'] }] };
    expect(validateCandidate({ ...candidateFor(slot), co: 'CO5' }, slot, source, []).co).toBe('CO5');
  });

  test('rejects label mismatches, unsupported topic claims and missing evidence', () => {
    const slot = buildCoveragePlan(syllabus)[0];
    const candidate = candidateFor(slot);
    expect(() => validateCandidate({ ...candidate, btl: 'L6' }, slot, syllabus, [])).toThrow(/planned Bloom/);
    expect(() => validateCandidate({ ...candidate, questionText: 'Design an original resistor networks solution under strict power constraints.' }, slot, syllabus, [])).toThrow(/cognitive demand conflicts/);
    expect(() => validateCandidate({ ...candidate, questionText: 'Define the basic principles of photosynthesis and chlorophyll.' }, slot, syllabus, [])).toThrow(/connection to the assigned topic/);
    expect(() => validateCandidate({ ...candidate, topicEvidence: '' }, slot, syllabus, [])).toThrow(/topic alignment/);
  });

  test('reports planned and detected Bloom demand rather than encouraging relabeling', () => {
    const slot = { ...buildCoveragePlan(syllabus)[0], btl: 'L3' };
    const candidate = { ...candidateFor(slot), questionText: 'Evaluate resistor networks against explicit reliability criteria.' };
    expect(() => validateCandidate(candidate, slot, syllabus, [])).toThrow(/expected L3 \(Apply\), detected L5.*Rewrite the assessed task/);
  });

  test('requires real topic terminology, not a shared stopword or a claimed rationale', () => {
    const slot = { ...buildCoveragePlan(syllabus)[0], topic: 'Scenario based assignments.', btl: 'L2' };
    const candidate = { ...candidateFor(slot), questionText: 'Explain the difference between file modes based on their established definitions.' };
    expect(() => validateCandidate(candidate, slot, syllabus, [])).toThrow(/source terms.*scenario, assignments/);
    expect(validateCandidate({ ...candidate, questionText: 'Explain the difference between file modes in a scenario based assignment involving a log file.' }, slot, syllabus, []).btl).toBe('L2');
    const technical = { ...slot, topic: 'Classes and Objects' };
    expect(() => validateCandidate({ ...candidate, questionText: 'Explain the meaning of photosynthesis and chlorophyll in plants.' }, technical, syllabus, [])).toThrow(/explicit connection/);
  });

  test('rejects exact and near duplicates, not only equal slot IDs', () => {
    const slot = buildCoveragePlan(syllabus)[0];
    const candidate = candidateFor(slot);
    expect(() => validateCandidate(candidate, slot, syllabus, [{ questionText: candidate.questionText.toUpperCase() }])).toThrow(/Duplicate/);
    const original = 'Analyze resistor networks using measured voltage current resistance energy power and temperature.';
    expect(nearDuplicate(`${original} Carefully.`, [{ questionText: original }])).toBe(true);
    expect(nearDuplicate('Design an original capacitor charging controller under strict cost constraints.', [{ questionText: original }])).toBe(false);
  });

  test('reports missing topics for an incomplete bank', () => {
    const plan = buildCoveragePlan(syllabus, 30);
    const first = validateCandidate(candidateFor(plan[0]), plan[0], syllabus, []);
    expect(coverageReport(plan, [first])).toMatchObject({
      expectedQuestions: 30, generatedQuestions: 1, totalTopics: 15,
      coveredTopics: 1, complete: false, bloomCounts: { L1: 1, L6: 0 }
    });
    expect(coverageReport(plan, [first]).missingTopics).toHaveLength(14);
  });
});

describe('Offline injected generation pipeline', () => {
  test('generates a complete 100-question bank with coverage and awaited progress callbacks', async () => {
    const request = successfulRequest();
    const saved = [];
    const onBatch = jest.fn(async (batch, coverage, budget) => {
      await Promise.resolve();
      saved.push({ batch: [...batch], coverage, budget });
    });
    const result = await generateQuestionBank({ syllabus, request, onBatch });
    expect(result.questions).toHaveLength(100);
    expect(new Set(result.questions.map(q => q.questionText)).size).toBe(100);
    expect(new Set(result.questions.map(q => q.slotId)).size).toBe(100);
    expect(result.rejectedCount).toBe(0);
    expect(result.coverage).toMatchObject({ complete: true, percentage: 100, expectedQuestions: 100, generatedQuestions: 100, coveredTopics: 15, missingTopics: [] });
    for (const level of levels) expect(result.coverage.bloomCounts[level]).toBeGreaterThan(0);
    for (const slot of buildCoveragePlan(syllabus)) {
      const question = result.questions.find(q => q.slotId === slot.slotId);
      expect(question).toMatchObject({ topicId: slot.topicId, sourceTopic: slot.topic, module: slot.module, btl: slot.btl, co: null });
      expect(question.questionText).toContain(slot.topic);
    }
    expect(request).toHaveBeenCalledTimes(10);
    expect(requestJson).not.toHaveBeenCalled();
    expect(onBatch).toHaveBeenCalledTimes(10);
    expect(saved.flatMap(entry => entry.batch)).toEqual(result.questions);
    expect(saved.map(entry => entry.coverage.generatedQuestions)).toEqual(Array.from({ length: 10 }, (_, n) => (n + 1) * 10));
    expect(saved.map(entry => entry.budget.calls)).toEqual(Array.from({ length: 10 }, (_, n) => n + 1));
    expect(result.usage).toMatchObject({ calls: 10, maxCalls: 90, usedTokens: 1000 });
  });

  test('repairs only rejected slots and includes actionable feedback', async () => {
    const request = successfulRequest();
    request.mockImplementationOnce(async ({ prompt }) => ({
      questions: slotsFromPrompt(prompt).map((slot, index) => ({ ...candidateFor(slot), marks: index === 0 ? 1 : 8 }))
    }));
    const result = await generateQuestionBank({ syllabus, target: 30, request });
    expect(result.questions).toHaveLength(30);
    expect(result.rejectedCount).toBe(1);
    const repair = request.mock.calls[1][0].prompt;
    expect(slotsFromPrompt(repair).map(slot => slot.slotId)).toEqual(['S1']);
    expect(repair).toContain('REPAIR ATTEMPT: 1');
    expect(repair).toContain('marks must be an integer from 2 to 20');
  });

  test('skips a slot that still fails validation after three attempts and resumes without redoing accepted work', async () => {
    const request = jest.fn(async ({ prompt }) => ({
      questions: slotsFromPrompt(prompt).map(slot => ({ ...candidateFor(slot), marks: slot.slotId === 'S1' ? 0 : 8 }))
    }));
    const persisted = [];
    const onBatch = jest.fn(async batch => { persisted.push(...batch); });
    const result = await generateQuestionBank({ syllabus, target: 30, request, onBatch });
    expect(result.questions).toHaveLength(29);
    expect(result.skipped).toEqual([{ slotId: 'S1', topic: 'Resistor networks', reason: expect.stringContaining('marks must be an integer'), questionText: expect.any(String) }]);
    expect(result.coverage).toMatchObject({ generatedQuestions: 29, skippedQuestions: 1, skippedSlots: ['S1'], complete: false });
    expect(result.warning).toMatch(/after 3 attempts.*marks must be an integer/);
    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls.map(([arg]) => slotsFromPrompt(arg.prompt).length)).toEqual([10, 1, 1, 10, 10]);
    expect(persisted).toHaveLength(29);
    expect(onBatch.mock.calls[0][1].generatedQuestions).toBe(9);
    const resumeRequest = successfulRequest();
    const resumed = await generateQuestionBank({ syllabus, target: 30, existing: persisted, previousFailures: result.skipped, request: resumeRequest });
    const requestedIds = resumeRequest.mock.calls.flatMap(([arg]) => slotsFromPrompt(arg.prompt).map(slot => slot.slotId));
    expect(requestedIds).toEqual(['S1']);
    for (const saved of persisted) {
      expect(requestedIds).not.toContain(saved.slotId);
      expect(resumed.questions.find(q => q.slotId === saved.slotId)).toBe(saved);
    }
    expect(resumed.questions).toHaveLength(30);
    expect(resumed.coverage.complete).toBe(true);
  });

  test('persists precise repair feedback, skip causes and all attempt usage for a resumed run', async () => {
    const request = jest.fn(async ({ prompt, budget }) => {
      budget.calls++; budget.usedTokens += 100; budget.cost += 0.01;
      return { questions: slotsFromPrompt(prompt).map(slot => ({ ...candidateFor(slot), marks: slot.slotId === 'S1' ? 0 : 8 })) };
    });
    const saved = [];
    const onBatch = jest.fn(async (batch, coverage, usage, validationFailures) => saved.push({ batch, coverage, usage, validationFailures }));
    const result = await generateQuestionBank({ syllabus, target: 30, request, onBatch });
    expect(result.usage).toMatchObject({ calls: 5, usedTokens: 500, cost: 0.05 });
    expect(result.skipped).toEqual([{ slotId: 'S1', topic: 'Resistor networks', reason: expect.stringContaining('marks must be an integer'), questionText: expect.any(String) }]);
    expect(onBatch.mock.calls.map(([batch]) => batch.length)).toEqual([9, 0, 0, 10, 10, 0]);
    expect(onBatch.mock.calls[0][3]).toEqual([{ slotId: 'S1', topic: 'Resistor networks', reason: expect.stringContaining('marks must be an integer'), questionText: expect.any(String) }]);
    expect(saved.flatMap(entry => entry.batch)).toHaveLength(29);
    const resumeRequest = successfulRequest();
    await generateQuestionBank({ syllabus, target: 30, existing: result.questions, previousFailures: result.skipped, request: resumeRequest });
    expect(resumeRequest.mock.calls[0][0].prompt).toContain(result.skipped[0].questionText);
    expect(resumeRequest.mock.calls[0][0].prompt).toContain('marks must be an integer');
    expect(resumeRequest.mock.calls[0][0].prompt).toContain('Generate ONLY L1, L2 or L3');
  });

  test('records a failed batch as skipped and continues with the remaining batches', async () => {
    const request = successfulRequest();
    request.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Upstream provider temporarily unavailable.'), { status: 500 });
    });
    const result = await generateQuestionBank({ syllabus, target: 30, request });
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.questions).toHaveLength(20);
    expect(result.skipped.map(failure => failure.slotId)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);
    expect(result.skipped[0].reason).toContain('temporarily unavailable');
    expect(result.coverage).toMatchObject({ generatedQuestions: 20, skippedQuestions: 10, complete: false });
    expect(result.warning).toContain('10 questions were skipped');
  });

  test('stops further requests after a fatal credit limit and keeps questions already generated', async () => {
    const request = successfulRequest();
    request.mockImplementationOnce(successfulRequest().getMockImplementation());
    request.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Insufficient credits for this account.'), { status: 402 });
    });
    const result = await generateQuestionBank({ syllabus, target: 30, request });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.questions).toHaveLength(10);
    expect(result.skipped).toHaveLength(20);
    expect(result.skipped[0].reason).toContain('Insufficient credits');
    expect(result.coverage).toMatchObject({ generatedQuestions: 10, skippedQuestions: 20, complete: false });
  });

  test('reuses saved L1–L3 questions and regenerates higher-level slots without relabeling', async () => {
    const plan = buildCoveragePlan(syllabus, 30);
    const keptSlot = { ...plan[0], btl: 'L3' };
    const kept = validateCandidate(candidateFor(keptSlot), keptSlot, syllabus, []);
    const higher = { ...kept, slotId: 'S2', topicId: plan[1].topicId, btl: 'L6', questionText: 'Design an original Kirchhoff equations model under original research constraints.' };
    const original = structuredClone([kept, higher]);
    const request = successfulRequest();
    const onBatch = jest.fn();
    const result = await generateQuestionBank({ syllabus, target: 30, existing: [kept, higher], request, onBatch });
    expect([kept, higher]).toEqual(original);
    expect(result.questions.find(q => q.slotId === 'S1')).toBe(kept);
    expect(result.questions.find(q => q.slotId === 'S2').questionText).not.toBe(higher.questionText);
    const requestedIds = request.mock.calls.flatMap(([arg]) => slotsFromPrompt(arg.prompt).map(slot => slot.slotId));
    expect(requestedIds).not.toContain('S1');
    expect(requestedIds).toContain('S2');
    expect(onBatch.mock.calls[0][1].generatedQuestions).toBe(1);
    expect(result.questions.every(q => levels.includes(q.btl))).toBe(true);
    expect(result.coverage).toMatchObject({ generatedQuestions: 30, complete: true, bloomCounts: { L4: 0, L5: 0, L6: 0 } });
  });

  test.each(['missing', 'duplicated'])('skips %s slots in every batch when nothing can be validated', async failure => {
    const request = jest.fn(async ({ prompt }) => {
      const slots = slotsFromPrompt(prompt);
      if (failure === 'missing') return { questions: [] };
      return { questions: slots.flatMap(slot => [candidateFor(slot), candidateFor(slot)]) };
    });
    await expect(generateQuestionBank({ syllabus, target: 30, request })).rejects.toThrow(/after 3 attempts/);
    expect(request).toHaveBeenCalledTimes(9);
  });

  test('skips repeated question text even when its slot, level and topic evidence are valid', async () => {
    const text = 'Explain the known principles of Kirchhoff equations and Voltage dividers and summarize their established interpretation in circuit analysis.';
    const request = jest.fn(async ({ prompt }) => ({
      questions: slotsFromPrompt(prompt).map(slot => ({
        ...candidateFor(slot),
        ...(['S2', 'S5'].includes(slot.slotId) ? { questionText: text } : {})
      }))
    }));
    const onBatch = jest.fn();
    const result = await generateQuestionBank({ syllabus, target: 30, request, onBatch });
    expect(result.questions).toHaveLength(29);
    expect(result.skipped).toEqual([{ slotId: 'S5', topic: 'Voltage dividers', reason: 'Duplicate or near-duplicate question.', questionText: text }]);
    expect(result.warning).toContain('Duplicate or near-duplicate');
    expect(request).toHaveBeenCalledTimes(5);
    expect(slotsFromPrompt(request.mock.calls[1][0].prompt).map(slot => slot.slotId)).toEqual(['S5']);
    expect(request.mock.calls[1][0].prompt).toContain('Duplicate or near-duplicate question');
    expect(onBatch.mock.calls[0][0]).toHaveLength(9);
  });

  test('a fully saved bank needs no further requests or progress writes', async () => {
    const complete = await generateQuestionBank({ syllabus, target: 30, request: successfulRequest() });
    const request = jest.fn();
    const onBatch = jest.fn();
    const resumed = await generateQuestionBank({ syllabus, target: 30, existing: complete.questions, request, onBatch });
    expect(resumed.questions).toEqual(complete.questions);
    expect(resumed.coverage.complete).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(onBatch).not.toHaveBeenCalled();
  });

  test('fails clearly on an invalid AI response array', async () => {
    await expect(generateQuestionBank({ syllabus, target: 30, request: jest.fn().mockResolvedValue({}) })).rejects.toThrow(/no question array/);
  });
});
