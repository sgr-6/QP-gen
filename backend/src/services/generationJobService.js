const crypto = require('crypto');
const { db } = require('../config/firebaseAdmin');
const { generateQuestionBank, recommendedQuestionCount, buildCoveragePlan, coverageReport } = require('./questionBankGeneratorService');
const LEASE_MS = 10 * 60 * 1000;
const isResumable = job => ['failed', 'completed_with_skips'].includes(job.status) || (['queued', 'running'].includes(job.status) && (job.leaseUntil || Date.parse(job.updatedAt) + LEASE_MS) < Date.now());

async function createGenerationJob(bankId, syllabus, metadata, target = recommendedQuestionCount(syllabus)) {
  const plan = buildCoveragePlan(syllabus, target);
  const bankRef = db.collection('question_banks').doc(bankId);
  const jobRef = bankRef.collection('generation_jobs').doc();
  await db.runTransaction(async tx => {
    const bank = await tx.get(bankRef);
    if (bank.exists && bank.data().generationLockUntil > Date.now()) throw Object.assign(new Error('Generation is already active for this subject.'), { status: 409 });
    tx.set(db.collection('syllabi').doc(bankId), syllabus);
    tx.set(jobRef, { tenantId: metadata.tenantId, bankId, syllabus, target, status: 'queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), coverage: coverageReport(plan, []), usage: { calls: 0, usedTokens: 0, cost: 0 } });
    tx.set(bankRef, { ...metadata, generationJobId: jobRef.id, generationStatus: 'queued', generationLockUntil: Date.now() + LEASE_MS }, { merge: true });
  });
  startGenerationJob(bankId, jobRef.id);
  return { bankId, jobId: jobRef.id, status: 'queued', targetQuestions: target };
}

async function resumeGenerationJob(bankId, jobId, tenantId) {
  const bankRef = db.collection('question_banks').doc(bankId);
  const jobRef = bankRef.collection('generation_jobs').doc(jobId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(jobRef);
    if (!snap.exists || snap.data().tenantId !== tenantId) throw Object.assign(new Error('Generation job not found.'), { status: 404 });
    if (!isResumable(snap.data())) throw Object.assign(new Error('Generation is already active or completed. Refresh its status.'), { status: 409 });
    const bank = await tx.get(bankRef);
    if (bank.data()?.generationJobId !== jobId && bank.data()?.generationLockUntil > Date.now()) throw Object.assign(new Error('Another generation is already active for this subject.'), { status: 409 });
    const target = recommendedQuestionCount(snap.data().syllabus);
    buildCoveragePlan(snap.data().syllabus, target);
    const leaseUntil = Date.now() + LEASE_MS;
    tx.update(jobRef, { target, status: 'queued', error: null, worker: null, leaseUntil, updatedAt: new Date().toISOString() });
    tx.set(bankRef, { generationJobId: jobId, generationStatus: 'queued', generationLockUntil: leaseUntil }, { merge: true });
  });
  startGenerationJob(bankId, jobId);
  return readGenerationJob(bankId, jobId, tenantId);
}

async function abandonGenerationJob(bankId, jobId, tenantId) {
  const bankRef = db.collection('question_banks').doc(bankId);
  const jobRef = bankRef.collection('generation_jobs').doc(jobId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(jobRef);
    if (!snap.exists || snap.data().tenantId !== tenantId) throw Object.assign(new Error('Generation job not found.'), { status: 404 });
    const data = snap.data();
    if (data.status === 'abandoned') return;
    if (!['queued', 'running', 'failed'].includes(data.status)) throw Object.assign(new Error('A completed generation cannot be abandoned.'), { status: 409 });
    const bank = await tx.get(bankRef);
    const now = new Date().toISOString();
    tx.update(jobRef, { status: 'abandoned', worker: null, leaseUntil: 0, error: null, validationFailures: [], abandonedAt: now, updatedAt: now });
    if (bank.data()?.generationJobId === jobId) tx.set(bankRef, { generationStatus: 'abandoned', generationLockUntil: 0 }, { merge: true });
  });
  return readGenerationJob(bankId, jobId, tenantId);
}

function startGenerationJob(bankId, jobId) {
  // Firestore claims, not process-local flags, exclude concurrent workers after a resume.
  setImmediate(() => runJob(bankId, jobId).catch(error => console.error('Generation worker failed:', error.message)));
}

