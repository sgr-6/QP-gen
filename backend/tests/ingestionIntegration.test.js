// Contract integration: real controllers, job worker and generation service;
// isolated in-memory Firestore, mocked storage/extraction and AI completions.
const mockDocuments = new Map();
const mockRead = jest.fn();
let mockTransactionQueue = Promise.resolve();
let mockSequence = 0;
function mockRef(path) {
  return {
    path, id: path.split('/').at(-1),
    collection: name => mockCollection(`${path}/${name}`),
    get: async () => { await mockRead(path); return mockSnapshot(path); },
    set: async (data, options) => mockDocuments.set(path, options?.merge ? { ...(mockDocuments.get(path) || {}), ...data, ...(data.modules ? { modules: { ...(mockDocuments.get(path)?.modules || {}), ...data.modules } } : {}) } : { ...data }),
    update: async data => mockDocuments.set(path, { ...mockDocuments.get(path), ...data }),
    delete: async () => { mockDocuments.delete(path); }
  };
}
function mockSnapshot(path) { return { id: path.split('/').at(-1), ref: mockRef(path), exists: mockDocuments.has(path), data: () => mockDocuments.get(path) }; }
function mockCollection(path, filters = [], maximum = Infinity) {
  return {
    doc: id => mockRef(`${path}/${id || `job${++mockSequence}`}`),
    where: (key, op, value) => mockCollection(path, [...filters, [key, value]], maximum),
    limit: count => mockCollection(path, filters, count),
    get: async () => {
      await mockRead(path);
      const docs = [...mockDocuments.keys()].filter(key => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1).map(mockSnapshot).filter(doc => filters.every(([key, value]) => doc.data()[key] === value)).slice(0, maximum);
      return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback) };
    }
  };
}
const mockDb = {
  collection: name => mockCollection(name),
  runTransaction: callback => {
    // Serialize read/modify/write callbacks like Firestore's conflict retries.
    const transaction = mockTransactionQueue.then(() => callback({ get: ref => ref.get(), set: (ref, data, options) => ref.set(data, options), update: (ref, data) => ref.update(data) }));
    mockTransactionQueue = transaction.catch(() => {});
    return transaction;
  },
  batch: () => {
    const operations = [];
    return { set: (ref, data) => operations.push(() => ref.set(data)), update: (ref, data) => operations.push(() => ref.update(data)), delete: ref => operations.push(() => ref.delete()), commit: async () => Promise.all(operations.map(op => op())) };
  }
};
jest.mock('../src/config/firebaseAdmin', () => ({ db: mockDb, admin: { firestore: { FieldValue: { serverTimestamp: () => 'offline-timestamp' } } } }));
jest.mock('../src/config/supabaseClient', () => ({ storage: { from: jest.fn() } }));
jest.mock('../src/services/ingestionService', () => ({ ...jest.requireActual('../src/services/ingestionService'), storeSource: jest.fn(), cleanup: jest.fn() }));
jest.mock('../src/services/materialService', () => ({ extractDocument: jest.fn(), parseSyllabus: jest.fn(), parseNotes: jest.fn() }));
jest.mock('../src/services/structuredAiService', () => ({ models: { generation: 'mock-only' }, requestJson: jest.fn() }));
const material = require('../src/services/materialService');
const { storeSource, cleanup } = require('../src/services/ingestionService');
const { requestJson } = require('../src/services/structuredAiService');
const { uploadSyllabus, getGeneration, resumeGeneration, abandonGeneration } = require('../src/controllers/syllabusController');
const { uploadNotes } = require('../src/controllers/notesController');
const { approveGeneratedBank, approveAllBankQuestions, updateBankQuestion, deleteQuestionBank } = require('../src/controllers/uploadController');
const { generatePaper } = require('../src/services/paperGeneratorService');
const { startGenerationJob } = require('../src/services/generationJobService');
const { buildCoveragePlan, coverageReport, validateCandidate } = require('../src/services/questionBankGeneratorService');
const bankId = 'tenant_circuit_analysis';
const bankPath = `question_banks/${bankId}`;
const jobPath = jobId => `${bankPath}/generation_jobs/${jobId}`;
const requestedSlots = () => requestJson.mock.calls.flatMap(([{ prompt }]) => JSON.parse(prompt.match(/^SLOTS: (.+)$/m)[1]).map(slot => slot.slotId));
// All worker I/O is immediately settled in memory; one event-loop turn drains it.
const drainWorkers = () => new Promise(resolve => setImmediate(resolve));
const syllabus = { courseTitle: 'Circuit analysis', modules: Array.from({ length: 5 }, (_, i) => ({ moduleNumber: `M${i + 1}`, topics: [`Resistor networks ${i + 1}`, `Capacitor charging ${i + 1}`] })), courseOutcomes: [], extraction: { topicCount: 10, chunksProcessed: 1 } };
const req = extra => ({ user: { tenantId: 'tenant', userId: 'reviewer', email: 'reviewer@offline.invalid', role: 'hod' }, body: { courseTitle: 'Circuit analysis', department: 'Electronics', semester: '3', subjectCode: 'EE301', moduleNumber: '1' }, file: { path: 'offline.docx', originalname: 'offline.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, ...extra });
function response() { return { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } }; }
function fakeCandidates(prompt) {
  const slots = JSON.parse(prompt.match(/^SLOTS: (.+)$/m)[1]);
  return { questions: slots.map(slot => {
    const n = Number(slot.slotId.slice(1));
    const action = { L1: 'Define', L2: 'Explain', L3: 'Calculate', L4: 'Analyze', L5: 'Evaluate', L6: 'Design an original' }[slot.btl];
    return { slotId: slot.slotId, questionText: `${action} ${slot.topic} for a supplied academic scenario with observations ${n * 7 + 1} ${n * 11 + 2} ${n * 13 + 3} ${n * 17 + 4} ${n * 19 + 5} ${n * 23 + 6}.`, marks: slot.btl === 'L1' ? 2 : 10, btl: slot.btl, co: null, bloomRationale: 'Offline mocked cognitive-demand rationale; no academic quality claim.', topicEvidence: `The task explicitly addresses ${slot.topic}.` };
  }) };
}
async function seedGenerationJob(jobId, overrides = {}, bankOverrides = {}) {
  const job = { tenantId: 'tenant', bankId, syllabus: structuredClone(syllabus), target: 100, status: 'failed', error: 'Previous generation failed', worker: 'crashed-worker', leaseUntil: Date.now() - 60000, updatedAt: new Date(Date.now() - 11 * 60000).toISOString(), coverage: coverageReport(buildCoveragePlan(syllabus), []), ...overrides };
  await mockRef(bankPath).set({ tenantId: 'tenant', generationJobId: jobId, generationStatus: job.status, generationLockUntil: job.leaseUntil || 0, ...bankOverrides });
  await mockRef(jobPath(jobId)).set(job);
}
beforeEach(() => {
  mockDocuments.clear(); jest.clearAllMocks(); mockRead.mockReset();
  material.extractDocument.mockResolvedValue('Offline extracted source text for contract testing.');
  material.parseSyllabus.mockResolvedValue(structuredClone(syllabus));
  material.parseNotes.mockResolvedValue({ summary: 'Known resistor networks and capacitor charging concepts.', keyTopics: ['Resistor networks'], sections: [{ summary: 'Known resistor networks and capacitor charging concepts.' }], chunksProcessed: 1, totalChunks: 1 });
  storeSource.mockResolvedValue({ fileName: 'offline.docx', bucket: 'offline-storage', storagePath: 'tenant/offline.docx' });
  requestJson.mockImplementation(async ({ prompt, budget }) => { if (budget) { budget.calls++; budget.usedTokens += 100; } return fakeCandidates(prompt); });
});
afterEach(async () => {
  // Also drain workers when a regression assertion fails before its explicit drain.
  await drainWorkers();
  await mockTransactionQueue;
});

test('notes → syllabus upload → 100 persisted candidates → review approval → verified paper', async () => {
  const notesResponse = response();
  await uploadNotes(req(), notesResponse);
  expect(notesResponse.code).toBe(200);
  expect(mockDocuments.get(`notes/${bankId}`).modules['1'].keyTopics).toEqual(['Resistor networks']);
  expect(mockDocuments.get(`question_banks/${bankId}`).notesAvailable).toBe(true);
  const uploadResponse = response();
  await uploadSyllabus(req(), uploadResponse);
  expect(uploadResponse.code).toBe(202);
  const jobId = uploadResponse.payload.generation.jobId;
  await new Promise(resolve => setImmediate(resolve));
  const jobResponse = response();
  await getGeneration(req({ params: { bankId, jobId } }), jobResponse);
  expect(jobResponse.payload).toMatchObject({ status: 'completed', coverage: { generatedQuestions: 100, complete: true, percentage: 100 } });
  expect(jobResponse.payload.sourceTopics).toHaveLength(10);
  const questions = await mockDb.collection('question_banks').doc(bankId).collection('questions').get();
  expect(questions.size).toBe(100);
  expect(questions.docs.every(doc => doc.data().reviewStatus === 'pending_review')).toBe(true);
  await expect(generatePaper('Circuit analysis', 'semester', null, 'tenant')).rejects.toThrow(/approve/);
  const approval = response();
  await approveAllBankQuestions(req({ params: { bankId } }), approval);
  expect(approval.code).toBe(200);
  expect(approval.payload).toMatchObject({ approved: 100, skipped: 0 });
  const callsBeforePaper = requestJson.mock.calls.length;
  const paper = await generatePaper('Circuit analysis', 'semester', null, 'tenant');
  expect(paper.modules).toHaveLength(5);
  expect(paper.totalMarks).toBe(100);
  expect(new Set(paper.modules.flatMap(m => [...m.splitA, ...m.splitB].map(q => q.id))).size).toBe(20);
  for (const mod of paper.modules) for (const split of [mod.splitA, mod.splitB]) expect(split.reduce((n, q) => n + q.marks, 0)).toBe(20);
  expect(requestJson.mock.calls.length).toBe(callsBeforePaper); // No extra AI cost.
  expect(cleanup).toHaveBeenCalledTimes(2);
});

test('bulk approval approves usable questions, clears invalid COs and reports questions needing correction', async () => {
  await mockRef(`syllabi/${bankId}`).set({ tenantId: 'tenant', courseOutcomes: [{ id: 'CO1', description: 'Apply circuit procedures to supplied scenarios.' }] });
  await mockRef(bankPath).set({ tenantId: 'tenant' });
  const base = { tenantId: 'tenant', questionText: 'Calculate the resistor network current for a supplied 12 V circuit with 6 ohm resistance.', marks: 5, btl: 'L3', module: 'M1', reviewStatus: 'pending_review', reviewRequired: true };
  await mockRef(`${bankPath}/questions/q1`).set({ ...base, co: 'CO1' });
  await mockRef(`${bankPath}/questions/q2`).set({ ...base, questionText: 'Calculate the capacitor charging current for a supplied 12 V circuit with 6 ohm resistance.', co: 'CO9' });
  await mockRef(`${bankPath}/questions/q3`).set({ ...base, btl: 'L4' });
  await mockRef(`${bankPath}/questions/q4`).set({ ...base, marks: 25 });
  await mockRef(`${bankPath}/questions/q5`).set({ ...base, co: null, reviewStatus: 'approved', reviewRequired: false });
  const result = response();
  await approveAllBankQuestions(req({ params: { bankId } }), result);
  expect(result.code).toBe(200);
  expect(result.payload).toMatchObject({ approved: 2, alreadyApproved: 1, skipped: 2, coCleared: 1, total: 5 });
  expect(result.payload.skippedQuestions.map(item => item.id).sort()).toEqual(['q3', 'q4']);
  expect(mockDocuments.get(`${bankPath}/questions/q1`)).toMatchObject({ reviewStatus: 'approved', co: 'CO1' });
  expect(mockDocuments.get(`${bankPath}/questions/q2`)).toMatchObject({ reviewStatus: 'approved', co: null, coMappingSource: 'cleared-invalid' });
  expect(mockDocuments.get(`${bankPath}/questions/q3`)).toMatchObject({ reviewStatus: 'pending_review', btl: 'L4' });
  expect(mockDocuments.get(`${bankPath}/questions/q4`)).toMatchObject({ reviewStatus: 'pending_review', marks: 25 });
  expect(mockDocuments.get(bankPath)).toMatchObject({ generatedReviewStatus: 'partially_approved', approvedQuestionCount: 3, pendingReviewCount: 2 });
});

test('refuses to build a paper when no approved question is usable', async () => {
  await mockRef(bankPath).set({ tenantId: 'tenant', courseTitle: 'Circuit analysis' });
  await mockRef(`${bankPath}/questions/q1`).set({ tenantId: 'tenant', questionText: 'Analyze the circuit behavior in detail.', marks: 10, btl: 'L4', module: 'M1', reviewStatus: 'approved' });
  await expect(generatePaper('Circuit analysis', 'semester', null, 'tenant')).rejects.toThrow(/no approved questions with Bloom L1–L3/);
});

test('per-question approval returns specific errors and approves a corrected question', async () => {
  await mockRef(`syllabi/${bankId}`).set({ tenantId: 'tenant', courseOutcomes: [{ id: 'CO1', description: 'Apply circuit procedures to supplied scenarios.' }] });
  await mockRef(bankPath).set({ tenantId: 'tenant' });
  const questionPath = `${bankPath}/questions/q1`;
  await mockRef(questionPath).set({ tenantId: 'tenant', questionText: 'Explain resistor network behavior in the supplied circuit.', marks: 0, btl: 'L4', module: '', co: 'CO9', reviewStatus: 'pending_review' });
  const invalid = response();
  await updateBankQuestion(req({ params: { bankId, questionId: 'q1' }, body: { questionText: 'Explain resistor network behavior in the supplied circuit.', marks: 0, btl: 'L4', module: '', co: 'CO9' } }), invalid);
  expect(invalid.code).toBe(400);
  expect(invalid.payload.error).toMatch(/Marks must be a whole number/);
  const badCo = response();
  await updateBankQuestion(req({ params: { bankId, questionId: 'q1' }, body: { questionText: 'Explain resistor network behavior in the supplied circuit.', marks: 5, btl: 'L3', module: 'module 1', co: 'CO9' } }), badCo);
  expect(badCo.code).toBe(400);
  expect(badCo.payload.error).toMatch(/CO "CO9" is not an outcome/);
  const valid = response();
  await updateBankQuestion(req({ params: { bankId, questionId: 'q1' }, body: { questionText: 'Explain resistor network behavior in the supplied circuit.', marks: 5, btl: 'l3', module: 'module 1', co: ' co1 ' } }), valid);
  expect(valid.code).toBe(200);
  expect(valid.payload.question).toMatchObject({ marks: 5, btl: 'L3', module: 'M1', co: 'CO1', reviewStatus: 'approved' });
  expect(mockDocuments.get(questionPath)).toMatchObject({ marks: 5, btl: 'L3', module: 'M1', co: 'CO1', reviewStatus: 'approved', reviewRequired: false });
});

test('skips a failed AI batch, reports the job as resumable, and completes it on resume', async () => {
  requestJson.mockImplementationOnce(async () => { throw Object.assign(new Error('Provider overloaded.'), { status: 500 }); });
  const uploadResponse = response();
  await uploadSyllabus(req(), uploadResponse);
  expect(uploadResponse.code).toBe(202);
  const jobId = uploadResponse.payload.generation.jobId;
  await drainWorkers();
  const partial = response();
  await getGeneration(req({ params: { bankId, jobId } }), partial);
  expect(partial.payload).toMatchObject({ status: 'completed_with_skips', resumable: true, error: expect.stringMatching(/skipped after 3 attempts or an AI limit/), coverage: { generatedQuestions: 90, skippedQuestions: 10, complete: false } });
  expect(partial.payload.validationFailures).toHaveLength(10);
  expect((await mockCollection(`${bankPath}/questions`).get()).size).toBe(90);
  const resume = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), resume);
  expect(resume.code).toBe(202);
  await drainWorkers();
  const complete = response();
  await getGeneration(req({ params: { bankId, jobId } }), complete);
  expect(complete.payload).toMatchObject({ status: 'completed', resumable: false, error: null, coverage: { generatedQuestions: 100, skippedQuestions: 0, complete: true } });
  expect(complete.payload.validationFailures).toEqual([]);
  expect((await mockCollection(`${bankPath}/questions`).get()).size).toBe(100);
});

