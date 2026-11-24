'use strict';

// Fixture-only UI regression. No backend, credentials, or user's Chrome profile.
// Run: G:/Projects/qpgen/.tools/node-v24.22.1-win-x64/node.exe G:/Projects/qpgen/backend/tests/generationProgress.browser.cjs
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const puppeteer = require('puppeteer');

const FRONTEND = 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SECTION = 'section[aria-label="Question generation and review"]';
const USER = { email: 'offline-hod@generation-fixture.invalid', role: 'hod', userId: 'fixture-hod', tenantId: 'fixture-tenant' };
const GENERATION = { bankId: 'fixture-browser-bank', jobId: 'fixture-browser-job' };
const STATUS_PATH = `/api/syllabus/generation/${GENERATION.bankId}/${GENERATION.jobId}`;
const BANK_PATH = `/api/question-banks/${GENERATION.bankId}`;
const QUESTIONS_PATH = `${BANK_PATH}/questions`;
const OLD_ERROR = 'Fixture saved failure: generation interrupted.';
const CONFLICT = 'Fixture conflict: this generation is already running.';
const TRANSIENT = 'Fixture transient status failure; retry should recover.';
const REJECTED_REASON = 'Fixture validation: the draft did not explain its Bloom level.';
const REJECTED_DRAFT = 'Fixture rejected draft excerpt.';
const SKIPPED_WARNING = 'Fixture: 3 questions were skipped after 3 attempts or an AI limit. S1: Provider overloaded.';
const QUESTIONS = Array.from({ length: 18 }, (_, index) => ({
  id: `fixture-question-${index + 1}`,
  questionText: `Fixture question ${index + 1}: Explain syllabus topic ${index % 3 + 1}.`,
  marks: 5, btl: `L${index % 3 + 1}`, co: 'CO1', module: 'M1',
  sourceTopic: `Fixture topic ${index % 3 + 1}`,
  bloomRationale: 'Fixture Bloom rationale', topicEvidence: 'Fixture syllabus evidence',
  reviewStatus: 'pending_review',
}));

function job(status, count, resumable = false) {
  const skipped = status === 'completed_with_skips';
  return {
    ...GENERATION, status, resumable,
    coverage: {
      generatedQuestions: count, expectedQuestions: 18,
      skippedQuestions: skipped ? 3 : 0,
      skippedSlots: skipped ? ['fixture-slot-1', 'fixture-slot-2', 'fixture-slot-3'] : [],
      coveredTopics: count === 18 ? 3 : 1, totalTopics: 3,
      percentage: count === 18 ? 100 : 33, complete: count === 18 && !skipped,
      bloomCounts: { L1: Math.ceil(count / 3), L2: Math.floor(count / 3), L3: Math.floor(count / 3) },
      missingTopics: count === 18 ? [] : ['Fixture topic 2', 'Fixture topic 3'],
    },
    sourceTopics: [1, 2, 3].map(index => ({ module: 'M1', topic: `Fixture topic ${index}` })),
    courseOutcomes: [{ id: 'CO1', description: 'Explain the fixture syllabus topics.' }],
    usage: { calls: 0, usedTokens: 0, cost: 0 },
    ...(status === 'failed' || skipped ? {
      error: skipped ? SKIPPED_WARNING : OLD_ERROR,
      validationFailures: skipped
        ? [1, 2, 3].map(index => ({ slotId: `fixture-slot-${index}`, topic: `Fixture topic ${index}`, reason: 'Provider overloaded.', questionText: '' }))
        : [{ slotId: 'fixture-slot-1', topic: 'Fixture topic 1', reason: REJECTED_REASON, questionText: REJECTED_DRAFT }],
    } : {}),
  };
}

