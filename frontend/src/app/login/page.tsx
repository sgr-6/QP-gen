"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, User } from "@/context/AuthContext";
import api from "@/lib/api";
import { Building2, Mail, KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  // Credentials
  const [email, setEmail] = useState("");
  
  // OTP
  const [enteredOtp, setEnteredOtp] = useState("");
  
  // UI State
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { currentUser, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.push("/");
    }
  }, [currentUser, router]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    setError("");

    try {
      await api.post("/auth/otp/generate", { email });
      setStep("otp");
    } catch (err: any) {
      console.error("OTP Generate Error:", err);
      setError(err.response?.data?.error || "Failed to generate OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredOtp) return;
    
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/otp/verify", { email, otp: enteredOtp });
      
      const user: User = {
        email: response.data.user.email,
        role: response.data.user.role,
        tenantId: response.data.user.tenantId,
        token: response.data.token,
      };
      
      login(user);
    } catch (err: any) {
      console.error("OTP Verify Error:", err);
      const errorMessage = err.response?.data?.error || "";
      if (err.response?.status === 403 && errorMessage.toLowerCase().includes("locked")) {
        setError("Account locked due to suspicious activity. Please contact your administrator to unlock.");
      } else {
        setError(errorMessage || "Invalid OTP. Please try again.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--background)" }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="card" 
        style={{ maxWidth: "420px", width: "100%", padding: "40px 32px" }}
      >
        <div className="text-center" style={{ marginBottom: "32px" }}>
          <div className="sidebar-logo mx-auto flex justify-center" style={{ padding: 0, marginBottom: "16px", fontSize: "28px" }}>QP Gen</div>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-main)", marginBottom: "8px" }}>
            {step === "credentials" ? "Welcome Back" : "Two-Factor Auth"}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "15px" }}>
            {step === "credentials" ? "Sign in to your institution account" : "Enter the 6-digit code sent to your email"}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="status-error text-center flex items-center justify-center gap-2" 
              style={{ padding: "12px", background: "rgba(220, 38, 38, 0.1)", color: "#dc2626", borderRadius: "8px", fontSize: "14px", fontWeight: 500 }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === "credentials" ? (
            <motion.form 
              key="credentials"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleCredentialsSubmit}
              className="flex flex-col gap-5"
            >

              <div className="input-group" style={{ marginBottom: "24px" }}>
                <label className="input-label font-medium mb-1 block">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@institution.edu"
                    className="pill-input w-full pl-10"
                    style={{ paddingLeft: "40px" }}
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="btn-primary w-full flex justify-center items-center gap-2 py-3" 
                disabled={loading || !email}
                style={{ fontSize: "16px", padding: "12px 24px" }}
              >
                {loading ? <><Loader2 size={18} className="animate-spin" /> Sending Code...</> : "Continue"}
              </button>
            </motion.form>
          ) : (
            <motion.form 
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleVerifyOtp}
              className="flex flex-col gap-5"
            >
              <div className="input-group" style={{ marginBottom: "24px" }}>
                <label className="input-label font-medium mb-1 block text-center">Enter 6-Digit OTP</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <KeyRound size={18} />
                  </div>
                  <input
                    type="text"
                    value={enteredOtp}
                    onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    className="pill-input w-full pl-10 text-center tracking-widest text-lg font-semibold"
                    style={{ paddingLeft: "40px", letterSpacing: "0.2em" }}
                    maxLength={6}
                    required
                  />
                </div>
              </div>
              <button 
                type="submit" 
                className="btn-primary w-full flex justify-center items-center gap-2 py-3" 
                disabled={loading || enteredOtp.length !== 6}
                style={{ fontSize: "16px", padding: "12px 24px" }}
              >
                {loading ? <><Loader2 size={18} className="animate-spin" /> Verifying...</> : "Verify & Access Dashboard"}
              </button>
              <div className="text-center" style={{ marginTop: "16px" }}>
                <button 
                  type="button" 
                  onClick={() => { setStep("credentials"); setEnteredOtp(""); setError(""); }} 
                  className="flex items-center justify-center gap-1 mx-auto transition-colors hover:text-purple-600"
                  style={{ background: "none", border: "none", color: "var(--primary-purple)", cursor: "pointer", fontSize: "14px", fontWeight: 500 }}
                >
                  <ArrowLeft size={16} /> Back to Login
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
