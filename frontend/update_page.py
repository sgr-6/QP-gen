import sys

with open('src/app/page.tsx', 'r') as f:
    code = f.read()

code = code.replace(
    "import { UploadCloud, FileText, BarChart3, Settings, LogOut, CheckCircle, AlertCircle, Printer, ShieldCheck, ClipboardCheck } from 'lucide-react';",
    "import { UploadCloud, FileText, BarChart3, Settings, LogOut, CheckCircle, AlertCircle, Printer, ShieldCheck, ClipboardCheck, MessageSquare, Calendar, Clock, Edit3, Send } from 'lucide-react';"
)

code = code.replace(
    "const [extractedTemplate, setExtractedTemplate] = useState<any>(null);",
    "const [extractedTemplate, setExtractedTemplate] = useState<any>(null);\n\n  // Workflow States\n  const [draftsList, setDraftsList] = useState<any[]>([]);\n  const [selectedDraft, setSelectedDraft] = useState<any>(null);\n  const [embargoTimestamp, setEmbargoTimestamp] = useState('');\n  const [commentText, setCommentText] = useState<{ [key: string]: string }>({});"
)

code = code.replace(
    "  useEffect(() => {\n    if (activeTab === 'generate') {",
    "  useEffect(() => {\n    if (activeTab === 'review' || activeTab === 'release') {\n      const fetchDrafts = async () => {\n        try {\n          const res = await api.get('/api/draft/list');\n          setDraftsList(res.data.drafts || res.data || []);\n          setSelectedDraft(null);\n        } catch (err) {\n          console.error('Failed to fetch drafts', err);\n        }\n      };\n      fetchDrafts();\n    }\n  }, [activeTab]);\n\n  useEffect(() => {\n    if (activeTab === 'generate') {"
)

old_save = """  const handleSaveFinalPaper = async () => {
    try {
      if (!draftPaper) return;
      setGenerateStatus('generating');
      
      const res = await api.post(`/api/save-final-paper`, { 
        paper: draftPaper,
        examType: selectedExamType
      });

      const pdfUrl = res.data.url;
      alert('Final paper securely saved to Supabase!\\nURL: ' + pdfUrl);
      
      const link = document.createElement('a');
      link.href = pdfUrl + "?download=" + encodeURIComponent(`${draftPaper.courseTitle.replace(/\s+/g, '_')}_Final.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setGenerateStatus('success');
    } catch (error) {
      console.error('Save Final error:', error);
      alert('Failed to save final paper securely.');
      setGenerateStatus('error');
      setTimeout(() => setGenerateStatus('success'), 3000);
    }
  };"""

new_save = """  const handleSaveDraft = async () => {
    try {
      if (!draftPaper) return;
      setGenerateStatus('generating');
      await api.post(`/api/draft/save`, { 
        courseTitle: draftPaper.courseTitle,
        paper: draftPaper
      });
      alert('Draft saved successfully.');
      setDraftPaper(null);
      setGenerateStatus('idle');
    } catch (error) {
      console.error('Save Draft error:', error);
      alert('Failed to save draft.');
      setGenerateStatus('error');
      setTimeout(() => setGenerateStatus('idle'), 3000);
    }
  };

  const handleSubmitForReview = async () => {
    try {
      if (!draftPaper) return;
      setGenerateStatus('generating');
      const res = await api.post(`/api/draft/save`, { 
        courseTitle: draftPaper.courseTitle,
        paper: draftPaper
      });
      const draftId = res.data.id || res.data.draft?.id || res.data.draftId;
      if (draftId) {
        await api.put(`/api/draft/${draftId}/status`, { status: 'pending_hod_approval' });
        alert('Draft submitted for review.');
      } else {
        alert('Draft saved, but failed to retrieve ID for submission.');
      }
      setDraftPaper(null);
      setGenerateStatus('idle');
    } catch (error) {
      console.error('Submit review error:', error);
      alert('Failed to submit draft for review.');
      setGenerateStatus('error');
      setTimeout(() => setGenerateStatus('idle'), 3000);
    }
  };

  const handleApproveDraft = async (draftId: string) => {
    try {
      await api.put(`/api/draft/${draftId}/status`, { status: 'pending_coe_release' });
      alert('Paper approved and sent to COE.');
      setDraftsList(draftsList.filter(d => d.id !== draftId));
      setSelectedDraft(null);
    } catch (err) {
      console.error(err);
      alert('Failed to approve paper.');
    }
  };

  const handleRejectDraft = async (draftId: string) => {
    try {
      await api.put(`/api/draft/${draftId}/status`, { status: 'draft' });
      alert('Changes requested. Sent back to professor.');
      setDraftsList(draftsList.filter(d => d.id !== draftId));
      setSelectedDraft(null);
    } catch (err) {
      console.error(err);
      alert('Failed to reject paper.');
    }
  };

  const handleAddComment = async (draftId: string, questionId: string) => {
    const text = commentText[questionId];
    if (!text) return;
    try {
      await api.post(`/api/draft/${draftId}/comment`, { questionId, text });
      alert('Comment added successfully.');
      setCommentText({ ...commentText, [questionId]: '' });
    } catch (err) {
      console.error(err);
      alert('Failed to add comment.');
    }
  };

  const handleLockAndRelease = async (draftId: string) => {
    if (!embargoTimestamp) {
      alert('Please select an embargo time.');
      return;
    }
    try {
      await api.post(`/api/draft/${draftId}/release`, { embargoTimestamp });
      alert('Paper locked and released successfully.');
      setDraftsList(draftsList.filter(d => d.id !== draftId));
      setSelectedDraft(null);
    } catch (err) {
      console.error(err);
      alert('Failed to release paper.');
    }
  };"""