async function offlineDraft() {
  const questions = Array.from({ length: 5 }, (_, module) => [5, 15, 10].map((marks, index) => ({ id: `${module}_${index}`, module: `M${module + 1}`, marks, btl: index ? 'L3' : 'L1', co: null, reviewStatus: 'approved', questionText: `${index ? 'Execute' : 'State'} the supplied SQL query for fixture case ${module}_${index}.` }))).flat();
  const bank = { data: () => ({ subjectCode: '23ISI503' }), ref: { collection: () => ({ get: async () => ({ size: questions.length, forEach: callback => questions.forEach(q => callback({ id: q.id, data: () => q })) }) }) } };
  const source = { courseTitle: 'DBMS', modules: Array.from({ length: 5 }, (_, i) => ({ moduleNumber: `M${i + 1}`, topics: ['SQL query execution'] })), courseOutcomes: [] };
  const db = { collection: name => {
    if (name === 'question_banks') return { where() { return this; }, get: async () => ({ empty: false, docs: [bank] }) };
    return { doc: () => ({ get: async () => ({ exists: name === 'syllabi', data: () => source }) }) };
  } };
  const sizes = [];
  const requestJson = async ({ prompt }) => {
    const slots = JSON.parse(prompt.match(/^SLOTS: (.+)$/m)[1]);
    sizes.push(slots.length);
    if (sizes.length === 1) throw new Error('AI response was incomplete (length). No partial JSON was accepted.');
    return { questions: slots.map(slot => ({ slotId: slot.slotId, questionText: `Execute SELECT id FROM Orders WHERE total > 50 on rows (1, 20), (2, 80) for fixture case ${slot.slotId}.`, co: null })) };
  };
  const firebasePath = require.resolve('../src/config/firebaseAdmin');
  const aiPath = require.resolve('../src/services/structuredAiService');
  const paperPath = require.resolve('../src/services/paperGeneratorService');
  const saved = [firebasePath, aiPath, paperPath].map(path => [path, require.cache[path]]);
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: { requestJson } };
  delete require.cache[paperPath];
  try {
    const { generatePaper } = require(paperPath);
    const paper = await generatePaper('DBMS', 'semester', null, USER.tenantId);
    assert.deepEqual(sizes, [4, 1, 1, 1, 1, 1]);
    return paper;
  } finally {
    for (const [path, entry] of saved) {
      if (entry) require.cache[path] = entry;
      else delete require.cache[path];
    }
  }
}

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function waitUI(page, description, predicate, ...args) {
  try {
    const handle = await page.waitForFunction(predicate, { timeout: 20000, polling: 'raf' }, SECTION, ...args);
    await handle.dispose();
  } catch (error) {
    throw new Error(`${description}: ${error.message}`, { cause: error });
  }
}

async function clickButton(page, name, scope = SECTION) {
  const handle = await page.waitForFunction((selector, text) =>
    Array.from(document.querySelectorAll(`${selector} button`))
      .find(button => button.textContent.trim() === text && !button.disabled && button.checkVisibility()),
  { timeout: 20000 }, scope, name);
  try { await handle.asElement().click(); } finally { await handle.dispose(); }
}

async function waitState(page, status, count, { resume = false, clearErrors = true, error = '' } = {}) {
  await waitUI(page, `Expected ${status}, ${count}/18, resume=${resume}`, (selector, expected) => {
    const section = document.querySelector(selector);
    if (!section) return false;
    const progress = section.querySelector('progress');
    const statusElement = section.querySelector('[aria-live] strong');
    const resumeButton = Array.from(section.querySelectorAll('button'))
      .find(button => button.textContent.trim() === 'Resume saved generation');
    const alerts = Array.from(section.querySelectorAll('[role="alert"]')).map(alert => alert.textContent);
    return section.checkVisibility() && statusElement?.textContent === expected.status &&
      progress?.value === expected.count && progress.max === 18 &&
      new RegExp(`${expected.count}\\s*/\\s*18\\s+validated questions`).test(section.textContent) &&
      Boolean(resumeButton) === expected.resume &&
      (!resumeButton || !resumeButton.disabled) &&
      (!expected.clearErrors || alerts.length === 0) &&
      (!expected.error || alerts.some(text => text.includes(expected.error)));
  }, { status, count, resume, clearErrors, error });
}

async function checkLabelAndExpanders(page) {
  await waitUI(page, 'Visible generation restriction to Bloom L1-L3', selector =>
    Array.from(document.querySelectorAll(`${selector} p`)).some(element => {
      const text = element.textContent;
      return element.checkVisibility() && /generat/i.test(text) && /only|restrict|limited/i.test(text) &&
        (/L1\s*[–—-]\s*L3/.test(text) || /L1.*L2.*L3/.test(text));
    }));

  const topics = await page.waitForFunction(selector =>
    Array.from(document.querySelectorAll(`${selector} summary`))
      .find(element => /syllabus topics and outcomes/i.test(element.textContent)),
  { timeout: 20000 }, SECTION);
  try { await topics.asElement().click(); } finally { await topics.dispose(); }
  await waitUI(page, 'Extracted topics and course outcomes expander', selector =>
    Array.from(document.querySelectorAll(`${selector} details[open]`)).some(element =>
      element.innerText.includes('Fixture topic 1') && element.innerText.includes('CO1')));

  const feedback = await page.evaluate(selector =>
    Array.from(document.querySelectorAll(`${selector} summary`))
      .some(element => /validation feedback|skipped or rejected/i.test(element.textContent)), SECTION);
  if (!feedback) return 'optional validation feedback not present';
  const summary = await page.waitForFunction(selector =>
    Array.from(document.querySelectorAll(`${selector} summary`))
      .find(element => /validation feedback|skipped or rejected/i.test(element.textContent)),
  { timeout: 20000 }, SECTION);
  try { await summary.asElement().click(); } finally { await summary.dispose(); }
  await waitUI(page, 'Validation feedback reason and rejected draft', (selector, reason, draft) =>
    Array.from(document.querySelectorAll(`${selector} details[open]`)).some(element =>
      element.innerText.includes(reason) && element.innerText.includes(draft)), REJECTED_REASON, REJECTED_DRAFT);
  return 'validation feedback expander passed';
}