async function runJob(bankId, jobId) {
  const bankRef = db.collection('question_banks').doc(bankId);
  const jobRef = bankRef.collection('generation_jobs').doc(jobId);
  const worker = crypto.randomUUID();
  const job = await db.runTransaction(async tx => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new Error('Generation job not found.');
    const data = snap.data();
    const bank = await tx.get(bankRef);
    if (data.status !== 'queued' && !(data.status === 'running' && isResumable(data))) return null;
    if (data.leaseUntil > Date.now() && data.worker) return null;
    if (bank.data()?.generationJobId !== jobId && bank.data()?.generationLockUntil > Date.now()) throw new Error('Another job owns the active subject lease.');
    tx.update(jobRef, { status: 'running', error: null, worker, leaseUntil: Date.now() + LEASE_MS, updatedAt: new Date().toISOString() });
    tx.set(bankRef, { generationJobId: jobId, generationStatus: 'running', generationLockUntil: Date.now() + LEASE_MS }, { merge: true });
    return data;
  });
  if (!job) return;
  try {
    const questionSnapshot = await bankRef.collection('questions').where('generationJobId', '==', jobId).get();
    const existing = questionSnapshot.docs.map(doc => doc.data());
    const notesDoc = await db.collection('notes').doc(bankId).get();
    const result = await generateQuestionBank({
      syllabus: job.syllabus, target: job.target, notes: notesDoc.exists ? notesDoc.data().modules || {} : {}, existing, previousFailures: job.validationFailures || [],
      onBatch: async (questions, coverage, usage, validationFailures = []) => {
        await db.runTransaction(async tx => {
          const lease = await tx.get(jobRef);
          const bank = await tx.get(bankRef);
          if (lease.data().status === 'abandoned') throw Object.assign(new Error('Generation was abandoned.'), { abandoned: true });
          if (lease.data().worker !== worker || bank.data().generationJobId !== jobId) throw new Error('Worker lease changed; stopped to prevent duplicate writes.');
          questions.forEach(q => tx.set(bankRef.collection('questions').doc(`gen_${jobId}_${q.slotId}`), { ...q, tenantId: job.tenantId, generationJobId: jobId }));
          tx.update(jobRef, { coverage, usage, validationFailures, updatedAt: new Date().toISOString(), leaseUntil: Date.now() + LEASE_MS });
          tx.set(bankRef, { generationLockUntil: Date.now() + LEASE_MS }, { merge: true });
        });
      }
    });
    const all = await bankRef.collection('questions').get();
    await db.runTransaction(async tx => {
      const lease = await tx.get(jobRef);
      const bank = await tx.get(bankRef);
      if (lease.data().worker !== worker || bank.data().generationJobId !== jobId) return;
      const status = result.coverage.complete ? 'completed' : 'completed_with_skips';
      tx.update(jobRef, { status, coverage: result.coverage, usage: result.usage, validationFailures: result.skipped || [], error: result.warning || null, leaseUntil: 0, updatedAt: new Date().toISOString() });
      tx.set(bankRef, { generationStatus: status, generationLockUntil: 0, totalQuestions: all.size, generatedCoverage: result.coverage, generatedReviewStatus: 'pending_review' }, { merge: true });
    });
  } catch (error) {
    await db.runTransaction(async tx => {
      const lease = await tx.get(jobRef);
      const bank = await tx.get(bankRef);
      if (lease.data().worker !== worker || lease.data().status === 'abandoned') return;
      tx.update(jobRef, { status: 'failed', error: error.message, validationFailures: error.validationFailures || [], ...(error.usage ? { usage: error.usage } : {}), leaseUntil: 0, updatedAt: new Date().toISOString() });
      if (bank.data().generationJobId === jobId) tx.set(bankRef, { generationStatus: 'failed', generationLockUntil: 0 }, { merge: true });
    });
  }
}

async function readGenerationJob(bankId, jobId, tenantId) {
  const doc = await db.collection('question_banks').doc(bankId).collection('generation_jobs').doc(jobId).get();
  if (!doc.exists || doc.data().tenantId !== tenantId) throw Object.assign(new Error('Generation job not found.'), { status: 404 });
  const { syllabus, worker, ...data } = doc.data();
  return { ...data, jobId, bankId, sourceTopics: syllabus.modules.flatMap(m => m.topics.map(topic => ({ module: m.moduleNumber, topic }))), courseOutcomes: syllabus.courseOutcomes || [], resumable: isResumable(data) };
}
module.exports = { createGenerationJob, startGenerationJob, readGenerationJob, resumeGenerationJob, abandonGenerationJob };
