const { db } = require('../config/firebaseAdmin');
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: false, breaks: true });
const { requestJson } = require('./structuredAiService');
const { BLOOM, GENERATION_LEVELS, classifyBloom, mapCourseOutcome, normalizeModule } = require('./bloomService');

const SHAPES = {
  semester: { modules: 5, perSplit: 20, total: 100, maxL1L2: 30, duration: '3 Hours', title: 'Semester End Examination' },
  internal: { modules: 2, perSplit: 25, total: 50, maxL1L2: 15, duration: '90 Minutes', title: 'Internal Assessment' }
};
const MIN_NEW_MARKS = 3;
const WRITE_ATTEMPTS = 3;
const QUESTION_BATCH_SIZE = 4;

const getL1L2Marks = split => split.reduce((sum, q) => sum + (['L1', 'L2'].includes(q.btl) ? Number(q.marks) : 0), 0);
const normalizeText = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

function buildValidSplit(pool, targetMarks) {
  const candidates = pool.filter(q => Number.isInteger(q.marks) && q.marks > 0 && q.marks <= targetMarks);
  // Preserve assigned marks. Never inflate one question to fill a section.
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const pair = [candidates[i], candidates[j]];
      if (pair.reduce((n, q) => n + q.marks, 0) === targetMarks && (!best || getL1L2Marks(pair) < getL1L2Marks(best))) best = pair;
      for (let k = j + 1; k < candidates.length; k++) {
        const triple = [...pair, candidates[k]];
        if (triple.reduce((n, q) => n + q.marks, 0) === targetMarks && (!best || getL1L2Marks(triple) < getL1L2Marks(best))) best = triple;
      }
    }
  }
  return best;
}

// Chooses bank questions for one 2–3 question split; any shortfall becomes new L3 slots with fixed marks.
function planSplit(pool, target, l1l2Budget) {
  const usable = pool.filter(q => q.marks <= target);
  let best = { bank: [], newMarks: [Math.ceil(target / 2), Math.floor(target / 2)], score: Infinity };
  const consider = chosen => {
    const gap = target - chosen.reduce((n, q) => n + q.marks, 0);
    const l1l2 = getL1L2Marks(chosen);
    if (gap < 0 || l1l2 > l1l2Budget) return;
    let newMarks;
    if (gap === 0) newMarks = chosen.length >= 2 ? [] : null;
    else if (!chosen.length) newMarks = [Math.ceil(target / 2), Math.floor(target / 2)];
    else if (chosen.length === 1 && gap > 20) newMarks = [Math.ceil(gap / 2), Math.floor(gap / 2)];
    else newMarks = chosen.length <= 2 && gap >= MIN_NEW_MARKS && gap <= 20 ? [gap] : null;
    if (!newMarks) return;
    const score = newMarks.length * 10000 + gap * 10 + l1l2;
    if (score < best.score) best = { bank: chosen, newMarks, score };
  };
  consider([]);
  for (let i = 0; i < usable.length; i++) {
    consider([usable[i]]);
    for (let j = i + 1; j < usable.length; j++) {
      consider([usable[i], usable[j]]);
      for (let k = j + 1; k < usable.length; k++) consider([usable[i], usable[j], usable[k]]);
    }
  }
  return best;
}

function validateAcademicRigor(paper) {
  const maximum = paper.modules.reduce((sum, mod) => sum + Math.max(getL1L2Marks(mod.splitA), getL1L2Marks(mod.splitB)), 0);
  const limit = (paper.totalMarks || 100) * 0.3;
  paper.warnings ||= [];
  if (maximum > limit) paper.warnings.push(`Maximum answerable L1/L2 marks (${maximum}) exceeds the 30% limit (${limit}).`);
  return maximum <= limit;
}

const fatalProviderError = error => {
  const status = Number(error?.status || error?.response?.status);
  if (status >= 400 && status < 500 && status !== 408) return true;
  return /budget reached|not configured|input exceeds|credits are nearly exhausted|All OpenRouter API keys are cooling/i.test(error?.message || '');
};

