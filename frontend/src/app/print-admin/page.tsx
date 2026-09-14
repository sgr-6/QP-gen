"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { Printer, Download, Search, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface Paper {
  _id: string;
  courseName?: string;
  courseCode?: string;
  examType?: string;
  createdAt?: string;
  [key: string]: any;
}

export default function PrintAdminPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);

  useEffect(() => {
    fetchPapers();
  }, []);

  const fetchPapers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get("/api/print-admin/papers", {
        withCredentials: true,
      });
      setPapers(res.data?.data || res.data || []);
    } catch (err: any) {
      console.error("Error fetching papers:", err);
      setError(err?.response?.data?.message || "Failed to load papers.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPrintModal = (paper: Paper) => {
    setSelectedPaper(paper);
    setCopies(1);
    setPrintSuccess(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPaper(null);
    setPrintSuccess(false);
  };

  const handlePrintConfirm = async () => {
    if (!selectedPaper) return;
    
    try {
      setIsProcessing(true);
      
      // 1. Record print action
      await axios.post(
        `/api/print-admin/papers/${selectedPaper._id}/print`,
        { copies },
        { withCredentials: true }
      );

      setPrintSuccess(true);
      
      // 2. Trigger PDF download
      const downloadRes = await axios.get(`/api/draft/${selectedPaper._id}/download`, {
        responseType: "blob",
        withCredentials: true,
      });
      
      const blob = new Blob([downloadRes.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedPaper.courseCode || "paper"}_${selectedPaper.examType || "exam"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      // Close modal after brief delay on success
      setTimeout(() => {
        handleCloseModal();
      }, 2000);
      
    } catch (err: any) {
      console.error("Print confirmation error:", err);
      alert(err?.response?.data?.message || "Failed to print paper. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Print Admin Portal</h1>
            <p className="text-sm text-gray-500 mt-1">Manage and print released question papers.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPapers}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium">Error</h3>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-600" />
              <p>Loading papers...</p>
            </div>
          ) : papers.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center p-12 text-gray-500">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-lg font-medium text-gray-900">No released papers found.</p>
              <p className="text-sm mt-1">When question papers are released, they will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/80 text-gray-600 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Course Name</th>
                    <th className="px-6 py-4">Course Code</th>
                    <th className="px-6 py-4">Exam Type</th>
                    <th className="px-6 py-4">Released Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {papers.map((paper) => (
                    <tr key={paper._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{paper.courseName || "N/A"}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {paper.courseCode || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{paper.examType || "N/A"}</td>
                      <td className="px-6 py-4 text-gray-500">
                        {paper.createdAt ? new Date(paper.createdAt).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleOpenPrintModal(paper)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
                        >
                          <Printer className="w-4 h-4" />
                          Print Paper
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Print Modal */}
      {isModalOpen && selectedPaper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden transform transition-all">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Print Configuration</h2>
              <p className="text-sm text-gray-500 mb-6">
                You are about to print the question paper for <span className="font-medium text-gray-900">{selectedPaper.courseCode}</span>.
              </p>

              {printSuccess ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Print Job Recorded!</h3>
                  <p className="text-sm text-gray-500 mt-1">Downloading PDF document...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="copies" className="block text-sm font-medium text-gray-700 mb-1">
                      Number of Copies to Print
                    </label>
                    <input
                      type="number"
                      id="copies"
                      min="1"
                      max="1000"
                      value={copies}
                      onChange={(e) => setCopies(parseInt(e.target.value) || 1)}
                      className="block w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
              )}
            </div>

            {!printSuccess && (
              <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePrintConfirm}
                  disabled={isProcessing || copies < 1}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Confirm & Download
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
