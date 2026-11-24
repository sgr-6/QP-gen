// Revised Bloom's taxonomy (Anderson & Krathwohl): classify the demanded
// cognitive process, not the presence of a verb somewhere in the question.
const BLOOM = {
  L1: { name: 'Remember', definition: 'Retrieve or recognize previously learned facts.', verbs: ['define', 'list', 'name', 'recall', 'identify', 'state', 'label', 'match'] },
  L2: { name: 'Understand', definition: 'Explain meaning, summarize, interpret or compare known concepts.', verbs: ['explain', 'describe', 'summarize', 'classify', 'compare', 'illustrate', 'interpret', 'outline'] },
  L3: { name: 'Apply', definition: 'Execute a known procedure in a supplied situation.', verbs: ['apply', 'calculate', 'solve', 'compute', 'demonstrate', 'use', 'implement', 'execute'] },
  L4: { name: 'Analyze', definition: 'Break information into parts and examine relationships, causes or evidence.', verbs: ['analyze', 'analyse', 'differentiate', 'distinguish', 'examine', 'investigate', 'diagnose'] },
  L5: { name: 'Evaluate', definition: 'Make and justify a judgment against explicit criteria or evidence.', verbs: ['evaluate', 'justify', 'critique', 'assess', 'recommend', 'defend', 'judge'] },
  L6: { name: 'Create', definition: 'Synthesize an original design, plan, model or solution under constraints.', verbs: ['design', 'create', 'formulate', 'develop', 'construct', 'propose', 'invent'] }
};
const GENERATION_LEVELS = ['L1', 'L2', 'L3'];
const validLevel = value => /^L[1-6]$/.test(value || '');
const normalizeModule = value => {
  // Accepts 'M1', 'Module 1', 'MODULE - 1', 'Module-1', 'Unit: 2'; rejects 'Unit -2' (reads as negative).
  const match = String(value ?? '').trim().match(/^(?:(?:m|mod|module|unit)(?:\s*[:.#]?\s*|\s+[-–]\s+|[-–]))?(\d+)$/i);
  return match && Number(match[1]) > 0 ? `M${Number(match[1])}` : null;
};

function classifyBloom(text, proposedLevel = null, rationale = '') {
  const clean = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/^\s*(?:Q\s*)?\d+[.)]?\s*/i, '').toLowerCase();
  // Only imperative/question clauses count; quoted terminology is not an action.
  const clauses = clean.split(/(?:[.;?]\s+|\n|\band then\b)/).flatMap(clause => {
    // In 'explain why engineers compare and design', the embedded verbs
    // describe the subject matter, not additional learner instructions.
    if (/^\s*(?:explain|describe)\s+(?:how|why|what|whether|that)\b/.test(clause)) return [clause];
    return clause.split(/\band\s+(?=(?:explain|calculate|analy[sz]e|evaluate|design|justify|compare|derive|solve)\b)/);
  });
  const levels = [];
  for (const clause of clauses) {
    const c = clause.trim().replace(/^(?:[a-z][.)]\s*|\d+[.)]\s*|please\s+)/, '');
    const action = c.match(/^(?:briefly\s+)?([a-z]+)/)?.[1];
    if (/^(?:what|who|when|where)\b/.test(c)) { levels.push('L1'); continue; }
    if (/^(?:how|why)\b/.test(c)) { levels.push('L2'); continue; }
    let level = Object.keys(BLOOM).find(key => BLOOM[key].verbs.includes(action));
    // Shared verbs in the reference table need context.
    if (['compare', 'distinguish', 'examine'].includes(action)) {
      level = /\b(?:causes?|relationships?|evidence|components?|trade-offs?|bottlenecks?)\b/.test(c) ? 'L4' : 'L2';
    }
    if (['design', 'create', 'construct', 'develop', 'formulate', 'propose'].includes(action) && /\b(?:using|apply|given)\b.*\b(?:algorithm|formula|procedure)\b/.test(c) && !/\b(?:original|novel|constraints?)\b/.test(c)) level = 'L3';
    if (action === 'determine' || action === 'derive') level = /\b(?:safe|optimal|criteria|justify)\b/.test(c) ? 'L4' : 'L3';
    if (level) levels.push(level);
  }
  const detected = levels.sort().at(-1);
  if (detected) {
    return { btl: detected, confidence: 'rule-based', rationale: BLOOM[detected].definition, reviewRequired: Boolean(validLevel(proposedLevel) && proposedLevel !== detected) };
  }
  if (validLevel(proposedLevel) && typeof rationale === 'string' && rationale.trim().length >= 20) {
    return { btl: proposedLevel, confidence: 'ai-provisional', rationale: rationale.trim(), reviewRequired: true };
  }
  return { btl: null, confidence: 'unresolved', rationale: 'The cognitive demand needs human review.', reviewRequired: true };
}

function mapCourseOutcome(question, syllabus, proposedCo = null, module = null) {
  const outcomes = syllabus?.courseOutcomes || [];
  if (!outcomes.length) return { co: null, coMappingSource: 'unavailable' };
  const allowed = outcomes.filter(outcome => !outcome.modules?.length || outcome.modules.includes(module));
  if (allowed.some(outcome => outcome.id === proposedCo)) return { co: proposedCo, coMappingSource: 'syllabus-ai-provisional' };
  const words = new Set(String(question).toLowerCase().match(/[a-z]{4,}/g) || []);
  const scored = allowed.map(outcome => ({ outcome, score: (outcome.description.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => words.has(w)).length })).sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0 && scored[0].score > (scored[1]?.score || 0)) return { co: scored[0].outcome.id, coMappingSource: 'syllabus-keywords-provisional' };
  return { co: null, coMappingSource: 'unresolved' };
}

const bloomPrompt = Object.entries(BLOOM).map(([key, value]) => `${key} ${value.name}: ${value.definition} Typical verbs: ${value.verbs.join(', ')}.`).join('\n') + '\nShared verbs are NOT definitive: compare known concepts=L2; analyze relationships=L4; execute an existing design procedure=L3; original constrained design=L6. Never assign CO by module number or topic difficulty.';
const generationBloomPrompt = GENERATION_LEVELS.map(level => `${level} ${BLOOM[level].name}: ${BLOOM[level].definition} Typical verbs: ${BLOOM[level].verbs.join(', ')}.`).join('\n');
module.exports = { BLOOM, GENERATION_LEVELS, validLevel, normalizeModule, classifyBloom, mapCourseOutcome, bloomPrompt, generationBloomPrompt };