async function typeIntoEditor(page, text) {
  const textarea = await page.$(`${SECTION} textarea`);
  try {
    await textarea.click();
    await page.keyboard.down('Control');
    try { await page.keyboard.press('KeyA'); } finally { await page.keyboard.up('Control'); }
    await page.keyboard.type(text);
  } finally { await textarea.dispose(); }
}

async function reviewQuestions(page, diagnostics) {
  const corrected = 'Fixture corrected question: Explain the reviewed topic using the supplied scenario data.';
  await waitUI(page, 'Auto-loaded first review page and pagination controls', selector => {
    const section = document.querySelector(selector);
    const articles = section?.querySelectorAll('article');
    const buttons = Array.from(section?.querySelectorAll('button') || []);
    return articles?.length === 15 && /18 stored questions\s*·\s*page 1 of 2/.test(section.textContent) &&
      articles[0].textContent.includes('Fixture question 1:') &&
      articles[14].textContent.includes('Fixture question 15:') &&
      buttons.find(button => button.textContent === 'Previous')?.disabled &&
      buttons.find(button => button.textContent === 'Next')?.disabled === false &&
      buttons.some(button => button.textContent === 'Download CSV') &&
      buttons.some(button => button.textContent === 'Approve all usable questions');
  });
  await clickButton(page, 'Next');
  await waitUI(page, 'Second review page', selector => {
    const section = document.querySelector(selector);
    const articles = section?.querySelectorAll('article');
    return articles?.length === 3 && /page 2 of 2/.test(section.textContent) &&
      articles[0].textContent.includes('Fixture question 16:') &&
      articles[2].textContent.includes('Fixture question 18:') &&
      Array.from(section.querySelectorAll('button')).find(button => button.textContent === 'Next')?.disabled;
  });
  await clickButton(page, 'Previous');
  await waitUI(page, 'Return to first review page', selector =>
    document.querySelector(`${selector} article`)?.textContent.includes('Fixture question 1:') &&
    document.querySelectorAll(`${selector} article`).length === 15);
  await clickButton(page, 'Edit / approve');
  await waitUI(page, 'Question editor opens with original text', (selector, original) =>
    document.querySelector(`${selector} textarea`)?.value === original, QUESTIONS[0].questionText);
  await typeIntoEditor(page, 'Fixture unsaved correction; cancel must discard this.');
  await waitUI(page, 'Unsaved correction is editable', selector =>
    document.querySelector(`${selector} textarea`)?.value === 'Fixture unsaved correction; cancel must discard this.');
  await clickButton(page, 'Cancel');
  await waitUI(page, 'Cancel closes editor without changing stored question', (selector, original) =>
    !document.querySelector(`${selector} textarea`) &&
    document.querySelector(`${selector} article`)?.textContent.includes(original), QUESTIONS[0].questionText);
  await clickButton(page, 'Edit / approve');
  await waitUI(page, 'Reopening editor restores original question', (selector, original) =>
    document.querySelector(`${selector} textarea`)?.value === original, QUESTIONS[0].questionText);
  await typeIntoEditor(page, corrected);
  await clickButton(page, 'Save & approve question');
  await waitUI(page, 'Saved correction is approved inline', (selector, correctedText) => {
    const section = document.querySelector(selector);
    const first = section?.querySelector('article');
    return !section?.querySelector('textarea') && first?.textContent.includes(correctedText) && /approved/.test(first?.textContent || '');
  }, corrected);
  await waitUI(page, 'Per-question approval notice is visible', selector =>
    Array.from(document.querySelectorAll(`${selector} [role="status"]`)).some(element => element.textContent.includes('Question corrected and approved')));
  assert.equal(diagnostics.backend.filter(record => record.method === 'PATCH' && record.path === `${QUESTIONS_PATH}/${QUESTIONS[0].id}`).length, 1, 'One PATCH for the edited question');
  await clickButton(page, 'Approve all usable questions');
  await waitUI(page, 'Inline bulk approval confirmation is visible', selector =>
    Boolean(document.querySelector(`${selector} [aria-label="Confirm bulk approval"]`)?.checkVisibility()));
  await clickButton(page, 'Yes, approve all usable');
  await waitUI(page, 'Bulk approval notice is visible', selector =>
    Array.from(document.querySelectorAll(`${selector} [role="status"]`)).some(element => /Approved 18 usable questions/.test(element.textContent)));
  await waitUI(page, 'Reloaded questions all show approved', selector => {
    const articles = Array.from(document.querySelectorAll(`${selector} article`));
    return articles.length === 15 && articles.every(article => article.textContent.includes('approved'));
  });
  assert.equal(diagnostics.backend.filter(record => record.method === 'POST' && record.path === `${QUESTIONS_PATH}/approve-all`).length, 1, 'One bulk approval POST');
}

