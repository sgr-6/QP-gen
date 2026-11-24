'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import api from '@/lib/api';

export interface GenerationRef { bankId: string; jobId: string }
interface Coverage { generatedQuestions: number; expectedQuestions: number; skippedQuestions?: number; skippedSlots?: string[]; coveredTopics: number; totalTopics: number; percentage: number; complete: boolean; bloomCounts: Record<string, number>; missingTopics: string[] }
interface Job extends GenerationRef { status: string; coverage: Coverage; sourceTopics: { module: string; topic: string }[]; courseOutcomes: { id: string; description: string }[]; error?: string; resumable?: boolean; validationFailures?: { slotId: string; topic: string; reason: string; questionText?: string }[]; usage?: { calls: number; usedTokens: number; cost: number } }
interface Question { id: string; slotId?: string; questionText: string; marks: number | null; btl: string | null; co: string | null; module: string | null; sourceTopic?: string; bloomRationale?: string; topicEvidence?: string; reviewStatus: string }
interface SkippedApproval { id: string; slotId?: string | null; questionText?: string; reason: string }
const LEVELS = ['L1', 'L2', 'L3'];
const errorText = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.error || error.message : 'Request failed.';
const approvedLevel = (level: string | null) => LEVELS.includes(level || '') ? level : '';