function newQuestionIssue(item, seen) {
  const text = typeof item?.questionText === 'string' ? item.questionText.trim() : '';
  if (text.length < 15 || text.length > 1500) return 'question text was missing or not 15–1500 characters';
  if (seen.has(normalizeText(text))) return 'it repeated an existing question';
  const { btl } = classifyBloom(text, 'L3', item.bloomRationale || '');
  if (!btl) return 'its Bloom level could not be verified';
  if (!GENERATION_LEVELS.includes(btl)) return `it demands ${btl} (${BLOOM[btl].name}); only Bloom L1–L3 is allowed`;
  if (btl !== 'L3') return `it is ${btl} (${BLOOM[btl].name}), but the 30% L1/L2 limit requires L3 (Apply)`;
  return null;
}

function moduleContext(syllabus, notes, moduleNumber, bank = []) {
  const mod = (syllabus?.modules || []).find(m => normalizeModule(m.moduleNumber) === moduleNumber);
  const note = notes?.[moduleNumber] || notes?.[moduleNumber.slice(1)];
  const topics = (mod?.topics || note?.keyTopics || []).slice(0, 25).map(topic => String(topic).slice(0, 200));
  const context = { topics, notes: note?.summary ? String(note.summary).slice(0, 600) : undefined };
  // Without a syllabus or notes for this module, the HOD's approved questions are the only topic source.
  if (!topics.length && !context.notes) {
    const examples = bank.filter(q => normalizeModule(q.module) === moduleNumber).slice(0, 10).map(q => String(q.questionText).slice(0, 200));
    if (examples.length) context.bankTopicExamples = examples;
  }
  return context;
}
const hasModuleContext = context => Boolean(context.topics.length || context.notes || context.bankTopicExamples);

async function writeMissingQuestions({ slots, courseTitle, syllabus, notes, existing, bank = [] }) {
  const written = new Map();
  const rejections = new Map();
  const seen = new Set(existing.map(normalizeText));
  let lastError = null;
  let batchSize = QUESTION_BATCH_SIZE;
  attempts: for (let attempt = 0; attempt < WRITE_ATTEMPTS && written.size < slots.length; attempt++) {
    const remaining = slots.filter(slot => !written.has(slot.slotId));
    const size = batchSize;
    for (let offset = 0; offset < remaining.length; offset += size) {
      const pending = remaining.slice(offset, offset + size);
      const modules = [...new Set(pending.map(slot => slot.module))];
      const outcomes = (syllabus?.courseOutcomes || []).map(o => ({ id: o.id, description: String(o.description || '').slice(0, 200), modules: o.modules }));
      const prompt = `Write ${pending.length} NEW exam question(s) for the course "${courseTitle}", one per slot below.
Every question MUST be Bloom L3 (Apply): ${BLOOM.L3.definition} The student executes a known method, formula, algorithm or procedure on concrete data or a stated scenario that the question supplies.
Rules:
- Begin with an L3 verb: ${BLOOM.L3.verbs.join(', ')}. Do not ask the student to define, list, explain, describe, analyze, evaluate, justify or design.
- Never begin ANY sentence with these verbs (they signal Bloom L4–L6): ${[...BLOOM.L4.verbs, ...BLOOM.L5.verbs, ...BLOOM.L6.verbs].join(", ")}. Say "Write" or "Implement" instead of "Create", "Design", "Develop" or "Construct".
- Include the specific data, schema, code or scenario needed, scaled to the slot's marks.
- Stay within that slot's module topics. When MODULE CONTEXT gives only bankTopicExamples, cover those same topics with a different task. Do not repeat or paraphrase an existing question.
- "co" must be an outcome id listed for that module, or null if none fits. Never invent an outcome.
- Keep each question under 120 words. Return question text only, no solutions, analysis, headers or a whole paper.
- Do not put marks, numbering or Bloom labels in questionText.
${attempt && rejections.size ? `Previous answers were rejected: ${JSON.stringify(Object.fromEntries([...rejections].filter(([id]) => pending.some(s => s.slotId === id))))}\n` : ''}
SLOTS: ${JSON.stringify(pending.map(({ slotId, module, marks }) => ({ slotId, module, marks })))}
MODULE CONTEXT: ${JSON.stringify(Object.fromEntries(modules.map(m => [m, moduleContext(syllabus, notes, m, bank)])))}
OUTCOMES: ${JSON.stringify(outcomes)}
EXISTING QUESTIONS: ${JSON.stringify(existing.slice(0, 40).map(text => String(text).slice(0, 150)))}
Return only JSON: {"questions":[{"slotId":"M1-A2","questionText":"...","co":"CO1","bloomRationale":"One sentence on why this is L3."}]}`;
      let response;
      try {
        response = await requestJson({ prompt, task: 'generation', maxTokens: 1500 + pending.length * 400 });
      } catch (error) {
        lastError = error;
        if (fatalProviderError(error)) break attempts;
        if (/incomplete \(length\)/i.test(error.message || '') || error instanceof SyntaxError) {
          batchSize = 1;
          if (attempt === 0) continue attempts;
        }
        continue;
      }
      for (const item of Array.isArray(response?.questions) ? response.questions : []) {
        const slot = pending.find(s => s.slotId === item?.slotId);
        if (!slot || written.has(slot.slotId)) continue;
        const issue = newQuestionIssue(item, seen);
        if (issue) { rejections.set(slot.slotId, issue); continue; }
        const questionText = item.questionText.trim();
        seen.add(normalizeText(questionText));
        rejections.delete(slot.slotId);
        written.set(slot.slotId, { id: null, isNew: true, questionText, marks: slot.marks, btl: 'L3', module: slot.module, reviewRequired: true, ...mapCourseOutcome(questionText, syllabus, item.co, slot.module) });
      }
    }
  }
  const missing = slots.filter(slot => !written.has(slot.slotId));
  if (missing.length) {
    const detail = missing.slice(0, 3).map(slot => `${slot.module} part ${slot.split} (${slot.marks} marks): ${rejections.get(slot.slotId) || lastError?.message || 'AI did not return this question'}`).join('; ');
    throw new Error(`Could not write ${missing.length} required new L3 question(s). ${detail}. Approve more L3 questions in these modules, or try again.`);
  }
  return written;
}

