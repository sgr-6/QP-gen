"use client";

import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, CheckCircle, XCircle, Search, Loader2, Calendar, FileText, User, Info } from 'lucide-react';

interface VerificationResult {
  courseTitle: string;
  status: string;
  createdAt: string;
  generatorInfo?: {
    releasedAt?: string;
    releasedBy?: string;
  };
}

export default function VerifyPage() {
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hash.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const response = await axios.get(`${baseUrl}/api/draft/verify/${encodeURIComponent(hash.trim())}`);
      setResult(response.data);
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 400) {
        setError('Invalid Hash or Paper Not Found. This paper cannot be verified.');
      } else {
        setError('An error occurred during verification. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-10 text-white">
          <div className="inline-flex items-center justify-center p-4 bg-white/5 rounded-full ring-1 ring-white/20 mb-6 backdrop-blur-sm shadow-xl">
            <ShieldCheck className="w-12 h-12 text-blue-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-300">
            Public Verification Portal
          </h1>
          <p className="mt-4 text-slate-400 text-lg">
            Verify the authenticity of a Question Paper using its secure release hash.
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/10 relative overflow-hidden">
          {/* Subtle background effects */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none transform -translate-x-1/2 translate-y-1/2" />

          <form onSubmit={handleVerify} className="relative z-10">
            <div className="relative flex items-center group">
              <div className="absolute left-4 text-slate-400 group-focus-within:text-blue-400 transition-colors">
                <Search className="w-6 h-6" />
              </div>
              <input
                id="hash-input"
                type="text"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                placeholder="Enter Release Hash (e.g., abc123def456...)"
                className="w-full bg-black/40 border border-slate-700 rounded-xl py-4 pl-14 pr-4 text-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-inner"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
            
            <button
              id="verify-button"
              type="submit"
              disabled={loading || !hash.trim()}
              className="mt-6 w-full relative overflow-hidden group bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-4 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-[0.98]"
            >
              <div className="relative z-10 flex items-center justify-center gap-2 text-lg">
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify Paper</span>
                  </>
                )}
              </div>
              {/* Button inner shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]" />
            </button>
          </form>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex flex-col items-center justify-center text-center backdrop-blur-sm">
                  <XCircle className="w-12 h-12 text-red-400 mb-3" />
                  <p className="text-red-200 font-medium">{error}</p>
                </div>
              </motion.div>
            )}

            {result && (
              <motion.div
                key="success"
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 md:p-8 backdrop-blur-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -z-10 transform translate-x-1/2 -translate-y-1/2" />
                  
                  <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 ring-4 ring-emerald-500/10">
                      <CheckCircle className="w-8 h-8 text-emerald-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-emerald-400">Verified Authentic</h2>
                    <p className="text-emerald-200/70 text-sm mt-1">This hash corresponds to a valid generated Question Paper.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/30 rounded-lg p-4 border border-white/5 flex items-start gap-3">
                      <FileText className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Course Title</p>
                        <p className="text-white font-medium">{result.courseTitle}</p>
                      </div>
                    </div>
                    
                    <div className="bg-black/30 rounded-lg p-4 border border-white/5 flex items-start gap-3">
                      <Info className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Status</p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 uppercase tracking-wide">
                          {result.status}
                        </span>
                      </div>
                    </div>

                    <div className="bg-black/30 rounded-lg p-4 border border-white/5 flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Created At</p>
                        <p className="text-white font-medium">
                          {new Date(result.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </p>
                      </div>
                    </div>

                    {result.generatorInfo && (
                      <div className="bg-black/30 rounded-lg p-4 border border-white/5 flex items-start gap-3">
                        <User className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Generated By</p>
                          <p className="text-white font-medium">
                            {result.generatorInfo.releasedBy || 'System'}
                          </p>
                          {result.generatorInfo.releasedAt && (
                            <p className="text-xs text-slate-400 mt-1">
                              On: {new Date(result.generatorInfo.releasedAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="mt-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          <span>Secured by QP Generator Security Module</span>
        </div>
      </motion.div>
    </div>
  );
}
