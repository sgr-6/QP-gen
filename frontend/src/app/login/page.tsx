"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import emailjs from '@emailjs/browser';

export default function LoginPage() {
  // Credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // OTP
  const [enteredOtp, setEnteredOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  
  // UI State
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { currentUser, login } = useAuth();
  const router = useRouter();

  // Hardcoded Valid User
  const VALID_EMAIL = "sjbisedept@gmail.com";
  const VALID_PASS = "sagar789";

  useEffect(() => {
    if (currentUser) {
      router.push("/");
    }
  }, [currentUser, router]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");

    // 1. Verify Credentials
    if (email.toLowerCase() !== VALID_EMAIL || password !== VALID_PASS) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    // 2. Generate 6-digit OTP
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(newOtp);

    // 3. Send OTP via EmailJS
    try {
      await emailjs.send(
        "service_os3zpz3",    // SERVICE_ID (Qp gen)
        "template_fg58evu",   // TEMPLATE_ID
        {
          otp: newOtp,
          to_email: email,
          email: email,
        },
        "jk4ST5pagxhxyr_xK"   // PUBLIC_KEY
      );
      
      setStep("otp");
    } catch (err: any) {
      console.error(err);
      setError(`EmailJS Error: ${err.text || err.message || JSON.stringify(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredOtp) return;
    setLoading(true);
    setError("");

    // Verify OTP
    if (enteredOtp === generatedOtp) {
      login(email);
    } else {
      setError("Invalid OTP. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ justifyContent: "center", alignItems: "center" }}>
      <div className="card" style={{ maxWidth: "400px", width: "100%" }}>
        <div className="text-center" style={{ marginBottom: "24px" }}>
          <div className="sidebar-logo" style={{ padding: 0, marginBottom: "8px" }}>SJB QP Gen</div>
          <h2 style={{ fontSize: "20px", fontWeight: 600 }}>
            {step === "credentials" ? "Welcome Back" : "Two-Factor Auth"}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            {step === "credentials" ? "Sign in to your account" : "Enter the OTP sent to your email"}
          </p>
        </div>

        {error && <div className="status-error text-center" style={{ marginBottom: "16px", padding: "8px", background: "#FFF5F5", borderRadius: "8px" }}>{error}</div>}

        {step === "credentials" ? (
          <form onSubmit={handleCredentialsSubmit}>
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@sjb.edu"
                className="pill-input"
                required
              />
            </div>
            
            <div className="input-group">
              <label className="input-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pill-input"
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading || !email || !password}>
              {loading ? "Verifying..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="input-group">
              <label className="input-label">Enter 6-Digit OTP</label>
              <input
                type="text"
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value)}
                placeholder="123456"
                className="pill-input"
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading || !enteredOtp}>
              {loading ? "Verifying..." : "Verify & Access Dashboard"}
            </button>
            <div className="text-center" style={{ marginTop: "16px" }}>
              <button 
                type="button" 
                onClick={() => { setStep("credentials"); setEnteredOtp(""); setPassword(""); }} 
                style={{ background: "none", border: "none", color: "var(--primary-purple)", cursor: "pointer", fontSize: "14px", fontWeight: 500 }}
              >
                Back to Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
