"use client";

import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, BarChart3, Settings, LogOut, CheckCircle, AlertCircle, Printer, ShieldCheck, ClipboardCheck, MessageSquare, Calendar, Clock, Edit3, Send } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { motion } from 'framer-motion';
import ExamSelector from '@/components/ExamSelector';
import { ExamType, EXAM_CONFIGS } from '@/lib/types';

export default function ExamDashboard() {
  const { currentUser, loading, logout, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState('analytics');
  
  // Set default tab based on role
  useEffect(() => {
    if (currentUser) {
      if (hasRole('early_access', 'early_access', 'professor', 'hod', 'controller_of_exams', 'tenant_admin')) {
        setActiveTab('upload');
      } else if (hasRole('super_admin')) {
        setActiveTab('admin');
      }
    }
  }, [currentUser, hasRole]);

  const [uploadMode, setUploadMode] = useState<'bank' | 'syllabus'>('bank');

  const [file, setFile] = useState<File | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [generateTitle, setGenerateTitle] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [banks, setBanks] = useState<any[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [generateStatus, setGenerateStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [draftPaper, setDraftPaper] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedExamType, setSelectedExamType] = useState<ExamType | null>(null);

  // Template Management State
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateStatus, setTemplateStatus] = useState<'idle' | 'extracting' | 'success' | 'error'>('idle');
  const [extractedTemplate, setExtractedTemplate] = useState<any>(null);

  // Workflow States
  const [draftsList, setDraftsList] = useState<any[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [embargoTimestamp, setEmbargoTimestamp] = useState('');
  const [commentText, setCommentText] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (activeTab === 'review' || activeTab === 'release') {
      const fetchDrafts = async () => {
        try {
          const res = await api.get('/api/draft/list');
          setDraftsList(res.data.drafts || res.data || []);
          setSelectedDraft(null);
        } catch (err) {
          console.error('Failed to fetch drafts', err);
        }
      };
      fetchDrafts();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'generate') {
      const fetchBanks = async () => {
        try {
          const res = await api.get(`/api/question-banks`);
          setBanks(res.data || []);
        } catch (err) {
          console.error('Failed to fetch question banks', err);
        }
      };
      fetchBanks();
    }
  }, [activeTab]);

  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, loading, router]);

  const handleSignOut = () => {
    logout();
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
    if (!file || !courseTitle || !department || !semester || !subjectCode) return;
    
    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseTitle', courseTitle);
    formData.append('department', department);
    formData.append('semester', semester);
    formData.append('subjectCode', subjectCode);

    try {
      const res = await api.post(`/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('Upload success:', res.data);
      setUploadStatus('success');
      setTimeout(() => {
        setUploadStatus('idle');
        setFile(null);
        setCourseTitle('');
        setDepartment('');
        setSemester('');
        setSubjectCode('');
      }, 3000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  const handleSyllabusUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !courseTitle || !department || !semester || !subjectCode) return;
    
    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseTitle', courseTitle);
    formData.append('department', department);
    formData.append('semester', semester);
    formData.append('subjectCode', subjectCode);

    try {
      const res = await api.post(`/api/syllabus/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('Syllabus upload success:', res.data);
      setUploadStatus('success');
      setTimeout(() => {
        setUploadStatus('idle');
        setFile(null);
        setCourseTitle('');
        setDepartment('');
        setSemester('');
        setSubjectCode('');
      }, 3000);
    } catch (error) {
      console.error('Syllabus upload error:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  const handleTemplateUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFile) return;

    setTemplateStatus('extracting');
    setErrorMessage('');
    
    const formData = new FormData();
    formData.append('file', templateFile);

    try {
      const res = await api.post(`/api/template/extract`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('Template extraction success:', res.data);
      setExtractedTemplate(res.data.templateConfig || res.data);
      setTemplateStatus('success');
    } catch (error: any) {
      console.error('Template extraction error:', error);
      setErrorMessage(error.response?.data?.error || 'Failed to extract template.');
      setTemplateStatus('error');
      setTimeout(() => setTemplateStatus('idle'), 5000);
    }
  };

  const handleGenerate = async () => {
    if (!generateTitle) return;
    setGenerateStatus('generating');
    setErrorMessage('');
    
    try {
      const res = await api.post(`/api/generate-draft`, 
        { 
          courseTitle: generateTitle,
          examType: selectedExamType,
          examConfig: selectedExamType ? EXAM_CONFIGS[selectedExamType] : null
        }
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

  const handleSaveDraft = async () => {
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
  };

  const handleDownloadDraft = async () => {
    try {
      if (!draftPaper) return;
      setGenerateStatus('generating');
      
      const res = await api.post(`/api/download-draft`, { paper: draftPaper }, { responseType: 'blob' });
      
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${draftPaper.courseTitle.replace(/\s+/g, '_')}_Draft.pdf`;
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

  const formatRole = (role: string) => {
    return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          QP Gen
        </div>
        <nav className="nav-menu">
          {hasRole('early_access', 'early_access', 'professor', 'hod', 'controller_of_exams', 'tenant_admin') && (
            <button 
              onClick={() => setActiveTab('upload')}
              className={`nav-item ${activeTab === 'upload' ? 'active' : ''}`}
            >
              <UploadCloud size={18} /> Bank Upload
            </button>
          )}
          
          {hasRole('early_access', 'professor', 'hod', 'controller_of_exams') && (
            <button 
              onClick={() => setActiveTab('generate')}
              className={`nav-item ${activeTab === 'generate' ? 'active' : ''}`}
            >
              <FileText size={18} /> Generate Draft
            </button>
          )}

          {hasRole('hod', 'controller_of_exams') && (
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
          )}
          
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          >
            <BarChart3 size={18} /> Analytics
          </button>

          {hasRole('tenant_admin', 'super_admin') && (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
            >
              <ShieldCheck size={18} /> Admin
            </button>
          )}
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
          <h2 className="header-title" style={{ textTransform: 'capitalize' }}>
            {activeTab.replace('-', ' ')}
          </h2>
          <div className="user-profile">
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)' }}>
              {formatRole(currentUser.role)}
            </span>
            <div className="avatar">
              {currentUser.email.substring(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Tab Contents */}
        <div className="content-area">
          
          {/* UPLOAD TAB */}
          {activeTab === 'upload' && hasRole('early_access', 'early_access', 'professor', 'hod', 'controller_of_exams', 'tenant_admin') && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Data Ingestion</h3>
                <p style={{ color: 'var(--text-muted)' }}>
                  {uploadMode === 'bank' 
                    ? "Upload DOCX. The AI normalization layer will automatically infer missing Bloom's Taxonomy and Course Outcomes."
                    : "Upload Syllabus (PDF or DOCX). AI will extract modules, COs, and Bloom's mapping for paper generation constraints."}
                </p>
              </div>

              {/* Toggle Mode */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button 
                  type="button"
                  onClick={() => setUploadMode('bank')}
                  className={`btn-primary ${uploadMode === 'bank' ? '' : 'btn-secondary'}`}
                  style={{ width: 'auto', padding: '8px 16px', flex: 1, backgroundColor: uploadMode === 'bank' ? 'var(--primary-purple)' : '#EDF2F7', color: uploadMode === 'bank' ? 'white' : 'var(--text-main)', border: 'none' }}
                >
                  Upload Question Bank
                </button>
                <button 
                  type="button"
                  onClick={() => setUploadMode('syllabus')}
                  className={`btn-primary ${uploadMode === 'syllabus' ? '' : 'btn-secondary'}`}
                  style={{ width: 'auto', padding: '8px 16px', flex: 1, backgroundColor: uploadMode === 'syllabus' ? 'var(--primary-purple)' : '#EDF2F7', color: uploadMode === 'syllabus' ? 'white' : 'var(--text-main)', border: 'none' }}
                >
                  Upload Syllabus
                </button>
              </div>

              <div className="card">
                <form onSubmit={uploadMode === 'bank' ? handleUpload : handleSyllabusUpload}>
                  <div className="input-group">
                    <label className="input-label">Department</label>
                    <input 
                      type="text" 
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="pill-input"
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Semester</label>
                    <input 
                      type="text" 
                      required
                      value={semester}
                      onChange={(e) => setSemester(e.target.value)}
                      placeholder="e.g. 5"
                      className="pill-input"
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Subject Code</label>
                    <input 
                      type="text" 
                      required
                      value={subjectCode}
                      onChange={(e) => setSubjectCode(e.target.value)}
                      placeholder="e.g. CS101"
                      className="pill-input"
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Subject Name (Course Title)</label>
                    <input 
                      type="text" 
                      required
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                      placeholder="e.g. Introduction to Programming"
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
                          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
                            {uploadMode === 'bank' ? 'DOCX format only' : 'PDF or DOCX format'}
                          </p>
                        </div>
                      )}
                      <input 
                        type="file" 
                        style={{ display: 'none' }} 
                        accept={uploadMode === 'bank' ? ".csv, .xlsx, .docx, .pdf" : ".docx, .pdf"}
                        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: '32px' }}>
                    <button 
                      type="submit" 
                      disabled={uploadStatus === 'uploading' || !file || !courseTitle || !department || !semester || !subjectCode}
                      className="btn-primary"
                    >
                      {uploadStatus === 'uploading' ? (
                        <span>{uploadMode === 'bank' ? 'Parsing & Normalizing via AI...' : 'Parsing & Structuring Syllabus via AI...'}</span>
                      ) : uploadStatus === 'success' ? (
                        <span>{uploadMode === 'bank' ? 'Bank Ingested Successfully!' : 'Syllabus Ingested Successfully!'}</span>
                      ) : uploadStatus === 'error' ? (
                        <span>Ingestion Failed</span>
                      ) : (
                        <span>{uploadMode === 'bank' ? 'Ingest Question Bank' : 'Ingest Syllabus'}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* GENERATE TAB */}
          {activeTab === 'generate' && hasRole('early_access', 'professor', 'hod', 'controller_of_exams') && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Paper Generation</h3>
                <p style={{ color: 'var(--text-muted)' }}>Trigger the core logic engine to build an academically rigorous draft.</p>
              </div>

              <ExamSelector 
                selectedType={selectedExamType} 
                onSelect={setSelectedExamType} 
              />
              
              {selectedExamType && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="card text-center" 
                  style={{ padding: '60px 40px' }}
                >
                  <div style={{ background: 'var(--primary-light)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--primary-purple)' }}>
                    <FileText size={32} />
                  </div>
                  <h4 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>Ready to Draft</h4>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Enter the EXACT Course Code you uploaded to generate your paper.</p>
                
                <div style={{ display: 'flex', gap: '16px', maxWidth: '800px', margin: '0 auto', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="input-label text-left">Department</label>
                    <select 
                      value={filterDepartment} 
                      onChange={(e) => {
                        setFilterDepartment(e.target.value);
                        setFilterSemester('');
                        setGenerateTitle('');
                      }}
                      className="pill-input"
                      style={{ padding: '12px 16px', width: '100%', appearance: 'auto' }}
                    >
                      <option value="">Select Department</option>
                      {Array.from(new Set(banks.map(b => b.department).filter(Boolean))).map(d => (
                        <option key={d as string} value={d as string}>{d as string}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <label className="input-label text-left">Semester</label>
                    <select 
                      value={filterSemester} 
                      onChange={(e) => {
                        setFilterSemester(e.target.value);
                        setGenerateTitle('');
                      }}
                      disabled={!filterDepartment}
                      className="pill-input"
                      style={{ padding: '12px 16px', width: '100%', appearance: 'auto' }}
                    >
                      <option value="">Select Semester</option>
                      {Array.from(new Set(banks.filter(b => b.department === filterDepartment).map(b => b.semester).filter(Boolean))).map(s => (
                        <option key={s as string} value={s as string}>{s as string}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: '2 1 300px' }}>
                    <label className="input-label text-left">Subject Code & Name</label>
                    <select 
                      value={generateTitle} 
                      onChange={(e) => setGenerateTitle(e.target.value)}
                      disabled={!filterSemester}
                      className="pill-input"
                      style={{ padding: '12px 16px', width: '100%', appearance: 'auto' }}
                    >
                      <option value="">Select Subject</option>
                      {banks
                        .filter(b => b.department === filterDepartment && b.semester === filterSemester)
                        .map(b => (
                        <option key={b.courseTitle} value={b.courseTitle}>
                          {b.subjectCode ? `${b.subjectCode} - ` : ''}{b.courseTitle}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: '24px' }}>
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
              </motion.div>
              )}

              {draftPaper && (
                <div className="printable-paper">
                  {draftPaper.warnings && draftPaper.warnings.length > 0 && (
                    <div className="print-hidden" style={{ background: '#FFFBEB', borderLeft: '4px solid #D69E2E', padding: '16px', marginBottom: '24px', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#B7791F', fontWeight: 'bold' }}>
                        <AlertCircle size={20} />
                        <span>Generation Warnings</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '24px', color: '#975A16', fontSize: '14px' }}>
                        {draftPaper.warnings.map((w: string, idx: number) => (
                          <li key={idx} style={{ marginBottom: '4px' }}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="paper-actions print-hidden">
                    <button 
                      onClick={handleDownloadDraft}
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Printer size={16} /> Download Draft
                    </button>
                    <button 
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
                        <th style={{ width: '5%' }}>Q No</th>
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
                              {selectedExamType === 'internal' ? `Part ${mIdx + 1}` : `Module ${mod.moduleNumber}`}
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

          {/* REVIEW TAB */}
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
          )}

          {/* ADMIN TAB */}
          {activeTab === 'admin' && hasRole('tenant_admin', 'super_admin') && (
            <div className="animate-in">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Admin Dashboard</h3>
                <p style={{ color: 'var(--text-muted)' }}>Manage users, roles, and institution settings.</p>
              </div>
              
              <div style={{ marginBottom: '32px' }}>
                <h4 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '16px' }}>Template Management</h4>
                <div className="card">
                  <form onSubmit={handleTemplateUpload}>
                    <div className="input-group">
                      <label className="input-label">Upload Sample Paper (PDF/DOCX)</label>
                      <label className={`drag-drop-zone ${templateFile ? 'has-file' : ''}`}>
                        {templateFile ? (
                          <div className="text-center" style={{ color: '#38A169' }}>
                            <CheckCircle size={40} style={{ margin: '0 auto 12px' }} />
                            <p style={{ fontWeight: 600 }}>{templateFile.name}</p>
                            <p style={{ fontSize: '12px', marginTop: '4px' }}>{(templateFile.size / 1024).toFixed(2)} KB</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <UploadCloud size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                            <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>Click to upload or drag and drop</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>PDF or DOCX format</p>
                          </div>
                        )}
                        <input 
                          type="file" 
                          style={{ display: 'none' }} 
                          accept=".docx, .pdf"
                          onChange={(e) => setTemplateFile(e.target.files ? e.target.files[0] : null)}
                        />
                      </label>
                    </div>

                    <div style={{ marginTop: '24px' }}>
                      <button 
                        type="submit" 
                        disabled={templateStatus === 'extracting' || !templateFile}
                        className="btn-primary"
                      >
                        {templateStatus === 'extracting' ? (
                          <span>Extracting Template via AI...</span>
                        ) : (
                          <span>Extract Template</span>
                        )}
                      </button>
                    </div>
                    {templateStatus === 'error' && (
                      <p className="status-text status-error" style={{ marginTop: '12px' }}>{errorMessage}</p>
                    )}
                    {templateStatus === 'success' && (
                      <p className="status-text status-success" style={{ marginTop: '12px', color: '#38A169', fontWeight: 500 }}>Active Template Saved!</p>
                    )}
                  </form>
                </div>
              </div>

              {extractedTemplate && (
                <div className="card" style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Extracted Configuration</h4>
                  <pre style={{ background: '#F7FAFC', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontSize: '14px', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(extractedTemplate, null, 2)}
                  </pre>
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
        {hasRole('early_access', 'early_access', 'professor', 'hod', 'controller_of_exams', 'tenant_admin') && (
          <button 
            onClick={() => setActiveTab('upload')}
            className={`mobile-nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
          >
            <UploadCloud size={20} />
            <span>Ingest</span>
          </button>
        )}
        {hasRole('early_access', 'professor', 'hod', 'controller_of_exams') && (
          <button 
            onClick={() => setActiveTab('generate')}
            className={`mobile-nav-btn ${activeTab === 'generate' ? 'active' : ''}`}
          >
            <FileText size={20} />
            <span>Draft</span>
          </button>
        )}
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