test('material/storage failures never report success or create a generation job', async () => {
  storeSource.mockRejectedValueOnce(Object.assign(new Error('Storage unavailable'), { status: 503 }));
  const result = response();
  await uploadSyllabus(req(), result);
  expect(result.code).toBe(503);
  expect(mockDocuments.size).toBe(0);
  expect(cleanup).toHaveBeenCalled();
});
test('rejects missing tenants and invalid notes modules with cleanup', async () => {
  const result = response();
  await uploadNotes(req({ user: {} }), result);
  expect(result.code).toBe(400);
  const second = response();
  await uploadNotes(req({ body: { ...req().body, moduleNumber: 'invalid' } }), second);
  expect(second.code).toBe(400);
  expect(mockDocuments.size).toBe(0);
  expect(cleanup).toHaveBeenCalledTimes(2);
});
test('job reads and resume do not allow cross-tenant access', async () => {
  await seedGenerationJob('private');
  const before = structuredClone([...mockDocuments]);
  const foreignRequest = req({ params: { bankId, jobId: 'private' }, user: { tenantId: 'other' } });
  const result = response();
  await getGeneration(foreignRequest, result);
  expect(result.code).toBe(404);
  const resume = response();
  await resumeGeneration(foreignRequest, resume);
  expect(resume.code).toBe(404);
  await drainWorkers();
  expect([...mockDocuments]).toEqual(before);
  expect(requestJson).not.toHaveBeenCalled();
});
test('incomplete generation cannot be approved', async () => {
  await mockRef(`question_banks/${bankId}`).set({ tenantId: 'tenant' });
  await mockRef(`question_banks/${bankId}/generation_jobs/partial`).set({ status: 'failed', coverage: { complete: false } });
  const result = response();
  await approveGeneratedBank(req({ params: { bankId, jobId: 'partial' } }), result);
  expect(result.code).toBe(409);
});