const generatePaper = async (courseTitle, examType = 'semester', examConfig = null, tenantId, formatSelection = 'sjb', customFormatInstructions = '') => {
  if (!tenantId) {
    throw new Error('Tenant ID is required for generation');
  }

  let allQuestions = [];
  const banksQuery = await db.collection('question_banks')
    .where('courseTitle', '==', courseTitle)
    .where('tenantId', '==', tenantId)
    .get();

  if (!banksQuery.empty) {
    const bankDoc = banksQuery.docs[0];
    const questionsSnapshot = await bankDoc.ref.collection('questions').get();
    questionsSnapshot.forEach(doc => allQuestions.push({ id: doc.id, ...doc.data() }));
    if (allQuestions.length && !allQuestions.some(q => q.reviewStatus !== 'pending_review')) {
      throw new Error('Review and approve the question bank before generating a paper.');
    }
    allQuestions = allQuestions.filter(q => q.reviewStatus !== 'pending_review' && !q.isDuplicate && GENERATION_LEVELS.includes(q.btl) && Number.isInteger(q.marks) && q.marks > 0 && normalizeModule(q.module));
    if (questionsSnapshot.size && !allQuestions.length) {
      throw new Error('The question bank has no approved questions with Bloom L1–L3, valid marks and a module. Correct or approve at least one question before generating a paper.');
    }
  }

  const docId = `${tenantId}_${courseTitle.replace(/\s+/g, '_').toLowerCase()}`;
  let syllabus = null;
  const syllabusDoc = await db.collection('syllabi').doc(docId).get();
  if (syllabusDoc.exists) syllabus = syllabusDoc.data();

  let notes = null;
  const notesDoc = await db.collection('notes').doc(docId).get();
  if (notesDoc.exists) {
    const data = notesDoc.data();
    if (data.modules) notes = data.modules;
    else if (data.summary) notes = { 1: { summary: data.summary, keyTopics: data.keyTopics } };
  }

  if (allQuestions.length === 0 && !syllabus && !notes) {
    throw new Error(`No question bank, syllabus, or notes found for course: ${courseTitle}. Cannot generate paper.`);
  }

  const isInternal = examType === 'internal';
  const shape = isInternal ? SHAPES.internal : SHAPES.semester;
  // An even per-module L1/L2 allowance keeps the answerable maximum within 30% by construction.
  const moduleBudget = Math.floor(shape.maxL1L2 / shape.modules);
  const slots = [];
  const deterministicModules = Array.from({ length: shape.modules }, (_, index) => {
    const moduleNumber = `M${index + 1}`;
    const pool = allQuestions.filter(q => normalizeModule(q.module) === moduleNumber);
    const splitA = buildValidSplit(pool, shape.perSplit);
    const splitB = splitA && buildValidSplit(pool.filter(q => !splitA.includes(q)), shape.perSplit);
    return splitA && splitB ? { moduleNumber, splitA, splitB } : null;
  });
  const deterministic = deterministicModules.every(Boolean) && deterministicModules.reduce((sum, mod) => sum + Math.max(getL1L2Marks(mod.splitA), getL1L2Marks(mod.splitB)), 0) <= shape.maxL1L2;
  const modules = deterministic ? deterministicModules.map(mod => ({ ...mod, splitA: mod.splitA.map(q => ({ ...q, isNew: false })), splitB: mod.splitB.map(q => ({ ...q, isNew: false })) })) : Array.from({ length: shape.modules }, (_, index) => {
    const moduleNumber = `M${index + 1}`;
    const pool = allQuestions.filter(q => normalizeModule(q.module) === moduleNumber);
    const planA = planSplit(pool, shape.perSplit, moduleBudget);
    const planB = planSplit(pool.filter(q => !planA.bank.includes(q)), shape.perSplit, moduleBudget);
    for (const [split, plan] of [['A', planA], ['B', planB]]) {
      plan.newMarks.forEach((marks, n) => slots.push({ slotId: `${moduleNumber}-${split}${plan.bank.length + n + 1}`, module: moduleNumber, split, marks }));
    }
    return { moduleNumber, splitA: planA.bank.map(q => ({ ...q, isNew: false })), splitB: planB.bank.map(q => ({ ...q, isNew: false })) };
  });

  const warnings = [];
  if (slots.length) {
    const uncovered = [...new Set(slots.map(s => s.module))].filter(m => !hasModuleContext(moduleContext(syllabus, notes, m, allQuestions)));
    if (uncovered.length) {
      throw new Error(`The approved bank cannot fill ${slots.length} question slot(s) within the 30% L1/L2 limit, and ${uncovered.join(', ')} ha${uncovered.length === 1 ? 's' : 've'} no syllabus topics, notes or approved questions to write new L3 questions from. Approve questions in ${uncovered.length === 1 ? 'that module' : 'those modules'} or upload the syllabus.`);
    }
    const written = await writeMissingQuestions({ slots, courseTitle, syllabus, notes, existing: allQuestions.map(q => q.questionText), bank: allQuestions });
    for (const slot of slots) modules.find(m => m.moduleNumber === slot.module)[`split${slot.split}`].push(written.get(slot.slotId));
    warnings.push(`${slots.length} new L3 question(s) were written by AI because the approved bank lacked enough L3 questions within the 30% L1/L2 limit (${[...new Set(slots.map(s => s.module))].join(', ')}). Review them before submitting.`);
  }

  const paper = {
    courseTitle, examType, totalMarks: shape.total, warnings, modules,
    headerMetadata: { institution: formatSelection === 'sjb' ? 'SJB Institute of Technology (Autonomous)' : 'Visvesvaraya Technological University, Belagavi', examTitle: shape.title, semester: '', subjectCode: banksQuery.docs[0]?.data().subjectCode || '', date: '', duration: shape.duration, marks: shape.total },
    formatSelection, generatedAt: new Date().toISOString(),
    analysis: { coBtlErrors: [], bufferMarksUsed: [], overallToughness: 'Human review required' }
  };
  const used = new Set();
  for (const mod of paper.modules) {
    for (const split of [mod.splitA, mod.splitB]) {
      if (split.length < 2 || split.length > 3 || split.reduce((sum, q) => sum + q.marks, 0) !== shape.perSplit) throw new Error(`Paper section marks for ${mod.moduleNumber} are invalid.`);
      for (const q of split) {
        const key = q.id || normalizeText(q.questionText);
        if (used.has(key)) throw new Error('Paper contains duplicate questions.');
        used.add(key);
        q.htmlText = md.render(q.questionText);
      }
    }
  }
  if (!validateAcademicRigor(paper)) throw new Error('Generated paper violates the maximum answerable 30% L1/L2 constraint.');
  if (paper.modules.some(mod => [...mod.splitA, ...mod.splitB].some(q => !q.co))) paper.warnings.push('Some COs are unmapped because the syllabus has no matching explicit outcome.');
  return paper;
};

module.exports = { generatePaper, buildValidSplit, planSplit, validateAcademicRigor, getL1L2Marks };
