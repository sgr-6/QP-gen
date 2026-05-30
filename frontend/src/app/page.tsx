"use client";

import React, { useState } from 'react';
import { UploadCloud, FileText, BarChart3, Settings, LogOut, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

export default function ExamDashboard() {
  const [activeTab, setActiveTab] = useState('upload');
  const [file, setFile] = useState<File | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [generateTitle, setGenerateTitle] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [generateStatus, setGenerateStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [draftPaper, setDraftPaper] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !courseTitle) return;
    
    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseTitle', courseTitle);

    try {
      // Pointing to our Express backend
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
      // Do not reset status so the paper stays visible
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
      alert('Final paper securely saved to Supabase!\nURL: ' + pdfUrl);
      
      // Automatically download the PDF by fetching it as a blob
      const pdfResponse = await axios.get(pdfUrl, { responseType: 'blob' });
      const blob = new Blob([pdfResponse.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${draftPaper.courseTitle.replace(/\s+/g, '_')}_Final.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);

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
      // We can use the same route but maybe add a flag, or just use a new route
      const res = await axios.post(`${baseUrl}/api/download-draft`, { paper: draftPaper }, { responseType: 'blob' });
      
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
                 <p className="text-gray-500 max-w-md mb-8">Enter the EXACT Course Title you uploaded to generate your paper.</p>
                 
                 <div className="flex w-full max-w-md gap-3">
                    <input 
                      type="text" 
                      value={generateTitle}
                      onChange={(e) => setGenerateTitle(e.target.value)}
                      placeholder="Course Title (e.g., Computer Organization)"
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
                 {generateStatus === 'error' && (
                   <p className="text-red-400 mt-4 text-sm">{errorMessage}</p>
                 )}
              </div>

              {draftPaper && (
                <div id="printable-paper" className="mt-12 bg-white text-black p-10 rounded-xl shadow-2xl printable-paper relative">
                  <div className="flex justify-between items-center mb-8 border-b pb-4 print:hidden">
                    <h3 className="text-2xl font-bold text-gray-800">Generated Draft</h3>
                    <div className="flex gap-3">
                      <button 
                        onClick={handleDownloadDraft}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium shadow flex items-center gap-2"
                      >
                        <Printer size={18} /> Download Draft
                      </button>
                      <button 
                        onClick={handleSaveFinalPaper}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-medium shadow flex items-center gap-2"
                      >
                        <CheckCircle size={18} /> Publish Final Paper
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold uppercase border-b-2 border-black inline-block pb-2">{draftPaper.courseTitle}</h2>
                  </div>

                  <table className="w-full border-separate border-spacing-0 border border-black mb-8">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="border border-black p-2 w-[5%]">Q#</th>
                        <th className="border border-black p-2 w-[5%]">Sub</th>
                        <th className="border border-black p-2 w-[60%] text-left">Question Text</th>
                        <th className="border border-black p-2 w-[10%]">Marks</th>
                        <th className="border border-black p-2 w-[10%]">CO</th>
                        <th className="border border-black p-2 w-[10%]">RBT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftPaper.modules.map((mod: any, mIdx: number) => (
                        <React.Fragment key={mIdx}>
                          <tr>
                            <td colSpan={6} className="border border-black p-2 font-bold text-center bg-gray-100">
                              Module {mod.moduleNumber}
                            </td>
                          </tr>
                          
                          {/* Split A */}
                          {mod.splitA.map((q: any, i: number) => (
                            <tr key={'a'+i}>
                              <td className="border border-black p-2 text-center">{i === 0 ? (mIdx*2 + 1) : ''}</td>
                              <td className="border border-black p-2 text-center">{String.fromCharCode(97 + i)})</td>
                              <td 
                                className="border border-black p-2 markdown-body"
                                dangerouslySetInnerHTML={{ __html: md.render(q.questionText || '') }}
                              />
                              <td className="border border-black p-2 text-center">[{String(q.marks).padStart(2, '0')}]</td>
                              <td className="border border-black p-2 text-center">{q.co}</td>
                              <td className="border border-black p-2 text-center">{q.btl}</td>
                            </tr>
                          ))}

                          <tr>
                            <td colSpan={6} className="border border-black p-2 font-bold text-center">OR</td>
                          </tr>

                          {/* Split B */}
                          {mod.splitB.map((q: any, i: number) => (
                            <tr key={'b'+i}>
                              <td className="border border-black p-2 text-center">{i === 0 ? (mIdx*2 + 2) : ''}</td>
                              <td className="border border-black p-2 text-center">{String.fromCharCode(97 + i)})</td>
                              <td 
                                className="border border-black p-2 markdown-body"
                                dangerouslySetInnerHTML={{ __html: md.render(q.questionText || '') }}
                              />
                              <td className="border border-black p-2 text-center">[{String(q.marks).padStart(2, '0')}]</td>
                              <td className="border border-black p-2 text-center">{q.co}</td>
                              <td className="border border-black p-2 text-center">{q.btl}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-center font-bold text-xl mt-8">*********</div>
                  
                  <style dangerouslySetInnerHTML={{__html: `
                    @media print {
                      body * {
                        visibility: hidden;
                      }
                      .printable-paper, .printable-paper * {
                        visibility: visible;
                      }
                      .printable-paper {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        padding: 0;
                        box-shadow: none;
                      }
                    }
                    /* Basic Markdown Styles */
                    .markdown-body p { margin-bottom: 0.5rem; }
                    .markdown-body p:last-child { margin-bottom: 0; }
                    .markdown-body img { max-width: 100%; height: auto; display: block; margin: 0.5rem 0; }
                    .markdown-body table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 0.5rem; }
                    .markdown-body th, .markdown-body td { border: 1px solid #000; padding: 4px; text-align: left; }
                  `}} />
                </div>
              )}
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

      {/* Mobile Navigation Bar */}
      <div className="md:hidden fixed bottom-0 w-full bg-[#111111] border-t border-gray-800 flex justify-around items-center p-3 z-50 pb-safe">
        <button 
          onClick={() => setActiveTab('upload')}
          className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'upload' ? 'text-blue-400' : 'text-gray-500'}`}
        >
          <UploadCloud size={24} />
          <span className="text-[10px] font-medium">Ingest</span>
        </button>
        <button 
          onClick={() => setActiveTab('generate')}
          className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'generate' ? 'text-emerald-400' : 'text-gray-500'}`}
        >
          <FileText size={24} />
          <span className="text-[10px] font-medium">Draft</span>
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'analytics' ? 'text-purple-400' : 'text-gray-500'}`}
        >
          <BarChart3 size={24} />
          <span className="text-[10px] font-medium">Analytics</span>
        </button>
      </div>
    </div>
  );
}