test('resume durably clears failure before the immediate GET and hides the resume action', async () => {
  const jobId = 'resume';
  await seedGenerationJob(jobId);
  const resumedAt = Date.now();
  const result = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(202);
  expect(result.payload).toMatchObject({ jobId, bankId, error: null, resumable: false });
  const immediate = response();
  await getGeneration(req({ params: { bankId, jobId } }), immediate);
  expect(immediate.code).toBe(200);
  expect(['queued', 'running']).toContain(immediate.payload.status);
  expect(immediate.payload).toMatchObject({ error: null, resumable: false });
  // No event-loop yield yet: the scheduled worker has not claimed the queued job.
  expect(mockDocuments.get(jobPath(jobId))).toMatchObject({ status: 'queued', error: null, worker: null });
  expect(mockDocuments.get(jobPath(jobId)).leaseUntil).toBeGreaterThan(resumedAt);
  expect(mockDocuments.get(bankPath)).toMatchObject({ generationJobId: jobId, generationStatus: 'queued' });
  expect(mockDocuments.get(bankPath).generationLockUntil).toBeGreaterThan(resumedAt);
  expect(requestJson).not.toHaveBeenCalled();
});

test('concurrent and repeated resume accept only one request and generate each slot once', async () => {
  const jobId = 'concurrent';
  await seedGenerationJob(jobId);
  const results = [response(), response()];
  await Promise.all(results.map(result => resumeGeneration(req({ params: { bankId, jobId } }), result)));
  expect(results.map(result => result.code).sort()).toEqual([202, 409]);
  const repeated = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), repeated);
  expect(repeated.code).toBe(409);
  await drainWorkers();
  expect(mockDocuments.get(jobPath(jobId))).toMatchObject({ status: 'completed', coverage: { generatedQuestions: 100, complete: true } });
  expect(requestedSlots()).toHaveLength(100);
  expect(new Set(requestedSlots()).size).toBe(100);
  expect((await mockCollection(`${bankPath}/questions`).get()).size).toBe(100);
});

