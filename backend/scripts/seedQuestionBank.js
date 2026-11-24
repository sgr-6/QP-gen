#!/usr/bin/env node
// Seed a subject's question bank straight into Firestore, mirroring POST /api/upload.
// Usage:
//   node scripts/seedQuestionBank.js <file> --tenant <id> --course OS --department ISE \
//     --semester 4 --code 23ISI404 [--approve] [--dry-run]
// --approve marks every usable question approved so papers can be drafted immediately.
// --dry-run parses and prints a summary without writing anything.
const path = require('path');
const crypto = require('crypto');
process.chdir(path.join(__dirname, '..'));
require('dotenv').config({ quiet: true });

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));

async function main() {
  const meta = { tenantId: option('tenant'), courseTitle: option('course'), department: option('department'), semester: option('semester'), subjectCode: option('code') };
  const missing = Object.entries(meta).filter(([, value]) => !value || !String(value).trim()).map(([key]) => key);
  if (!file || missing.length) throw new Error(`Usage: node scripts/seedQuestionBank.js <file> --tenant --course --department --semester --code [--approve] [--dry-run]. Missing: ${[!file && 'file', ...missing].filter(Boolean).join(', ')}`);

  const { db, admin } = require('../src/config/firebaseAdmin');
  const { parseFile } = require('../src/services/parserService');
  const { courseDocId, storeSource } = require('../src/services/ingestionService');
  const { GENERATION_LEVELS, normalizeModule } = require('../src/services/bloomService');

  const bankId = courseDocId(meta.tenantId, meta.courseTitle);
  const syllabus = await db.collection('syllabi').doc(bankId).get();
  console.log(`Parsing ${file} for ${bankId} ...`);
  const questions = await parseFile(path.resolve(file), path.extname(file), meta.tenantId, syllabus.exists ? syllabus.data() : null);

  const usable = q => GENERATION_LEVELS.includes(q.btl) && Number.isInteger(q.marks) && q.marks > 0 && normalizeModule(q.module);
  const tally = key => questions.reduce((acc, q) => ({ ...acc, [q[key] ?? 'none']: (acc[q[key] ?? 'none'] || 0) + 1 }), {});
  console.log(JSON.stringify({ parsed: questions.length, usableForPapers: questions.filter(usable).length, modules: tally('module'), btl: tally('btl'), marks: tally('marks') }));
  if (flag('dry-run')) return;

  const bankRef = db.collection('question_banks').doc(bankId);
  const previous = await bankRef.collection('questions').get();
  const normalize = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const known = new Set(previous.docs.map(doc => normalize(doc.data().questionText)));
  const fresh = questions.filter(q => !known.has(normalize(q.questionText)));
  const approve = flag('approve');
  const reviewedAt = new Date().toISOString();
  const uploadId = crypto.randomUUID();
  const source = await storeSource({ path: path.resolve(file), originalname: path.basename(file), mimetype: 'application/octet-stream' }, 'source_files', meta.tenantId);

  for (let offset = 0; offset < fresh.length; offset += 400) {
    const batch = db.batch();
    fresh.slice(offset, offset + 400).forEach((q, index) => {
      const approved = approve ? usable(q) : !q.reviewRequired;
      batch.set(bankRef.collection('questions').doc(`upload_${uploadId}_${offset + index}`), {
        ...q, tenantId: meta.tenantId, uploadId, source: 'uploaded-bank',
        reviewStatus: approved ? 'approved' : 'pending_review',
        ...(approve && approved ? { reviewRequired: false, reviewedBy: 'seed-script', reviewedAt } : {})
      });
    });
    await batch.commit();
  }
  const all = await bankRef.collection('questions').get();
  await bankRef.set({ ...meta, ...source, uploadedAt: admin.firestore.FieldValue.serverTimestamp(), totalQuestions: all.size, uploadedBy: 'seed-script' }, { merge: true });
  console.log(`Stored ${fresh.length} new question(s) (${questions.length - fresh.length} duplicate(s) skipped); bank now has ${all.size}. ${approve ? `${fresh.filter(usable).length} approved for paper generation.` : 'Review them in the app before drafting.'}`);
}

main().then(() => process.exit(0), error => { console.error(`Seed failed: ${error.message}`); process.exit(1); });
