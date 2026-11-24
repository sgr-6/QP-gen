const { db, admin } = require('../config/firebaseAdmin');
const path = require('path');
const crypto = require('crypto');
const { parseFile } = require('../services/parserService');
const { GENERATION_LEVELS, normalizeModule } = require('../services/bloomService');
const { upload, metadata, courseDocId, storeSource, cleanup, respondError } = require('../services/ingestionService');

async function uploadFile(req, res) {
  try {
    const meta = metadata(req);
    const bankId = courseDocId(meta.tenantId, meta.courseTitle);
    const syllabus = await db.collection('syllabi').doc(bankId).get();
    const questions = await parseFile(req.file.path, path.extname(req.file.originalname), meta.tenantId, syllabus.exists ? syllabus.data() : null);
    const source = await storeSource(req.file, 'source_files', meta.tenantId);
    const bankRef = db.collection('question_banks').doc(bankId);
    const previous = await bankRef.collection('questions').get();
    const known = new Set(previous.docs.map(doc => doc.data().questionText?.toLowerCase().replace(/\s+/g, ' ').trim()));
    const fresh = questions.filter(q => !known.has(q.questionText.toLowerCase().replace(/\s+/g, ' ').trim()));
    const uploadId = crypto.randomUUID();
    // Firestore allows at most 500 writes: checkpoint in smaller batches.
    for (let offset = 0; offset < fresh.length; offset += 400) {
      const batch = db.batch();
      fresh.slice(offset, offset + 400).forEach((q, index) => batch.set(bankRef.collection('questions').doc(`upload_${uploadId}_${offset + index}`), { ...q, tenantId: meta.tenantId, uploadId, reviewStatus: q.reviewRequired ? 'pending_review' : 'approved', source: 'uploaded-bank' }));
      await batch.commit();
    }
    const all = await bankRef.collection('questions').get();
    await bankRef.set({ ...meta, ...source, uploadedAt: admin.firestore.FieldValue.serverTimestamp(), totalQuestions: all.size, uploadedBy: req.user.userId || req.user.email || '' }, { merge: true });
    res.json({ message: 'Question bank parsed and stored. Review provisional mappings before using them.', bankId, courseTitle: meta.courseTitle, totalQuestions: fresh.length, duplicatesSkipped: questions.length - fresh.length, reviewRequired: fresh.filter(q => q.reviewRequired).length, questions: fresh });
  } catch (error) { respondError(res, error); }
  finally { await cleanup(req); }
}
async function getQuestionBanks(req, res) {
  try {
    if (!req.user.tenantId) return res.status(400).json({ error: 'Tenant ID is required.' });
    const snapshot = await db.collection('question_banks').where('tenantId', '==', req.user.tenantId).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (error) { respondError(res, error); }
}
async function authorizedBank(req) {
  const ref = db.collection('question_banks').doc(req.params.bankId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().tenantId !== req.user.tenantId) throw Object.assign(new Error('Question bank not found.'), { status: 404 });
  return ref;
}
async function getBankQuestions(req, res) {
  try {
    const ref = await authorizedBank(req);
    const snapshot = await ref.collection('questions').get();
    res.json({ questions: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { respondError(res, error); }
}
function questionApprovalIssue(question) {
  if (typeof question.questionText !== 'string' || question.questionText.trim().length < 10) return 'Question text is missing or too short.';
  if (question.questionText.length > 20000) return 'Question text is too long.';
  if (!Number.isInteger(Number(question.marks)) || Number(question.marks) < 1 || Number(question.marks) > 20) return 'Marks must be a whole number from 1 to 20.';
  if (!GENERATION_LEVELS.includes(question.btl)) return 'Bloom level must be L1, L2 or L3.';
  if (!normalizeModule(question.module)) return 'Module must be M1, M2, M3, M4 or M5.';
  if (question.isDuplicate) return 'Question is marked as a duplicate.';
  return null;
}

async function updateBankQuestion(req, res) {
  try {
    const ref = await authorizedBank(req);
    const questionRef = ref.collection('questions').doc(req.params.questionId);
    const snapshot = await questionRef.get();
    if (!snapshot.exists) return res.status(404).json({ error: 'Question not found.' });
    const { questionText, marks, module } = req.body;
    const btl = String(req.body.btl || '').trim().toUpperCase();
    const co = req.body.co ? String(req.body.co).trim().toUpperCase() : null;
    if (typeof questionText !== 'string' || questionText.trim().length < 10) return res.status(400).json({ error: 'Question text must be at least 10 characters.' });
    if (questionText.length > 20000) return res.status(400).json({ error: 'Question text must be 20,000 characters or fewer.' });
    if (!Number.isInteger(Number(marks)) || Number(marks) < 1 || Number(marks) > 20) return res.status(400).json({ error: 'Marks must be a whole number from 1 to 20.' });
    if (!GENERATION_LEVELS.includes(btl)) return res.status(400).json({ error: 'Bloom level must be L1, L2 or L3.' });
    if (!normalizeModule(module)) return res.status(400).json({ error: 'Module must be M1, M2, M3, M4 or M5.' });
    const syllabus = await db.collection('syllabi').doc(req.params.bankId).get();
    if (co && (!syllabus.exists || !(syllabus.data().courseOutcomes || []).some(outcome => outcome.id === co))) return res.status(400).json({ error: `CO "${co}" is not an outcome in this subject's syllabus. Leave it empty to keep it unmapped.` });
    const changes = { questionText: questionText.trim(), marks: Number(marks), btl, co, coMappingSource: co ? 'human-confirmed' : 'unmapped', module: normalizeModule(module), reviewStatus: 'approved', reviewRequired: false, reviewedBy: req.user.email || req.user.userId || '', reviewedAt: new Date().toISOString(), mappingConfidence: 'human-reviewed' };
    await questionRef.update(changes);
    res.json({ message: 'Question corrected and approved.', question: { id: questionRef.id, ...snapshot.data(), ...changes } });
  } catch (error) { respondError(res, error); }
}

async function approveAllBankQuestions(req, res) {
  try {
    const ref = await authorizedBank(req);
    const snapshot = await ref.collection('questions').get();
    if (!snapshot.size) return res.status(409).json({ error: 'This subject has no questions to approve.' });
    const syllabus = await db.collection('syllabi').doc(req.params.bankId).get();
    const outcomeIds = new Set((syllabus.data()?.courseOutcomes || []).map(outcome => outcome.id));
    const reviewedBy = req.user.email || req.user.userId || '';
    const reviewedAt = new Date().toISOString();
    const updates = [];
    const skipped = [];
    let nowApproved = 0;
    let alreadyApproved = 0;
    let coCleared = 0;
    for (const doc of snapshot.docs) {
      const question = doc.data();
      const issue = questionApprovalIssue(question);
      if (issue) {
        skipped.push({ id: doc.id, slotId: question.slotId || null, questionText: String(question.questionText || '').slice(0, 160), reason: issue });
        continue;
      }
      if (question.reviewStatus === 'approved') alreadyApproved++;
      else nowApproved++;
      const clearCo = Boolean(question.co && !outcomeIds.has(question.co));
      if (clearCo) coCleared++;
      updates.push({ ref: doc.ref, data: { reviewStatus: 'approved', reviewRequired: false, reviewedBy, reviewedAt, mappingConfidence: 'human-reviewed', ...(clearCo ? { co: null, coMappingSource: 'cleared-invalid' } : {}) } });
    }
    for (let offset = 0; offset < updates.length; offset += 400) {
      const batch = db.batch();
      updates.slice(offset, offset + 400).forEach(update => batch.update(update.ref, update.data));
      await batch.commit();
    }
    const approvedTotal = nowApproved + alreadyApproved;
    await ref.set({ generatedReviewStatus: skipped.length ? 'partially_approved' : 'approved', approvedQuestionCount: approvedTotal, pendingReviewCount: skipped.length, lastReviewedBy: reviewedBy, lastReviewedAt: reviewedAt }, { merge: true });
    const message = approvedTotal
      ? `Approved ${approvedTotal} usable question${approvedTotal === 1 ? '' : 's'}${skipped.length ? `; ${skipped.length} still need correction.` : '.'}${coCleared ? ` Cleared ${coCleared} invalid CO mapping${coCleared === 1 ? '' : 's'}.` : ''}`
      : `No questions could be approved. ${skipped[0]?.reason || ''}`;
    res.json({ message, approved: nowApproved, alreadyApproved, skipped: skipped.length, coCleared, skippedQuestions: skipped, total: snapshot.size });
  } catch (error) { respondError(res, error); }
}
async function deleteCollection(collectionRef) {
  for (;;) {
    const snapshot = await collectionRef.limit(400).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    if (snapshot.size < 400) return;
  }
}
async function deleteQuestionBank(req, res) {
  const ref = db.collection('question_banks').doc(req.params.bankId);
  try {
    const claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().tenantId !== req.user.tenantId) throw Object.assign(new Error('Question bank not found.'), { status: 404 });
      if (snap.data().generationLockUntil > Date.now()) return false;
      tx.set(ref, { generationStatus: 'deleting', generationLockUntil: Date.now() + 60000 }, { merge: true });
      return true;
    });
    if (!claimed) return res.status(409).json({ error: 'Abandon the active generation before deleting this subject.' });
    await deleteCollection(ref.collection('questions'));
    await deleteCollection(ref.collection('generation_jobs'));
    await deleteCollection(ref.collection('final_papers'));
    await db.collection('syllabi').doc(req.params.bankId).delete();
    await db.collection('notes').doc(req.params.bankId).delete();
    await ref.delete();
    res.json({ message: 'Subject question bank, syllabus, notes and generation history deleted.' });
  } catch (error) {
    const snapshot = await ref.get().catch(() => null);
    if (snapshot?.exists && snapshot.data()?.generationStatus === 'deleting') await ref.set({ generationStatus: 'delete_failed', generationLockUntil: 0 }, { merge: true }).catch(() => {});
    respondError(res, error);
  }
}
async function approveGeneratedBank(req, res) {
  try {
    const ref = await authorizedBank(req);
    const job = await ref.collection('generation_jobs').doc(req.params.jobId).get();
    if (!job.exists || job.data().status !== 'completed' || !job.data().coverage?.complete) return res.status(409).json({ error: 'Only a complete, verified generation can be approved.' });
    const snapshot = await ref.collection('questions').where('generationJobId', '==', req.params.jobId).get();
    if (snapshot.size !== job.data().target) return res.status(409).json({ error: 'Generated question count changed. Review the bank before approval.' });
    for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
      const batch = db.batch();
      snapshot.docs.slice(offset, offset + 400).forEach(doc => batch.update(doc.ref, { reviewStatus: 'approved', reviewRequired: false, reviewedBy: req.user.email || req.user.userId || '', reviewedAt: new Date().toISOString() }));
      await batch.commit();
    }
    await ref.set({ generatedReviewStatus: 'approved' }, { merge: true });
    res.json({ message: 'Generated bank approved for paper generation.' });
  } catch (error) { respondError(res, error); }
}
module.exports = { upload, uploadFile, getQuestionBanks, getBankQuestions, updateBankQuestion, approveGeneratedBank, approveAllBankQuestions, deleteQuestionBank };