test('resume preserves saved checkpoint documents and requests only the remaining 99 slots', async () => {
  const jobId = 'checkpoint';
  const plan = buildCoveragePlan(syllabus);
  const slot = plan[0];
  const candidate = fakeCandidates(`SLOTS: ${JSON.stringify([slot])}`).questions[0];
  const checkpoint = { ...validateCandidate(candidate, slot, syllabus, []), tenantId: 'tenant', generationJobId: jobId, reviewStatus: 'approved', reviewedBy: 'offline-reviewer' };
  const saved = structuredClone(checkpoint);
  const checkpointPath = `${bankPath}/questions/gen_${jobId}_${slot.slotId}`;
  await seedGenerationJob(jobId, { coverage: coverageReport(plan, [checkpoint]) });
  await mockRef(checkpointPath).set(checkpoint);
  const result = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(202);
  expect(mockDocuments.get(checkpointPath)).toEqual(saved);
  await drainWorkers();
  expect(mockDocuments.get(checkpointPath)).toEqual(saved);
  expect(requestedSlots()).not.toContain(slot.slotId);
  expect(requestedSlots()).toHaveLength(99);
  expect(new Set(requestedSlots()).size).toBe(99);
  expect((await mockCollection(`${bankPath}/questions`).get()).size).toBe(100);
  const final = response();
  await getGeneration(req({ params: { bankId, jobId } }), final);
  expect(final.payload).toMatchObject({ status: 'completed', resumable: false, coverage: { generatedQuestions: 100, complete: true } });
});

