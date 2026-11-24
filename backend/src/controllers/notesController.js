const { db } = require('../config/firebaseAdmin');
const { extractDocument, parseNotes } = require('../services/materialService');
const { normalizeModule } = require('../services/bloomService');
const { upload, metadata, courseDocId, storeSource, cleanup, respondError } = require('../services/ingestionService');

async function uploadNotes(req, res) {
  try {
    const meta = metadata(req);
    const module = normalizeModule(req.body.moduleNumber);
    if (!module) return res.status(400).json({ error: 'Valid module number is required.' });
    const docId = courseDocId(meta.tenantId, meta.courseTitle);
    const syllabus = await db.collection('syllabi').doc(docId).get();
    if (syllabus.exists && !(syllabus.data().modules || []).some(m => m.moduleNumber === module)) return res.status(400).json({ error: 'Module does not exist in this subject syllabus.' });
    const notes = await parseNotes(await extractDocument(req.file.path, req.file.originalname));
    const source = await storeSource(req.file, 'notes', meta.tenantId);
    await db.collection('notes').doc(docId).set({ ...meta, modules: { [module.slice(1)]: { ...notes, ...source, uploadedAt: new Date().toISOString(), uploadedBy: req.user.email || req.user.userId || '' } } }, { merge: true });
    await db.collection('question_banks').doc(docId).set({ ...meta, notesAvailable: true }, { merge: true });
    res.json({ message: 'All notes chunks processed and stored for topic-based generation.', data: { docId, moduleNumber: module, ...notes } });
  } catch (error) { respondError(res, error); }
  finally { await cleanup(req); }
}
module.exports = { upload, uploadNotes };
