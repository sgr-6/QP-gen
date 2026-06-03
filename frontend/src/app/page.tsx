"use client";

import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, BarChart3, Settings, LogOut, CheckCircle, AlertCircle, Printer, Home, Bookmark, MessageSquare, Folder, User } from 'lucide-react';
import axios from 'axios';
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function ExamDashboard() {
  const [activeTab, setActiveTab] = useState('upload');
  const [file, setFile] = useState<File | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [generateTitle, setGenerateTitle] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [generateStatus, setGenerateStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [draftPaper, setDraftPaper] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, loading, router]);

  const handleSignOut = async () => {
    await auth.signOut();
  };

  if (loading || !currentUser) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--primary-purple)', fontSize: '18px', fontWeight: 600 }}>Loading Dashboard...</div>
      </div>
    );
  }
  
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !courseTitle) return;
    
    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseTitle', courseTitle);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const res = await axios.post(`${baseUrl}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('Upload success:', res.data);
      setUploadStatus('success');
      setTimeout(() => {
        setUploadStatus('idle');
        setFile(null);
        setCourseTitle('');
      }, 3000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  const handleGenerate = async () => {
    if (!generateTitle) return;
    setGenerateStatus('generating');
    setErrorMessage('');
    
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const res = await axios.post(`${baseUrl}/api/generate-draft`, 
        { courseTitle: generateTitle }
      );
      
      setDraftPaper(res.data.paper);
      setGenerateStatus('success');
    } catch (error: any) {
      console.error('Generation error:', error);
      setErrorMessage(error.response?.data?.error || 'Failed to generate paper. Check if the course title matches the uploaded database.');
      setGenerateStatus('error');
      setTimeout(() => setGenerateStatus('idle'), 5000);
    }
  };

  const handleSaveFinalPaper = async () => {
    try {
      if (!draftPaper) return;
      setGenerateStatus('generating');
      
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const res = await axios.post(`${baseUrl}/api/save-final-paper`, { paper: draftPaper });

      const pdfUrl = res.data.url;
      alert('Final paper securely saved to Supabase!\\nURL: ' + pdfUrl);
      
      const link = document.createElement('a');
      link.href = pdfUrl + "?download=" + encodeURIComponent(`${draftPaper.courseTitle.replace(/\\s+/g, '_')}_Final.pdf`);
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
  };

  const handleDownloadDraft = async () => {
    try {
      if (!draftPaper) return;
      setGenerateStatus('generating');
      
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const res = await axios.post(`${baseUrl}/api/download-draft`, { paper: draftPaper }, { responseType: 'blob' });
      
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${draftPaper.courseTitle.replace(/\\s+/g, '_')}_Draft.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      
      setGenerateStatus('success');
    } catch (error) {
      console.error('Download Draft error:', error);
      alert('Failed to download draft.');
      setGenerateStatus('error');
      setTimeout(() => setGenerateStatus('success'), 3000);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          SJB QP Gen
        </div>
        <nav className="nav-menu">
          <button 
            onClick={() => setActiveTab('upload')}
            className={`nav-item ${activeTab === 'upload' ? 'active' : ''}`}
          >
            <UploadCloud size={18} /> Bank Upload
          </button>
          <button 
            onClick={() => setActiveTab('generate')}
            className={`nav-item ${activeTab === 'generate' ? 'active' : ''}`}
          >
            <FileText size={18} /> Generate Draft
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          >
            <BarChart3 size={18} /> Analytics
          </button>
        </nav>
        <div style={{ flex: 1 }}></div>
        <div className="nav-menu">
          <button className="nav-item" style={{ color: '#E53E3E' }} onClick={handleSignOut}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        
        {/* Top Header */}
        <header className="header">
          <h2 className="header-title">
            {activeTab.replace('-', ' ')}
          </h2>
          <div className="user-profile">
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)' }}>Exam Section</span>
            <div className="avatar">
              ES
            </div>
          </div>
        </header>

        {/* Tab Contents */}
        <div className="content-area">
          
          {/* UPLOAD TAB */}
          {activeTab === 'upload' && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Data Ingestion</h3>
                <p style={{ color: 'var(--text-muted)' }}>
                  Upload DOCX. The AI normalization layer will automatically infer missing Bloom's Taxonomy and Course Outcomes.
                </p>
              </div>

              <div className="card">
                <form onSubmit={handleUpload}>
                  <div className="input-group">
                    <label className="input-label">Course Title</label>
                    <input 
                      type="text" 
                      required
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                      placeholder="e.g. Data Structures and Applications"
                      className="pill-input"
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Source File</label>
                    <label className={`drag-drop-zone ${file ? 'has-file' : ''}`}>
                      {file ? (
                        <div className="text-center" style={{ color: '#38A169' }}>
                          <CheckCircle size={40} style={{ margin: '0 auto 12px' }} />
                          <p style={{ fontWeight: 600 }}>{file.name}</p>
                          <p style={{ fontSize: '12px', marginTop: '4px' }}>{(file.size / 1024).toFixed(2)} KB</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <UploadCloud size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                          <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>Click to upload or drag and drop</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>DOCX format only</p>
                        </div>
                      )}
                      <input 
                        type="file" 
                        style={{ display: 'none' }} 
                        accept=".csv, .xlsx, .docx, .pdf"
                        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: '32px' }}>
                    <button 
                      type="submit" 
                      disabled={uploadStatus === 'uploading' || !file || !courseTitle}
                      className="btn-primary"
                    >
                      {uploadStatus === 'uploading' ? (
                        <span>Parsing & Normalizing via AI...</span>
                      ) : uploadStatus === 'success' ? (
                        <span>Bank Ingested Successfully!</span>
                      ) : uploadStatus === 'error' ? (
                        <span>Ingestion Failed</span>
                      ) : (
                        'Ingest Question Bank'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* GENERATE TAB */}
          {activeTab === 'generate' && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Paper Generation</h3>
                <p style={{ color: 'var(--text-muted)' }}>Trigger the core logic engine to build a 5-module, academically rigorous draft.</p>
              </div>
              
              <div className="card text-center" style={{ padding: '60px 40px' }}>
                <div style={{ background: 'var(--primary-light)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--primary-purple)' }}>
                  <FileText size={32} />
                </div>
                <h4 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>Ready to Draft</h4>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Enter the EXACT Course Title you uploaded to generate your paper.</p>
                
                <div style={{ display: 'flex', gap: '16px', maxWidth: '500px', margin: '0 auto' }}>
                  <input 
                    type="text" 
                    value={generateTitle}
                    onChange={(e) => setGenerateTitle(e.target.value)}
                    placeholder="Course Title (e.g. Computer Organization)"
                    className="pill-input"
                    style={{ flex: 1 }}
                  />
                  <button 
                    onClick={handleGenerate}
                    disabled={generateStatus === 'generating' || !generateTitle}
                    className="btn-primary"
                    style={{ width: 'auto', padding: '14px 32px' }}
                  >
                    {generateStatus === 'generating' ? 'Drafting...' : 'Draft Paper'}
                  </button>
                </div>
                {generateStatus === 'error' && (
                  <p className="status-text status-error">{errorMessage}</p>
                )}
              </div>

              {draftPaper && (
                <div className="printable-paper">
                  <div className="paper-actions print-hidden">
                    <button 
                      onClick={handleDownloadDraft}
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Printer size={16} /> Download Draft
                    </button>
                    <button 
                      onClick={handleSaveFinalPaper}
                      className="btn-primary"
                      style={{ width: 'auto', padding: '12px 24px', fontSize: '14px' }}
                    >
                      <CheckCircle size={16} /> Publish Final Paper
                    </button>
                  </div>
                  
                  <div className="text-center" style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, textTransform: 'uppercase', borderBottom: '2px solid black', display: 'inline-block', paddingBottom: '8px' }}>
                      {draftPaper.courseTitle}
                    </h2>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }}>Q#</th>
                        <th style={{ width: '5%' }}>Sub</th>
                        <th style={{ width: '60%' }}>Question Text</th>
                        <th style={{ width: '10%' }}>Marks</th>
                        <th style={{ width: '10%' }}>CO</th>
                        <th style={{ width: '10%' }}>RBT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftPaper.modules.map((mod: any, mIdx: number) => (
                        <React.Fragment key={mIdx}>
                          <tr>
                            <td colSpan={6} className="text-center" style={{ fontWeight: 700, backgroundColor: '#F8F9FA' }}>
                              Module {mod.moduleNumber}
                            </td>
                          </tr>
                          
                          {/* Split A */}
                          {mod.splitA.map((q: any, i: number) => (
                            <tr key={'a'+i}>
                              <td className="text-center">{i === 0 ? (mIdx*2 + 1) : ''}</td>
                              <td className="text-center">{String.fromCharCode(97 + i)})</td>
                              <td dangerouslySetInnerHTML={{ __html: q.htmlText || q.questionText || '' }} />
                              <td className="text-center">[{String(q.marks).padStart(2, '0')}]</td>
                              <td className="text-center">{q.co}</td>
                              <td className="text-center">{q.btl}</td>
                            </tr>
                          ))}

                          <tr>
                            <td colSpan={6} className="text-center" style={{ fontWeight: 700 }}>OR</td>
                          </tr>

                          {/* Split B */}
                          {mod.splitB.map((q: any, i: number) => (
                            <tr key={'b'+i}>
                              <td className="text-center">{i === 0 ? (mIdx*2 + 2) : ''}</td>
                              <td className="text-center">{String.fromCharCode(97 + i)})</td>
                              <td dangerouslySetInnerHTML={{ __html: q.htmlText || q.questionText || '' }} />
                              <td className="text-center">[{String(q.marks).padStart(2, '0')}]</td>
                              <td className="text-center">{q.co}</td>
                              <td className="text-center">{q.btl}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-center" style={{ fontWeight: 700, fontSize: '20px', marginTop: '32px' }}>*********</div>
                  
                  <style dangerouslySetInnerHTML={{__html: `
                    @media print {
                      body * { visibility: hidden; }
                      .printable-paper, .printable-paper * { visibility: visible; }
                      .printable-paper {
                        position: absolute; left: 0; top: 0; width: 100%;
                        padding: 0; box-shadow: none; margin: 0;
                      }
                      .print-hidden { display: none !important; }
                    }
                  `}} />
                </div>
              )}
            </div>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === 'analytics' && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>NBA / ABET Compliance</h3>
                <p style={{ color: 'var(--text-muted)' }}>Live visualization of Bloom's Taxonomy and Course Outcome distributions across generated drafts.</p>
              </div>
              
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: '1 1 300px', height: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                   <div style={{ background: 'var(--primary-light)', padding: '24px', borderRadius: '50%', marginBottom: '20px' }}>
                     <BarChart3 size={40} color="var(--primary-purple)" style={{ opacity: 0.5 }} />
                   </div>
                   <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>BTL Distribution Chart Loading...</p>
                </div>
                <div className="card" style={{ flex: '1 1 300px', height: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                   <div style={{ background: 'var(--primary-light)', padding: '24px', borderRadius: '50%', marginBottom: '20px' }}>
                     <BarChart3 size={40} color="var(--primary-purple)" style={{ opacity: 0.5 }} />
                   </div>
                   <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>CO Distribution Chart Loading...</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Mobile Navigation Bar */}
      <div className="mobile-nav">
        <button 
          onClick={() => setActiveTab('upload')}
          className={`mobile-nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
        >
          <UploadCloud size={20} />
          <span>Ingest</span>
        </button>
        <button 
          onClick={() => setActiveTab('generate')}
          className={`mobile-nav-btn ${activeTab === 'generate' ? 'active' : ''}`}
        >
          <FileText size={20} />
          <span>Draft</span>
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`mobile-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
        >
          <BarChart3 size={20} />
          <span>Analytics</span>
        </button>
      </div>
    </div>
  );
}