test('resume replaces higher-level checkpoint slots but preserves allowed-level documents and COs', async () => {
  const jobId = 'level-policy';
  const plan = buildCoveragePlan(syllabus);
  const slot = { ...plan[0], btl: 'L3' };
  const saved = { ...validateCandidate({ ...fakeCandidates(`SLOTS: ${JSON.stringify([slot])}`).questions[0], questionText: 'Calculate the resistor network current using Ohms law for a 12 V battery connected to a 6 ohm resistor.' }, slot, syllabus, []), co: 'CO5', tenantId: 'tenant', generationJobId: jobId, reviewStatus: 'approved' };
  await seedGenerationJob(jobId);
  await mockRef(`${bankPath}/questions/gen_${jobId}_S1`).set(saved);
  await mockRef(`${bankPath}/questions/gen_${jobId}_S2`).set({ ...saved, slotId: 'S2', topicId: plan[1].topicId, btl: 'L6', questionText: 'Design an original capacitor charging system under constraints.' });
  const result = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(202);
  await drainWorkers();
  expect(mockDocuments.get(`${bankPath}/questions/gen_${jobId}_S1`)).toEqual(saved);
  expect(requestedSlots()).not.toContain('S1');
  expect(requestedSlots()).toContain('S2');
  const questions = await mockCollection(`${bankPath}/questions`).get();
  expect(questions.size).toBe(100);
  expect(questions.docs.every(doc => ['L1', 'L2', 'L3'].includes(doc.data().btl))).toBe(true);
  expect(mockDocuments.get(jobPath(jobId))).toMatchObject({ status: 'completed', coverage: { generatedQuestions: 100, complete: true, bloomCounts: { L4: 0, L5: 0, L6: 0 } } });
});

