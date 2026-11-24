const { extractDocument, parseSyllabus } = require('../services/materialService');
const { upload, metadata, courseDocId, storeSource, cleanup, respondError } = require('../services/ingestionService');
const { createGenerationJob, readGenerationJob, resumeGenerationJob, abandonGenerationJob } = require('../services/generationJobService');

async function uploadSyllabus(req, res) {
  try {
    const meta = metadata(req);
    const syllabus = await parseSyllabus(await extractDocument(req.file.path, req.file.originalname), meta.courseTitle);
    const source = await storeSource(req.file, 'syllabi', meta.tenantId);
    const bankId = courseDocId(meta.tenantId, meta.courseTitle);
    const data = { ...syllabus, ...meta, ...source, uploadedAt: new Date().toISOString() };
    const generation = await createGenerationJob(bankId, data, meta);
    res.status(202).json({ message: `Syllabus parsed. Generating ${generation.targetQuestions} L1–L3 review candidates in bounded batches.`, data, generation });
  } catch (error) { respondError(res, error); }
  finally { await cleanup(req); }
}

async function getGeneration(req, res) {
  try { res.json(await readGenerationJob(req.params.bankId, req.params.jobId, req.user.tenantId)); }
  catch (error) { respondError(res, error); }
}
async function resumeGeneration(req, res) {
  try {
    const job = await resumeGenerationJob(req.params.bankId, req.params.jobId, req.user.tenantId);
    res.status(202).json(job);
  } catch (error) { respondError(res, error); }
}
async function abandonGeneration(req, res) {
  try { res.json(await abandonGenerationJob(req.params.bankId, req.params.jobId, req.user.tenantId)); }
  catch (error) { respondError(res, error); }
}

module.exports = { upload, uploadSyllabus, getGeneration, resumeGeneration, abandonGeneration };