code = code.replace(old_save, new_save)

old_buttons = """                    <button 
                      onClick={handleSaveFinalPaper}
                      className="btn-primary"
                      style={{ width: 'auto', padding: '12px 24px', fontSize: '14px' }}
                    >
                      <CheckCircle size={16} /> Publish Final Paper
                    </button>"""

new_buttons = """                    <button 
                      onClick={handleSaveDraft}
                      className="btn-secondary"
                      style={{ width: 'auto', padding: '12px 24px', fontSize: '14px' }}
                    >
                      <Edit3 size={16} /> Save as Draft
                    </button>
                    <button 
                      onClick={handleSubmitForReview}
                      className="btn-primary"
                      style={{ width: 'auto', padding: '12px 24px', fontSize: '14px' }}
                    >
                      <Send size={16} /> Submit for Review
                    </button>"""

code = code.replace(old_buttons, new_buttons)

code = code.replace(
    "'professor', 'hod', 'controller_of_exams', 'tenant_admin'",
    "'early_access', 'professor', 'hod', 'controller_of_exams', 'tenant_admin'"
)

code = code.replace(
    "'professor', 'hod', 'controller_of_exams'",
    "'early_access', 'professor', 'hod', 'controller_of_exams'"
)

old_nav_review = """          {hasRole('hod', 'controller_of_exams') && (
            <button 
              onClick={() => setActiveTab('review')}
              className={`nav-item ${activeTab === 'review' ? 'active' : ''}`}
            >
              <ClipboardCheck size={18} /> Review Drafts
            </button>
          )}"""

new_nav_review = """          {hasRole('hod', 'controller_of_exams') && (
            <button 
              onClick={() => setActiveTab('review')}
              className={`nav-item ${activeTab === 'review' ? 'active' : ''}`}
            >
              <ClipboardCheck size={18} /> Review Drafts
            </button>
          )}

          {hasRole('controller_of_exams') && (
            <button 
              onClick={() => setActiveTab('release')}
              className={`nav-item ${activeTab === 'release' ? 'active' : ''}`}
            >
              <Clock size={18} /> Release Papers
            </button>
          )}"""

code = code.replace(old_nav_review, new_nav_review)

old_review_tab = """          {/* REVIEW TAB (Placeholder) */}
          {activeTab === 'review' && hasRole('hod', 'controller_of_exams') && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Review Drafts</h3>
                <p style={{ color: 'var(--text-muted)' }}>Review and approve generated question papers.</p>
              </div>
              <div className="card text-center" style={{ padding: '40px' }}>
                <ClipboardCheck size={48} color="var(--primary-purple)" style={{ opacity: 0.5, margin: '0 auto 16px' }} />
                <h4 style={{ fontSize: '18px', fontWeight: 600 }}>Draft Review System</h4>
                <p style={{ color: 'var(--text-muted)' }}>This module is currently under development.</p>
              </div>
            </div>
          )}"""