// Fail closed: only the frontend document/dev assets may reach the network.
// Every HTTP(S) request to port 8080, including OPTIONS and unexpected writes,
// receives a local fixture response. Unknown routes are also test failures.
async function isolatePage(page, mock, diagnostics) {
  await page.setBypassServiceWorker(true);
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('console', message => diagnostics.console.push({
    type: message.type(), text: message.text(), url: message.location().url || '',
  }));
  page.on('pageerror', error => diagnostics.pageErrors.push(error.stack || String(error)));
  page.on('requestfailed', request => {
    if (!diagnostics.closing) diagnostics.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('dialog', dialog => {
    void (async () => {
      if (mock.dialog) {
        const answer = await mock.dialog(dialog);
        if (dialog.type() === 'prompt') await dialog.accept(answer ?? '');
        else if (answer === false) await dialog.dismiss();
        else await dialog.accept();
        return;
      }
      diagnostics.violations.push(`Unexpected ${dialog.type()} dialog: ${dialog.message()}`);
      await dialog.dismiss();
    })().catch(error => diagnostics.violations.push(String(error)));
  });
  page.on('request', request => {
    void (async () => {
      const url = new URL(request.url());
      const method = request.method();
      if (['http:', 'https:'].includes(url.protocol) && url.port === '8080') {
        const record = { method, path: url.pathname, url: request.url() };
        diagnostics.backend.push(record);
        const headers = {
          'Access-Control-Allow-Origin': FRONTEND,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': request.headers()['access-control-request-headers'] || 'Content-Type, Authorization',
          'Access-Control-Max-Age': '0',
          'Cache-Control': 'no-store',
          Vary: 'Origin',
        };
        let response;
        if (method === 'OPTIONS') response = { status: 204 };
        else if (method === 'GET' && url.pathname === '/auth/me') response = { body: { user: USER } };
        else if (method === 'GET' && url.pathname === '/api/question-banks') response = { body: mock.banks || [] };
        else if (method === 'POST' && url.pathname === '/api/draft/generate-draft' && mock.generateDraft) response = await mock.generateDraft(JSON.parse(request.postData() || '{}'));
        else if (method === 'GET' && url.pathname === QUESTIONS_PATH) response = { body: { questions: mock.questions ? mock.questions() : QUESTIONS } };
        else if (method === 'PATCH' && url.pathname.startsWith(`${QUESTIONS_PATH}/`) && mock.updateQuestion) {
          const questionId = decodeURIComponent(url.pathname.slice(QUESTIONS_PATH.length + 1));
          response = await mock.updateQuestion(questionId, JSON.parse(request.postData() || '{}'));
        }
        else if (method === 'POST' && url.pathname === `${QUESTIONS_PATH}/approve-all` && mock.approveAll) response = await mock.approveAll();
        else if (method === 'GET' && url.pathname === STATUS_PATH) response = await mock.status();
        else if (method === 'POST' && url.pathname === `${STATUS_PATH}/resume` && mock.resume) response = await mock.resume();
        else if (method === 'POST' && url.pathname === `${STATUS_PATH}/abandon` && mock.abandon) response = await mock.abandon();
        else if (method === 'DELETE' && url.pathname === BANK_PATH && mock.deleteBank) response = await mock.deleteBank();
        else {
          diagnostics.violations.push(`Unexpected backend request (mocked, never forwarded): ${method} ${url.pathname}`);
          response = { status: 501, body: { error: 'Fixture firewall: request not allowed.' } };
        }
        record.status = response.status || 200;
        if (response.body?.status) record.jobStatus = response.body.status;
        await request.respond({ status: record.status, headers, contentType: 'application/json',
          ...(record.status === 204 ? {} : { body: JSON.stringify(response.body ?? {}) }) });
        return;
      }
      const devAsset = url.origin === FRONTEND && (
        (['GET', 'HEAD'].includes(method) && (url.pathname === '/' || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/__nextjs_font/') || url.pathname === '/favicon.ico')) ||
        (method === 'POST' && url.pathname === '/__nextjs_original-stack-frames')
      );
      if (devAsset) {
        diagnostics.allowed.push({ method, url: request.url() });
        await request.continue();
        return;
      }
      diagnostics.blocked.push(request.url());
      if (url.origin === FRONTEND || request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        diagnostics.violations.push(`Unexpected request (aborted): ${method} ${request.url()}`);
      }
      await request.abort('blockedbyclient');
    })().catch(async error => {
      diagnostics.violations.push(`Interception failed for ${request.method()} ${request.url()}: ${error.message}`);
      if (!request.isInterceptResolutionHandled()) {
        try { await request.abort('blockedbyclient'); } catch { /* Browser cleanup can close the target. */ }
      }
    });
  });
  await page.evaluateOnNewDocument((origin, user, generation) => {
    // WebSockets do not pass through HTTP request interception; permit HMR only.
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        const target = new URL(url, location.href);
        if (target.origin !== origin.replace('http:', 'ws:') || !target.pathname.startsWith('/_next/')) {
          throw new Error(`Fixture firewall blocked WebSocket: ${target.origin}`);
        }
        super(url, protocols);
      }
    };
    if (location.origin === origin) {
      localStorage.clear();
      localStorage.setItem('qpgen_user', JSON.stringify(user));
      localStorage.setItem(`qpgen_generation_${user.email}`, JSON.stringify(generation));
    }
  }, FRONTEND, USER, GENERATION);
}

function checkDiagnostics(diagnostics, expectedWrites) {
  const errors = diagnostics.console.filter(message => message.type === 'error');
  const simulated = errors.filter(message => {
    const match = message.text.match(/^Failed to load resource: the server responded with a status of (400|409|500)\b/);
    if (match && diagnostics.backend.some(record => record.url === message.url && record.status === Number(match[1]))) return true;
    return message.text.startsWith('Generation error:') && diagnostics.backend.some(record => record.path === '/api/draft/generate-draft' && record.status === 400);
  });
  const blockedConsole = errors.filter(message =>
    /^Failed to load resource: net::ERR_(BLOCKED_BY_CLIENT|FAILED)/.test(message.text) && diagnostics.blocked.includes(message.url));
  const unexpectedConsole = errors.filter(message => !simulated.includes(message) && !blockedConsole.includes(message));
  const unexpectedRequests = diagnostics.requestFailures.filter(request => !diagnostics.blocked.includes(request.url));
  assert.deepEqual(diagnostics.violations, [], 'Fixture firewall/interception violations');
  assert.deepEqual(diagnostics.pageErrors, [], 'Uncaught browser errors');
  assert.deepEqual(unexpectedConsole, [], 'Unexpected console errors (not simulated HTTP failures)');
  assert.deepEqual(unexpectedRequests, [], 'Unexpected network failures');
  assert.ok(diagnostics.backend.some(record => record.path === '/auth/me' && record.status === 200), 'Auth must use the fixture');
  const writes = diagnostics.backend.filter(record => !['GET', 'OPTIONS'].includes(record.method));
  assert.equal(writes.filter(record => record.method === 'POST' && record.path === `${STATUS_PATH}/resume`).length,
    expectedWrites.resume || 0, 'Exactly the intended number of mock resume POSTs');
  assert.equal(writes.filter(record => record.method === 'POST' && record.path === `${STATUS_PATH}/abandon`).length,
    expectedWrites.abandon || 0, 'Exactly the intended number of mock abandon POSTs');
  assert.equal(writes.filter(record => record.method === 'DELETE' && record.path === BANK_PATH).length,
    expectedWrites.delete || 0, 'Exactly the intended number of mock delete requests');
  assert.equal(writes.filter(record => record.method === 'PATCH' && record.path.startsWith(`${QUESTIONS_PATH}/`)).length,
    expectedWrites.patch || 0, 'Exactly the intended number of mock question corrections');
  assert.equal(writes.filter(record => record.method === 'POST' && record.path === `${QUESTIONS_PATH}/approve-all`).length,
    expectedWrites.approve || 0, 'Exactly the intended number of mock bulk approvals');
  assert.equal(writes.filter(record => record.method === 'POST' && record.path === '/api/draft/generate-draft').length,
    expectedWrites.generate || 0, 'Exactly the intended number of mock draft-generation requests');
  assert.equal(writes.length,
    (expectedWrites.resume || 0) + (expectedWrites.abandon || 0) + (expectedWrites.delete || 0) + (expectedWrites.patch || 0) + (expectedWrites.approve || 0) + (expectedWrites.generate || 0),
    'No unexpected auth/email/edit/approval/AI writes');
  return `${diagnostics.backend.length} mocked requests; ${simulated.length} expected HTTP console errors; ` +
    `${diagnostics.blocked.length} external requests blocked; no unexpected browser errors`;
}

async function runScenario(browser, name, mock, test, expectedWrites) {
  const context = await browser.createBrowserContext();
  const diagnostics = { console: [], pageErrors: [], requestFailures: [], backend: [], allowed: [], blocked: [], violations: [], closing: false };
  let page;
  try {
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.setViewport({ width: 1440, height: 1100 });
    await isolatePage(page, mock, diagnostics);
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const detail = await test(page, diagnostics);
    const summary = checkDiagnostics(diagnostics, expectedWrites);
    console.log(`PASS ${name}: ${detail ? `${detail}; ` : ''}${summary}`);
  } catch (error) {
    const visible = page && !page.isClosed() ? await page.evaluate(selector =>
      (document.querySelector(selector)?.innerText || document.body.innerText).slice(0, 2500), SECTION).catch(() => '') : '';
    console.error(`FAIL ${name}: ${error.message}\n${JSON.stringify({ visible, backend: diagnostics.backend,
      consoleErrors: diagnostics.console.filter(message => message.type === 'error'), pageErrors: diagnostics.pageErrors,
      violations: diagnostics.violations, requestFailures: diagnostics.requestFailures }, null, 2)}`);
    throw error;
  } finally {
    diagnostics.closing = true;
    mock.release?.();
    await context.close();
  }
}

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'qpgen-generation-browser-'));
  let browser;
  const failures = [];
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME, headless: true, userDataDir: profile,
      args: ['--disable-background-networking', '--disable-component-update', '--disable-domain-reliability',
        '--disable-sync', '--disable-extensions', '--no-first-run', '--no-default-browser-check'],
    });
    const run = async (...args) => {
      try { await runScenario(browser, ...args); } catch (error) { failures.push(new Error(args[0], { cause: error })); }
    };

    const acceptedGate = gate();
    const fixtureQuestions = QUESTIONS.map(question => ({ ...question }));
    let acceptedPosts = 0;
    let acceptedReads = 0;
    await run('failed -> POST 202 queued -> polling running/completed + review UI', {
      status: async () => {
        if (!acceptedPosts) return { body: job('failed', 3, true) };
        await acceptedGate.promise;
        return { body: ++acceptedReads === 1 ? job('running', 6) : job('completed', 18) };
      },
      resume: async () => {
        acceptedPosts++;
        return { status: 202, body: job('queued', 3) };
      },
      questions: () => fixtureQuestions,
      updateQuestion: async (questionId, body) => {
        const index = fixtureQuestions.findIndex(question => question.id === questionId);
        if (index < 0) return { status: 404, body: { error: 'Question not found.' } };
        fixtureQuestions[index] = { ...fixtureQuestions[index], ...body, reviewStatus: 'approved' };
        return { body: { message: 'Question corrected and approved.', question: fixtureQuestions[index] } };
      },
      approveAll: async () => {
        let approved = 0;
        let alreadyApproved = 0;
        fixtureQuestions.forEach(question => {
          if (question.reviewStatus === 'approved') alreadyApproved++;
          else approved++;
          question.reviewStatus = 'approved';
        });
        return { body: { message: `Approved ${approved + alreadyApproved} usable questions.`, approved, alreadyApproved, skipped: 0, coCleared: 0, skippedQuestions: [], total: fixtureQuestions.length } };
      },
      release: acceptedGate.release,
    }, async (page, diagnostics) => {
      await waitState(page, 'failed', 3, { resume: true, clearErrors: false, error: OLD_ERROR });
      const expander = await checkLabelAndExpanders(page);
      await clickButton(page, 'Resume saved generation');
      // All post-resume GETs are held: queued state must come from POST's body.
      await waitState(page, 'queued', 3);
      acceptedGate.release();
      await waitState(page, 'running', 6);
      await waitState(page, 'completed', 18);
      assert.ok(acceptedReads >= 2, 'Completion must arrive via subsequent polling');
      assert.ok(diagnostics.backend.some(record => record.status === 202), 'Mock 202 must be returned');
      await reviewQuestions(page, diagnostics);
      assert.ok(diagnostics.backend.filter(record => record.path === QUESTIONS_PATH).length >= 2, 'Questions auto-load and reload after approval');
      return `queued POST body applied, stale error/resume cleared, pagination/edit/approve passed, ${expander}`;
    }, { resume: 1, patch: 1, approve: 1 });

    const conflictGate = gate();
    let conflictPosts = 0;
    let conflictReads = 0;
    await run('stale failed -> POST 409 -> actual running via GET', {
      status: async () => {
        if (!conflictPosts) return { body: job('failed', 3, true) };
        await conflictGate.promise;
        return { body: ++conflictReads === 1 ? job('running', 12) : job('completed', 18) };
      },
      resume: async () => { conflictPosts++; return { status: 409, body: { error: CONFLICT } }; },
      release: conflictGate.release,
    }, async page => {
      await waitState(page, 'failed', 3, { resume: true, clearErrors: false, error: OLD_ERROR });
      await clickButton(page, 'Resume saved generation');
      await waitUI(page, 'Simulated 409 is received before the held refetch', (selector, text) =>
        Array.from(document.querySelectorAll(`${selector} [role="alert"]`)).some(element => element.textContent.includes(text)), CONFLICT);
      conflictGate.release();
      await waitState(page, 'running', 12);
      await waitState(page, 'completed', 18);
      assert.ok(conflictReads >= 2, 'Conflict refetch must restart polling');
      return '409 refetch clears conflict/old error, removes resume, and completes without a second POST';
    }, { resume: 1 });

    let transientEnabled = false;
    let transientReads = 0;
    await run('transient status 500 automatically retries polling', {
      status: async () => {
        if (!transientEnabled) return { body: job('failed', 3, true) };
        transientReads++;
        if (transientReads === 1) return { status: 500, body: { error: TRANSIENT } };
        return { body: transientReads === 2 ? job('running', 6) : job('completed', 18) };
      },
    }, async (page, diagnostics) => {
      await waitState(page, 'failed', 3, { resume: true, clearErrors: false, error: OLD_ERROR });
      transientEnabled = true;
      await clickButton(page, 'Refresh status');
      await waitUI(page, 'Simulated 500 error is visible', (selector, text) =>
        Array.from(document.querySelectorAll(`${selector} [role="alert"]`)).some(element => element.textContent.includes(text)), TRANSIENT);
      // No further click/focus and no timer replacement: the real 4s retry must run.
      await waitState(page, 'running', 6);
      await waitState(page, 'completed', 18);
      assert.ok(transientReads >= 3, 'Retry and subsequent completion polling must both occur');
      assert.equal(diagnostics.backend.filter(record => record.status === 500).length, 1);
      return 'one fixture 500 recovered, error cleared, polling continued, zero POSTs';
    }, {});

    let refreshJob = job('failed', 3, true);
    await run('Refresh status and window focus refresh counts', {
      status: async () => ({ body: refreshJob }),
    }, async (page, diagnostics) => {
      await waitState(page, 'failed', 3, { resume: true, clearErrors: false, error: OLD_ERROR });
      const beforeRefresh = diagnostics.backend.filter(record => record.path === STATUS_PATH).length;
      refreshJob = job('failed', 9, true);
      await clickButton(page, 'Refresh status');
      await waitState(page, 'failed', 9, { resume: true, clearErrors: false, error: OLD_ERROR });
      const beforeFocus = diagnostics.backend.filter(record => record.path === STATUS_PATH).length;
      assert.ok(beforeFocus > beforeRefresh, 'Refresh status must fetch new coverage');
      // Failed jobs have no poll timer, so this update must be triggered by focus.
      refreshJob = job('completed', 18);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await waitState(page, 'completed', 18);
      assert.ok(diagnostics.backend.filter(record => record.path === STATUS_PATH).length > beforeFocus, 'Focus must fetch new coverage');
      await waitUI(page, 'Focus also updates coverage and Bloom counts', selector => {
        const text = document.querySelector(selector)?.textContent || '';
        return /3\/3\s*\(100%\)/.test(text) && ['L1: 6', 'L2: 6', 'L3: 6'].every(label => text.includes(label));
      });
      return 'manual refresh 3 -> 9, focus 9 -> 18, coverage/Bloom counts refreshed, zero POSTs';
    }, {});

    let abandoned = false;
    await run('abandon running generation, then delete all subject data', {
      status: async () => ({ body: abandoned ? { ...job('abandoned', 6), resumable: false, error: null } : job('running', 6) }),
      abandon: async () => {
        abandoned = true;
        return { body: { ...job('abandoned', 6), resumable: false, error: null } };
      },
      deleteBank: async () => ({ body: { message: 'Subject deleted.' } }),
      dialog: async dialog => dialog.type() === 'confirm',
    }, async (page, diagnostics) => {
      await waitState(page, 'running', 6);
      await clickButton(page, 'Abandon generation');
      await waitUI(page, 'Abandoned status replaces the running job', selector =>
        document.querySelector(`${selector} [aria-live] strong`)?.textContent === 'abandoned');
      await waitUI(page, 'Abandon and resume actions disappear once abandoned', selector =>
        !Array.from(document.querySelectorAll(`${selector} button`))
          .some(button => ['Abandon generation', 'Resume saved generation'].includes(button.textContent.trim())));
      await clickButton(page, 'Delete subject data');
      await waitUI(page, 'Inline delete confirmation replaces the native prompt', selector =>
        Boolean(document.querySelector(`${selector} #delete-confirmation`)?.checkVisibility()));
      await waitUI(page, 'Permanent delete stays disabled until DELETE is typed', selector =>
        Array.from(document.querySelectorAll(`${selector} button`))
          .some(button => button.textContent.trim() === 'Delete permanently' && button.disabled));
      const confirmation = await page.$(`${SECTION} #delete-confirmation`);
      await confirmation.click();
      await confirmation.type('DELETE');
      await clickButton(page, 'Delete permanently');
      await page.waitForFunction(selector => !document.querySelector(selector), { timeout: 20000 }, SECTION);
      assert.equal(diagnostics.backend.filter(record => record.path === `${STATUS_PATH}/abandon`).length, 1);
      assert.equal(diagnostics.backend.filter(record => record.method === 'DELETE' && record.path === BANK_PATH).length, 1);
      return 'inline confirm required DELETE, abandoned state rendered, panel closed after deletion';
    }, { abandon: 1, delete: 1 });

    await run('completed with skipped questions remains reviewable and resumable', {
      status: async () => ({ body: job('completed_with_skips', 15, true) }),
      questions: () => QUESTIONS,
    }, async page => {
      await waitState(page, 'completed with skipped questions', 15, { resume: true, clearErrors: false, error: SKIPPED_WARNING });
      await waitUI(page, 'Skipped count, resumability and approve action are visible', selector => {
        const section = document.querySelector(selector);
        const text = section?.textContent || '';
        return /3 skipped/.test(text) && /skipped generation|skipped or rejected/i.test(text) &&
          Array.from(section.querySelectorAll('button')).some(button => button.textContent.trim() === 'Approve all usable questions') &&
          Array.from(section.querySelectorAll('button')).some(button => button.textContent.trim() === 'Resume saved generation');
      });
      return 'partial generation shows skipped count, warning, resume and bulk approval';
    }, {});

    const fixturePaper = await offlineDraft();
    const draftError = 'Could not write 1 required new L3 question(s). M3 part B (10 marks): AI response was incomplete (length). Approve more L3 questions in this module, or try again.';
    let draftPosts = 0;
    await run('draft failure stays actionable and a retry renders a verified paper', {
      status: async () => ({ body: job('completed', 18) }),
      banks: [{ id: GENERATION.bankId, department: 'ISE', semester: '5', subjectCode: '23ISI503', courseTitle: 'DBMS' }],
      generateDraft: async body => {
        assert.equal(body.courseTitle, 'DBMS');
        assert.equal(body.examType, 'semester');
        assert.equal(body.formatSelection, 'sjb');
        return ++draftPosts === 1 ? { status: 400, body: { error: draftError } } : { body: { paper: fixturePaper } };
      },
    }, async (page, diagnostics) => {
      await clickButton(page, 'Generate Draft', 'nav');
      const exam = await page.waitForFunction(() => Array.from(document.querySelectorAll('h4')).find(el => el.textContent === 'Semester End Exam'));
      try { await exam.asElement().click(); } finally { await exam.dispose(); }
      const ready = await page.waitForFunction(() => Array.from(document.querySelectorAll('.card')).find(el => el.textContent.includes('Ready to Draft')));
      try {
        const selects = await ready.asElement().$$('select');
        try {
          await selects[0].select('ISE');
          await selects[1].select('5');
          await selects[2].select('DBMS');
        } finally { for (const select of selects) await select.dispose(); }
      } finally { await ready.dispose(); }
      await clickButton(page, 'Draft Paper', 'main');
      await page.waitForFunction(message => document.querySelector('.status-error')?.textContent === message, {}, draftError);
      assert.equal(await page.$('.printable-paper'), null);
      await clickButton(page, 'Draft Paper', 'main');
      await page.waitForFunction(() => document.querySelector('.printable-paper')?.textContent.includes('5 new L3 question(s)'));
      const displayed = await page.$eval('.printable-paper', el => el.textContent);
      assert.ok(displayed.includes('DBMS'));
      assert.ok(displayed.includes('SELECT id FROM Orders'));
      assert.ok(displayed.includes('Review them before submitting'));
      assert.ok(displayed.includes('100'));
      assert.equal(await page.$('.status-error'), null);
      assert.equal(diagnostics.backend.filter(r => r.path === '/api/draft/generate-draft' && r.method === 'POST').length, 2);
      return 'exact draft endpoint, visible provider error, then all five modules rendered with new-question review warning; fixture generator recovered truncated output';
    }, { generate: 2 });

    if (failures.length) throw new AggregateError(failures, `${failures.length}/7 fixture browser scenarios failed`);
    console.log('PASS 7/7 fixture browser scenarios. All backend HTTP traffic mocked; no real backend writes or credentials.');
  } finally {
    try { if (browser) await browser.close(); }
    finally { await rm(profile, { recursive: true, force: true, maxRetries: 5 }); }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
