"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import emailjs from '@emailjs/browser';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [enteredOtp, setEnteredOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { currentUser, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.push("/");
    }
  }, [currentUser, router]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");

    // Generate 6-digit OTP
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(newOtp);

    try {
      await emailjs.send(
        "service_82yko7d",    // SERVICE_ID
        "template_ubn0hyg",   // TEMPLATE_ID
        {
          otp: newOtp,
          to_email: email,
        },
        "Udo2BF2lwjLpzDA2o"   // PUBLIC_KEY
      );
      
      setStep("otp");
    } catch (err: any) {
      console.error(err);
      setError("Failed to send OTP via EmailJS. Check your template configuration.");
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
          <h2 style={{ fontSize: "20px", fontWeight: 600 }}>Welcome Back</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Sign in with Email OTP</p>
        </div>

        {error && <div className="status-error text-center" style={{ marginBottom: "16px", padding: "8px", background: "#FFF5F5", borderRadius: "8px" }}>{error}</div>}

        {step === "email" ? (
          <form onSubmit={handleSendOtp}>
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
            <button type="submit" className="btn-primary" disabled={loading || !email}>
              {loading ? "Sending..." : "Send OTP"}
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
              {loading ? "Verifying..." : "Verify & Sign In"}
            </button>
            <div className="text-center" style={{ marginTop: "16px" }}>
              <button 
                type="button" 
                onClick={() => { setStep("email"); setEnteredOtp(""); }} 
                style={{ background: "none", border: "none", color: "var(--primary-purple)", cursor: "pointer", fontSize: "14px", fontWeight: 500 }}
              >
                Change Email Address
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