new_review_tab = """          {/* REVIEW TAB */}
          {activeTab === 'review' && hasRole('hod', 'controller_of_exams') && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Review Drafts</h3>
                <p style={{ color: 'var(--text-muted)' }}>Review and approve generated question papers.</p>
              </div>
              
              {!selectedDraft ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {draftsList.filter(d => d.status === 'pending_hod_approval' || d.status === 'draft').length === 0 ? (
                    <div className="card text-center" style={{ padding: '40px' }}>
                      <ClipboardCheck size={48} color="var(--primary-purple)" style={{ opacity: 0.5, margin: '0 auto 16px' }} />
                      <p style={{ color: 'var(--text-muted)' }}>No drafts pending review.</p>
                    </div>
                  ) : (
                    draftsList.filter(d => d.status === 'pending_hod_approval' || d.status === 'draft').map(draft => (
                      <div key={draft.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setSelectedDraft(draft)}>
                        <div>
                          <h4 style={{ fontSize: '18px', fontWeight: 600 }}>{draft.courseTitle}</h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Created: {new Date(draft.createdAt || Date.now()).toLocaleDateString()} | Status: {draft.status}</p>
                        </div>
                        <button className="btn-secondary" style={{ padding: '8px 16px' }}>Review</button>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="printable-paper">
                  <div className="print-hidden" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <button className="btn-secondary" onClick={() => setSelectedDraft(null)}>← Back to List</button>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button className="btn-secondary" style={{ color: '#E53E3E', borderColor: '#E53E3E' }} onClick={() => handleRejectDraft(selectedDraft.id)}>Request Changes</button>
                      
                      {selectedDraft.createdBy === currentUser?.userId ? (
                        <div style={{ display: 'flex', alignItems: 'center', color: '#DD6B20', fontSize: '14px' }}>
                          <AlertCircle size={16} style={{ marginRight: '4px' }}/>
                          Maker-Checker rule: You cannot approve your own draft.
                        </div>
                      ) : (
                        <button className="btn-primary" onClick={() => handleApproveDraft(selectedDraft.id)}>Approve Paper</button>
                      )}
                    </div>
                  </div>

                  <div className="text-center" style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, textTransform: 'uppercase', borderBottom: '2px solid black', display: 'inline-block', paddingBottom: '8px' }}>
                      {selectedDraft.paper?.courseTitle || selectedDraft.courseTitle}
                    </h2>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }}>Q No</th>
                        <th style={{ width: '5%' }}>Sub</th>
                        <th style={{ width: '50%' }}>Question Text</th>
                        <th style={{ width: '10%' }}>Marks</th>
                        <th style={{ width: '30%' }} className="print-hidden">Review actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDraft.paper?.modules?.map((mod: any, mIdx: number) => (
                        <React.Fragment key={mIdx}>
                          <tr>
                            <td colSpan={5} className="text-center" style={{ fontWeight: 700, backgroundColor: '#F8F9FA' }}>
                              Module {mod.moduleNumber || (mIdx + 1)}
                            </td>
                          </tr>
                          
                          {[...(mod.splitA || []), ...(mod.splitB || [])].map((q: any, i: number) => (
                            <tr key={i}>
                              <td className="text-center">-</td>
                              <td className="text-center">-</td>
                              <td dangerouslySetInnerHTML={{ __html: q.htmlText || q.questionText || '' }} />
                              <td className="text-center">[{String(q.marks).padStart(2, '0')}]</td>
                              <td className="text-center print-hidden">
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <input 
                                    type="text" 
                                    placeholder="Add comment..." 
                                    className="pill-input"
                                    style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }}
                                    value={commentText[q.id || i] || ''}
                                    onChange={(e) => setCommentText({ ...commentText, [q.id || i]: e.target.value })}
                                  />
                                  <button 
                                    className="btn-secondary" 
                                    style={{ padding: '4px 8px', fontSize: '12px' }}
                                    onClick={() => handleAddComment(selectedDraft.id, q.id || i)}
                                  >
                                    <MessageSquare size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* RELEASE TAB */}
          {activeTab === 'release' && hasRole('controller_of_exams') && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Release Papers</h3>
                <p style={{ color: 'var(--text-muted)' }}>Set embargo times and securely release final question papers.</p>
              </div>
              
              {!selectedDraft ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {draftsList.filter(d => d.status === 'pending_coe_release').length === 0 ? (
                    <div className="card text-center" style={{ padding: '40px' }}>
                      <CheckCircle size={48} color="var(--primary-purple)" style={{ opacity: 0.5, margin: '0 auto 16px' }} />
                      <p style={{ color: 'var(--text-muted)' }}>No papers pending release.</p>
                    </div>
                  ) : (
                    draftsList.filter(d => d.status === 'pending_coe_release').map(draft => (
                      <div key={draft.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setSelectedDraft(draft)}>
                        <div>
                          <h4 style={{ fontSize: '18px', fontWeight: 600 }}>{draft.courseTitle}</h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Created: {new Date(draft.createdAt || Date.now()).toLocaleDateString()}</p>
                        </div>
                        <button className="btn-secondary" style={{ padding: '8px 16px' }}>View & Release</button>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <button className="btn-secondary" onClick={() => setSelectedDraft(null)}>← Back</button>
                  </div>
                  <h4 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>{selectedDraft.courseTitle}</h4>
                  
                  <div className="input-group" style={{ maxWidth: '300px', marginBottom: '24px' }}>
                    <label className="input-label">Set Embargo Time (Unlock Time)</label>
                    <input 
                      type="datetime-local" 
                      className="pill-input"
                      value={embargoTimestamp}
                      onChange={(e) => setEmbargoTimestamp(e.target.value)}
                    />
                  </div>

                  <button className="btn-primary" onClick={() => handleLockAndRelease(selectedDraft.id)}>
                    Lock & Release Paper
                  </button>
                </div>
              )}
            </div>
          )}"""

code = code.replace(old_review_tab, new_review_tab)

with open('src/app/page.tsx', 'w') as f:
    f.write(code)
