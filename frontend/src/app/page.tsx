"use client";

import React, { useState } from 'react';
import { UploadCloud, FileText, BarChart3, Settings, LogOut, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';

export default function ExamDashboard() {
  const [activeTab, setActiveTab] = useState('upload');
  const [file, setFile] = useState<File | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [generateTitle, setGenerateTitle] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [generateStatus, setGenerateStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !courseTitle) return;
    
    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseTitle', courseTitle);

    try {
      // Pointing to our Express backend
      const res = await axios.post('http://localhost:5000/api/upload', formData, {
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
    
    try {
      const res = await axios.post('http://localhost:5000/api/download-pdf', 
        { courseTitle: generateTitle },
        { responseType: 'blob' } // Important for file download
      );
      
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${generateTitle.replace(/\s+/g, '_')}_Paper.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setGenerateStatus('success');
      setTimeout(() => setGenerateStatus('idle'), 3000);
    } catch (error) {
      console.error('Generation error:', error);
      setGenerateStatus('error');
      setTimeout(() => setGenerateStatus('idle'), 3000);
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#111111] border-r border-gray-800 flex flex-col justify-between hidden md:flex">
        <div>
          <div className="p-6 border-b border-gray-800">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">
              SJB QP Gen
            </h1>
            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-semibold">Exam Section</p>
          </div>
          <nav className="p-4 space-y-2">
            <button 
              onClick={() => setActiveTab('upload')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'upload' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
            >
              <UploadCloud size={20} />
              <span className="font-medium">Bank Upload</span>
            </button>
            <button 
              onClick={() => setActiveTab('generate')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'generate' ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
            >
              <FileText size={20} />
              <span className="font-medium">Generate Draft</span>
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'analytics' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
            >
              <BarChart3 size={20} />
              <span className="font-medium">Analytics</span>
            </button>
          </nav>
        </div>
        <div className="p-4 border-t border-gray-800">
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-y-auto">
        
        {/* Top Header */}
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-8 bg-[#111111]/80 backdrop-blur-md sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-gray-200 capitalize">
            {activeTab.replace('-', ' ')}
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center text-sm font-bold shadow-lg shadow-emerald-500/20">
              ES
            </div>
          </div>
        </header>

        {/* Tab Contents */}
        <div className="p-8 max-w-5xl mx-auto w-full">
          
          {/* UPLOAD TAB */}
          {activeTab === 'upload' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-8">
                <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">Data Ingestion</h3>
                <p className="text-gray-400">Upload unstructured question banks (PDF, DOCX, CSV, XLSX). The AI normalization layer will automatically infer missing Bloom's Taxonomy and Course Outcomes.</p>
              </div>

              <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                {/* Decorative glowing orb */}
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <form onSubmit={handleUpload} className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Course Title</label>
                    <input 
                      type="text" 
                      required
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                      placeholder="e.g. Data Structures and Applications"
                      className="w-full bg-[#0a0a0a] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Source File</label>
                    <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300
                      ${file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-gray-700 hover:border-blue-500/50 hover:bg-blue-500/5 bg-[#0a0a0a]'}
                    `}>
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {file ? (
                          <>
                            <CheckCircle className="w-10 h-10 text-emerald-400 mb-3" />
                            <p className="mb-2 text-sm text-gray-300 font-medium">{file.name}</p>
                            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-10 h-10 text-gray-500 mb-3 group-hover:text-blue-400 transition-colors" />
                            <p className="mb-2 text-sm text-gray-400"><span className="font-semibold text-blue-400">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-gray-600">CSV, XLSX, DOCX, or PDF</p>
                          </>
                        )}
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept=".csv, .xlsx, .docx, .pdf"
                        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                      />
                    </label>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit" 
                      disabled={uploadStatus === 'uploading' || !file || !courseTitle}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-4 rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                      {uploadStatus === 'uploading' ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          Parsing & Normalizing via AI...
                        </span>
                      ) : uploadStatus === 'success' ? (
                        <span className="flex items-center justify-center gap-2 text-emerald-100">
                          <CheckCircle className="w-5 h-5" /> Bank Ingested Successfully!
                        </span>
                      ) : uploadStatus === 'error' ? (
                        <span className="flex items-center justify-center gap-2 text-red-100">
                          <AlertCircle className="w-5 h-5" /> Ingestion Failed
                        </span>
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
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="mb-8">
                <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">Paper Generation</h3>
                <p className="text-gray-400">Trigger the core logic engine to build a 5-module, academically rigorous draft complying with strict 20-mark limits and 30% L1/L2 weighting.</p>
              </div>
              
              {/* Generation UI Placeholder for now */}
              <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
                 <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-emerald-400" />
                 </div>
                 <h4 className="text-xl font-bold text-white mb-2">Ready to Draft</h4>
                 <p className="text-gray-500 max-w-md mb-8">Enter a course title that exists in our normalized Firestore database to generate a compliant draft.</p>
                 
                 <div className="flex w-full max-w-md gap-3">
                    <input 
                      type="text" 
                      value={generateTitle}
                      onChange={(e) => setGenerateTitle(e.target.value)}
                      placeholder="Course Title (e.g., Data Structures)"
                      className="flex-1 bg-[#0a0a0a] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                    />
                    <button 
                      onClick={handleGenerate}
                      disabled={generateStatus === 'generating' || !generateTitle}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50"
                    >
                      {generateStatus === 'generating' ? 'Drafting...' : 'Draft Paper'}
                    </button>
                 </div>
              </div>
            </div>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === 'analytics' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="mb-8">
                <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">NBA / ABET Compliance</h3>
                <p className="text-gray-400">Live visualization of Bloom's Taxonomy and Course Outcome distributions across generated drafts.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#161616] border border-gray-800 rounded-3xl p-6 h-80 flex flex-col items-center justify-center text-gray-500">
                   <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
                   <p>BTL Distribution Chart Loading...</p>
                </div>
                <div className="bg-[#161616] border border-gray-800 rounded-3xl p-6 h-80 flex flex-col items-center justify-center text-gray-500">
                   <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
                   <p>CO Distribution Chart Loading...</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