test.each(['completed', 'queued', 'running'])('resume rejects an ineligible %s job without changing it', async status => {
  const jobId = `reject-${status}`;
  await seedGenerationJob(jobId, { status, error: null, worker: status === 'running' ? 'live-worker' : null, leaseUntil: status === 'completed' ? 0 : Date.now() + 60000, updatedAt: new Date().toISOString() });
  const before = structuredClone([...mockDocuments]);
  const result = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(409);
  await drainWorkers();
  expect([...mockDocuments]).toEqual(before);
  expect(requestJson).not.toHaveBeenCalled();
});

test.each(['queued', 'running'])('an expired %s job resumes and finishes with a released bank lock', async status => {
  const jobId = `expired-${status}`;
  await seedGenerationJob(jobId, { status });
  const result = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(202);
  expect(result.payload).toMatchObject({ status: 'queued', error: null, resumable: false });
  await drainWorkers();
  expect(mockDocuments.get(jobPath(jobId))).toMatchObject({ status: 'completed', leaseUntil: 0, coverage: { generatedQuestions: 100, complete: true } });
  expect(mockDocuments.get(bankPath)).toMatchObject({ generationStatus: 'completed', generationLockUntil: 0, totalQuestions: 100 });
});

test('another job owning an active bank lock prevents reactivation', async () => {
  const jobId = 'blocked';
  const leaseUntil = Date.now() + 60000;
  await seedGenerationJob(jobId, {}, { generationJobId: 'other-job', generationStatus: 'running', generationLockUntil: leaseUntil });
  await mockRef(jobPath('other-job')).set({ tenantId: 'tenant', syllabus, status: 'running', worker: 'other-worker', leaseUntil });
  const before = structuredClone([...mockDocuments]);
  const result = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(409);
  await drainWorkers();
  expect([...mockDocuments]).toEqual(before);
  expect(requestJson).not.toHaveBeenCalled();
});