export default function GenerationProgress({ generation, bankId, onBankDeleted }: { generation: GenerationRef | null; bankId?: string; onBankDeleted?: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [editing, setEditing] = useState<Question | null>(null);
  const [editError, setEditError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [skippedApprovals, setSkippedApprovals] = useState<SkippedApproval[]>([]);
  const selectedBank = generation?.bankId || bankId;
  const editorRef = useRef<HTMLDivElement | null>(null);
  const previousStatus = useRef<string | null>(null);
  const editingId = editing?.id;

  useEffect(() => {
    if (!generation) return;
    let stopped = false;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (stopped || refreshing) return;
      clearTimeout(timer);
      refreshing = true;
      try {
        const result = await api.get(`/api/syllabus/generation/${encodeURIComponent(generation.bankId)}/${encodeURIComponent(generation.jobId)}`);
        if (stopped) return;
        setJob(result.data);
        setError('');
        if (['queued', 'running'].includes(result.data.status) && !result.data.resumable) timer = setTimeout(refresh, 4000);
      } catch (failure) {
        if (stopped) return;
        setError(errorText(failure));
        if (!axios.isAxiosError(failure) || ![401, 403, 404].includes(failure.response?.status || 0)) timer = setTimeout(refresh, 4000);
      } finally { refreshing = false; }
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [generation, refreshVersion]);

  const loadQuestions = useCallback(async () => {
    if (!selectedBank) return;
    setBusy(true); setError('');
    try {
      const result = await api.get(`/api/question-banks/${encodeURIComponent(selectedBank)}/questions`);
      setQuestions(result.data.questions); setPage(0);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }, [selectedBank]);

  useEffect(() => {
    if (selectedBank) void loadQuestions();
    else setQuestions([]);
  }, [selectedBank, loadQuestions]);

  useEffect(() => {
    const status = job?.status || null;
    const wasActive = Boolean(previousStatus.current && ['queued', 'running'].includes(previousStatus.current));
    if (wasActive && status && !['queued', 'running'].includes(status) && !editing) void loadQuestions();
    previousStatus.current = status;
  }, [job?.status, loadQuestions, editing]);

  useEffect(() => {
    if (editingId && editorRef.current) editorRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [editingId]);

  async function resume() {
    if (!generation) return;
    setBusy(true); setError('');
    try {
      const result = await api.post(`/api/syllabus/generation/${encodeURIComponent(generation.bankId)}/${encodeURIComponent(generation.jobId)}/resume`);
      setJob(result.data);
      setRefreshVersion(value => value + 1);
    } catch (failure) {
      setError(errorText(failure));
      if (axios.isAxiosError(failure) && failure.response?.status === 409) setRefreshVersion(value => value + 1);
    }
    finally { setBusy(false); }
  }
  async function abandon() {
    if (!generation || !window.confirm('Abandon this generation? Questions generated so far stay in the bank for review, but this generation cannot be resumed.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.post(`/api/syllabus/generation/${encodeURIComponent(generation.bankId)}/${encodeURIComponent(generation.jobId)}/abandon`);
      setJob(result.data);
      setRefreshVersion(value => value + 1);
      setNotice('Generation abandoned. Saved questions remain available for review.');
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  async function deleteSubject() {
    if (!selectedBank || deleteConfirmation.trim().toUpperCase() !== 'DELETE') return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (job && ['queued', 'running'].includes(job.status)) {
        await api.post(`/api/syllabus/generation/${encodeURIComponent(generation?.bankId || selectedBank)}/${encodeURIComponent(generation?.jobId || '')}/abandon`).catch(failure => {
          if (!axios.isAxiosError(failure) || failure.response?.status !== 409) throw failure;
        });
      }
      await api.delete(`/api/question-banks/${encodeURIComponent(selectedBank)}`);
      setJob(null); setQuestions([]); setEditing(null); setEditError(''); setConfirmingApprove(false); setSkippedApprovals([]);
      setConfirmingDelete(false); setDeleteConfirmation('');
      setNotice('Subject data deleted.');
      onBankDeleted?.();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  async function saveQuestion() {
    if (!editing || !selectedBank) return;
    const questionId = editing.id;
    const marks = Number(editing.marks);
    if (editing.questionText.trim().length < 10) { setEditError('Question text must be at least 10 characters.'); return; }
    if (!Number.isInteger(marks) || marks < 1 || marks > 20) { setEditError('Marks must be a whole number from 1 to 20.'); return; }
    if (!approvedLevel(editing.btl)) { setEditError('Choose Bloom level L1, L2 or L3.'); return; }
    if (!editing.module?.trim()) { setEditError('Enter the module, for example M1.'); return; }
    setBusy(true); setError(''); setEditError('');
    try {
      const result = await api.patch(`/api/question-banks/${encodeURIComponent(selectedBank)}/questions/${encodeURIComponent(questionId)}`, {
        questionText: editing.questionText.trim(),
        marks,
        btl: editing.btl,
        co: editing.co || null,
        module: editing.module.trim()
      });
      const saved = (result.data.question || { ...editing, marks, reviewStatus: 'approved' }) as Question;
      setQuestions(previous => previous.map(question => question.id === questionId ? { ...question, ...saved } : question));
      setSkippedApprovals(previous => previous.filter(item => item.id !== questionId));
      setEditing(null); setEditError(''); setNotice('Question corrected and approved.');
    } catch (failure) { setEditError(errorText(failure)); }
    finally { setBusy(false); }
  }
  async function approveAll() {
    if (!selectedBank) return;
    setBusy(true); setError(''); setNotice(''); setSkippedApprovals([]);
    try {
      const result = await api.post(`/api/question-banks/${encodeURIComponent(selectedBank)}/questions/approve-all`);
      const data = result.data as { message?: string; approved: number; alreadyApproved: number; skippedQuestions?: SkippedApproval[] };
      setSkippedApprovals(data.skippedQuestions || []);
      setConfirmingApprove(false);
      if ((data.approved || 0) + (data.alreadyApproved || 0) === 0) setError(data.message || 'No questions could be approved.');
      else setNotice(data.message || 'Usable questions approved.');
      await loadQuestions();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  function startEditing(question: Question) {
    setEditing({ ...question, btl: approvedLevel(question.btl) });
    setEditError(''); setNotice('');
  }
  function fixQuestion(questionId: string) {
    const index = questions.findIndex(question => question.id === questionId);
    if (index < 0) return;
    setPage(Math.floor(index / 15));
    startEditing(questions[index]);
  }
  function download() {
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [['Question', 'Marks', 'BTL', 'CO', 'Module', 'Source topic', 'Review status'], ...questions.map(q => [q.questionText, q.marks, q.btl, q.co, q.module, q.sourceTopic, q.reviewStatus])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'question-bank-review.csv'; a.click(); URL.revokeObjectURL(url);
  }
  function editorFor(question: Question) {
    return <div ref={editorRef} id={`question-editor-${question.id}`} style={{ border: '1px solid #CBD5E0', background: '#F8FAFC', padding: 20, margin: '12px 0' }}>
      <h5 style={{ fontWeight: 700, marginBottom: 12 }}>Review question</h5>
      {editError && <p role="alert" style={{ color: '#C53030', marginBottom: 12 }}>{editError}</p>}
      <label className="input-label" htmlFor={`question-text-${question.id}`}>Question text<textarea id={`question-text-${question.id}`} className="pill-input" rows={6} style={{ width: '100%' }} value={question.questionText} onChange={event => setEditing({ ...question, questionText: event.target.value })} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 12, marginTop: 12 }}>
        <label>Marks<input className="pill-input" type="number" min={1} max={20} value={question.marks ?? ''} onChange={event => setEditing({ ...question, marks: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <label>Bloom level<select className="pill-input" value={question.btl || ''} onChange={event => setEditing({ ...question, btl: event.target.value })}><option value="" disabled>Select L1–L3</option>{LEVELS.map(level => <option key={level}>{level}</option>)}</select></label>
        <label>CO<input className="pill-input" placeholder="CO1 or empty" value={question.co || ''} onChange={event => setEditing({ ...question, co: event.target.value || null })} /></label>
        <label>Module<input className="pill-input" placeholder="M1" value={question.module || ''} onChange={event => setEditing({ ...question, module: event.target.value })} /></label>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Paper generation accepts Bloom L1–L3, marks 1–20 and a module. Leave CO empty if it is not an actual syllabus outcome.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}><button className="btn-primary" type="button" disabled={busy} onClick={saveQuestion} style={{ width: 'auto' }}>Save & approve question</button><button className="btn-secondary" type="button" disabled={busy} onClick={() => { setEditing(null); setEditError(''); }}>Cancel</button></div>
    </div>;
  }
  if (!selectedBank) return null;
  const statusLabel = job?.status === 'completed_with_skips' ? 'completed with skipped questions' : job?.status.split('_').join(' ');
  const generationActive = Boolean(job && ['queued', 'running'].includes(job.status));
  return <section className="card" aria-label="Question generation and review" style={{ marginTop: 24 }}>
    <h4 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Question bank generation & review</h4>
    {job && <div aria-live="polite">
      <p>Status: <strong>{statusLabel}</strong> · {job.coverage.generatedQuestions} / {job.coverage.expectedQuestions} validated questions{job.coverage.skippedQuestions ? ` · ${job.coverage.skippedQuestions} skipped` : ''}</p>
      <progress value={job.coverage.generatedQuestions} max={job.coverage.expectedQuestions} style={{ width: '100%', margin: '12px 0' }} />
      <p>Extracted-topic coverage: {job.coverage.coveredTopics}/{job.coverage.totalTopics} ({job.coverage.percentage}%)</p>
      <p style={{ fontSize: 13, marginTop: 8 }}>{Object.entries(job.coverage.bloomCounts).map(([level, count]) => `${level}: ${count}`).join(' · ')}</p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Generation uses only L1 Remember · L2 Understand · L3 Apply, with 20–100 questions based on syllabus size. On resume, saved L1–L3 questions within the new target are reused; remaining higher-level slots are regenerated. CO mappings follow the syllabus outcomes, not these levels.</p>
      {job.usage && <p style={{ fontSize: 13, marginTop: 8 }}>Current run: {job.usage.calls} AI requests · {job.usage.usedTokens.toLocaleString()} reported tokens · ${job.usage.cost.toFixed(4)} reported cost</p>}
      <details style={{ marginTop: 12 }}><summary>Inspect extracted syllabus topics and outcomes</summary><div style={{ maxHeight: 300, overflow: 'auto', marginTop: 8 }}>{(job.sourceTopics || []).map((item, index) => <p key={index} style={{ marginBottom: 6 }}>{item.module}: {item.topic}</p>)}{(job.courseOutcomes || []).map(item => <p key={item.id}>{item.id}: {item.description}</p>)}</div></details>
      {job.error && <p role="alert" style={{ color: job.status === 'completed_with_skips' ? '#B7791F' : '#C53030', marginTop: 12 }}>{job.error}</p>}
      {job.status === 'abandoned' && <p role="status" style={{ marginTop: 12 }}>Generation abandoned. Saved questions remain in the bank for review; deleting the subject removes them.</p>}
      {['failed', 'completed_with_skips'].includes(job.status) && !!job.validationFailures?.length && <details style={{ marginTop: 12 }}><summary>Inspect skipped or rejected questions</summary>{job.validationFailures.map(failure => <div key={failure.slotId} style={{ marginTop: 12 }}><p><strong>{failure.slotId} · {failure.topic}</strong></p><p>{failure.reason}</p>{failure.questionText && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Rejected draft excerpt: {failure.questionText}</p>}</div>)}</details>}
    </div>}
    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>Coverage measures the extracted topic list, not a guarantee of factual correctness or complete source extraction. Review the source syllabus and questions before approval. Missing COs stay unmapped instead of being invented.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
      {generation && <button className="btn-secondary" type="button" disabled={busy} onClick={() => setRefreshVersion(value => value + 1)}>Refresh status</button>}
      <button className="btn-secondary" type="button" disabled={busy} onClick={loadQuestions}>Review questions</button>
      {job?.resumable && <button className="btn-secondary" type="button" disabled={busy} onClick={resume}>Resume saved generation</button>}
      {job && ['queued', 'running', 'failed'].includes(job.status) && <button className="btn-secondary" type="button" disabled={busy} onClick={abandon}>Abandon generation</button>}
      {questions.length > 0 && <button className="btn-secondary" type="button" onClick={download}>Download CSV</button>}
      {questions.length > 0 && !generationActive && <button className="btn-primary" type="button" disabled={busy} onClick={() => { setConfirmingApprove(true); setSkippedApprovals([]); setError(''); setNotice(''); }} style={{ width: 'auto' }}>Approve all usable questions</button>}
      <button className="btn-secondary" type="button" disabled={busy} onClick={() => { setConfirmingDelete(true); setDeleteConfirmation(''); setError(''); }} style={{ color: '#C53030' }}>Delete subject data</button>
    </div>
    {confirmingApprove && <div role="group" aria-label="Confirm bulk approval" style={{ border: '1px solid #CBD5E0', background: '#F8FAFC', padding: 16, marginTop: 16 }}>
      <p><strong>Approve all usable questions?</strong> Questions with text, marks 1–20, a module and Bloom L1–L3 will be approved for paper generation. Other questions are skipped and listed here. CO values that are not in this subject&apos;s syllabus are cleared instead of invented.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button className="btn-primary" type="button" disabled={busy} onClick={approveAll} style={{ width: 'auto' }}>Yes, approve all usable</button>
        <button className="btn-secondary" type="button" disabled={busy} onClick={() => setConfirmingApprove(false)}>Cancel</button>
      </div>
    </div>}
    {confirmingDelete && <div role="group" aria-label="Confirm subject deletion" style={{ border: '1px solid #FEB2B2', background: '#FFF5F5', padding: 16, marginTop: 16 }}>
      <p><strong>Permanently delete this subject?</strong> This removes its question bank, all generated and uploaded questions, syllabus, notes, generation history and final-paper records. Any active generation is abandoned. This cannot be undone.</p>
      <label className="input-label" htmlFor="delete-confirmation" style={{ display: 'block', marginTop: 12 }}>Type DELETE to confirm</label>
      <input id="delete-confirmation" aria-label="Type DELETE to confirm deletion" className="pill-input" style={{ width: '100%', maxWidth: 280 }} value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} autoComplete="off" />
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button className="btn-primary" type="button" disabled={busy || deleteConfirmation.trim().toUpperCase() !== 'DELETE'} onClick={deleteSubject} style={{ width: 'auto', background: '#C53030' }}>Delete permanently</button>
        <button className="btn-secondary" type="button" disabled={busy} onClick={() => { setConfirmingDelete(false); setDeleteConfirmation(''); }}>Cancel</button>
      </div>
    </div>}
    {error && <p role="alert" style={{ color: '#C53030', marginTop: 12 }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#276749', marginTop: 12 }}>{notice}</p>}
    {!!skippedApprovals.length && <details style={{ marginTop: 12, border: '1px solid #F6E05E', background: '#FFFFF0', padding: 12 }} open>
      <summary style={{ cursor: 'pointer' }}><strong>{skippedApprovals.length} question{skippedApprovals.length === 1 ? '' : 's'} still need correction</strong></summary>
      {skippedApprovals.map(item => <div key={item.id} style={{ borderTop: '1px solid #E2E8F0', padding: '10px 0' }}>
        <p><strong>{item.slotId || item.id}</strong> · {item.reason}</p>
        {item.questionText && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{item.questionText}</p>}
        <button className="btn-secondary" type="button" disabled={busy || !questions.some(question => question.id === item.id)} onClick={() => fixQuestion(item.id)} style={{ marginTop: 8 }}>Fix this question</button>
      </div>)}
    </details>}
    {questions.length > 0 && <div style={{ marginTop: 20 }}>
      <p>{questions.length} stored questions · page {page + 1} of {Math.ceil(questions.length / 15)}</p>
      {questions.slice(page * 15, (page + 1) * 15).map((q, index) => <div key={q.id}>
        <article style={{ borderTop: '1px solid #E2E8F0', padding: '16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{page * 15 + index + 1}. {q.module || 'Module unmapped'} · {q.btl || 'BTL unresolved'} · {q.co || 'CO unmapped'} · {q.marks ?? '?'} marks</strong><button className="btn-secondary" type="button" disabled={busy} onClick={() => startEditing(q)}>Edit / approve</button></div>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>{q.questionText}</p>
          {q.sourceTopic && <p style={{ fontSize: 13, marginTop: 8 }}>Syllabus topic: {q.sourceTopic}</p>}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{q.bloomRationale} · {q.reviewStatus}</p>
        </article>
        {editing && editing.id === q.id && editorFor(editing)}
      </div>)}
      <div style={{ display: 'flex', gap: 12 }}><button className="btn-secondary" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn-secondary" type="button" disabled={(page + 1) * 15 >= questions.length} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>}
  </section>;
}