test.each(['failed', 'completed', 'running'])('a worker cannot directly reclaim a %s job without an eligible lease', async status => {
  const jobId = `claim-${status}`;
  await seedGenerationJob(jobId, { status, leaseUntil: status === 'running' ? Date.now() + 60000 : 0 });
  const before = structuredClone([...mockDocuments]);
  startGenerationJob(bankId, jobId);
  await drainWorkers();
  expect([...mockDocuments]).toEqual(before);
  expect(requestJson).not.toHaveBeenCalled();
});

test.each([['notes', `notes/${bankId}`], ['checkpoint', `${bankPath}/questions`]])('%s read failure persists failed and releases the bank lock', async (label, path) => {
  const jobId = `read-failure-${label}`;
  await seedGenerationJob(jobId);
  mockRead.mockImplementation(readPath => { if (readPath === path) throw new Error(`Offline ${label} read failed`); });
  const result = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(202);
  await drainWorkers();
  expect(mockRead).toHaveBeenCalledWith(path);
  expect(mockDocuments.get(jobPath(jobId))).toMatchObject({ status: 'failed', error: `Offline ${label} read failed`, leaseUntil: 0 });
  expect(mockDocuments.get(bankPath)).toMatchObject({ generationStatus: 'failed', generationLockUntil: 0 });
  expect(requestJson).not.toHaveBeenCalled();
  const failed = response();
  await getGeneration(req({ params: { bankId, jobId } }), failed);
  expect(failed.payload).toMatchObject({ status: 'failed', resumable: true, error: `Offline ${label} read failed` });
});

test('abandon releases the lock, clears resumability and blocks the worker', async () => {
  const jobId = 'abandon';
  await seedGenerationJob(jobId);
  const result = response();
  await abandonGeneration(req({ params: { bankId, jobId } }), result);
  expect(result.code).toBe(200);
  expect(result.payload).toMatchObject({ status: 'abandoned', resumable: false, error: null });
  expect(mockDocuments.get(jobPath(jobId))).toMatchObject({ status: 'abandoned', worker: null, leaseUntil: 0, validationFailures: [] });
  expect(mockDocuments.get(bankPath)).toMatchObject({ generationStatus: 'abandoned', generationLockUntil: 0 });
  const resume = response();
  await resumeGeneration(req({ params: { bankId, jobId } }), resume);
  expect(resume.code).toBe(409);
  startGenerationJob(bankId, jobId);
  await drainWorkers();
  expect(requestJson).not.toHaveBeenCalled();
});

test('abandon is idempotent and rejects completed work', async () => {
  const abandonedId = 'abandon-twice';
  await seedGenerationJob(abandonedId, { status: 'abandoned', worker: null, leaseUntil: 0 });
  const repeated = response();
  await abandonGeneration(req({ params: { bankId, jobId: abandonedId } }), repeated);
  expect(repeated.code).toBe(200);
  expect(repeated.payload.status).toBe('abandoned');
  const completedId = 'abandon-completed';
  await seedGenerationJob(completedId, { status: 'completed', worker: null, leaseUntil: 0 });
  const completed = response();
  await abandonGeneration(req({ params: { bankId, jobId: completedId } }), completed);
  expect(completed.code).toBe(409);
  expect(mockDocuments.get(jobPath(completedId)).status).toBe('completed');
});

test('delete removes the bank, questions, jobs, syllabus and notes', async () => {
  const jobId = 'delete-subject';
  await seedGenerationJob(jobId, { status: 'abandoned', worker: null, leaseUntil: 0 }, { generationLockUntil: 0 });
  await mockRef(`${bankPath}/questions/gen_${jobId}_S1`).set({ tenantId: 'tenant', generationJobId: jobId });
  await mockRef(`${bankPath}/final_papers/paper.pdf`).set({ tenantId: 'tenant' });
  await mockRef(`syllabi/${bankId}`).set({ tenantId: 'tenant', modules: [] });
  await mockRef(`notes/${bankId}`).set({ tenantId: 'tenant', modules: {} });
  const result = response();
  await deleteQuestionBank(req({ params: { bankId } }), result);
  expect(result.code).toBe(200);
  expect([...mockDocuments.keys()].filter(key => key.startsWith(bankPath))).toEqual([]);
  expect(mockDocuments.has(`syllabi/${bankId}`)).toBe(false);
  expect(mockDocuments.has(`notes/${bankId}`)).toBe(false);
  expect(requestJson).not.toHaveBeenCalled();
});

test('delete refuses while a generation lease is active', async () => {
  await seedGenerationJob('delete-active', { status: 'running', worker: 'live-worker', leaseUntil: Date.now() + 60000 });
  const before = structuredClone([...mockDocuments]);
  const result = response();
  await deleteQuestionBank(req({ params: { bankId } }), result);
  expect(result.code).toBe(409);
  expect([...mockDocuments]).toEqual(before);
});

test('delete rejects cross-tenant banks without removing data', async () => {
  await seedGenerationJob('delete-foreign', { status: 'abandoned', worker: null, leaseUntil: 0 });
  const before = structuredClone([...mockDocuments]);
  const result = response();
  await deleteQuestionBank(req({ params: { bankId }, user: { tenantId: 'other' } }), result);
  expect(result.code).toBe(404);
  expect([...mockDocuments]).toEqual(before);
});
