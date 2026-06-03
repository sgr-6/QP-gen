"use client";

import React, { useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.push("/");
    }
  }, [currentUser, router]);

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
        callback: (response: any) => {
          // reCAPTCHA solved, allow signInWithPhoneNumber.
        },
      });
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setLoading(true);
    setError("");

    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
      
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setStep("otp");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to send OTP. Please check your phone number format (e.g. +1234567890).");
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then((widgetId: any) => {
          grecaptcha.reset(widgetId);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !confirmationResult) return;
    setLoading(true);
    setError("");

    try {
      await confirmationResult.confirm(otp);
      router.push("/");
    } catch (err: any) {
      console.error(err);
      setError("Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ justifyContent: "center", alignItems: "center" }}>
      <div className="card" style={{ maxWidth: "400px", width: "100%" }}>
        <div className="text-center" style={{ marginBottom: "24px" }}>
          <div className="sidebar-logo" style={{ padding: 0, marginBottom: "8px" }}>SJB QP Gen</div>
          <h2 style={{ fontSize: "20px", fontWeight: 600 }}>Welcome Back</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Sign in to access the Dashboard</p>
        </div>

        {error && <div className="status-error text-center" style={{ marginBottom: "16px", padding: "8px", background: "#FFF5F5", borderRadius: "8px" }}>{error}</div>}

        {step === "phone" ? (
          <form onSubmit={handleSendOtp}>
            <div className="input-group">
              <label className="input-label">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 234 567 8900"
                className="pill-input"
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading || !phoneNumber}>
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="input-group">
              <label className="input-label">Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                className="pill-input"
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading || !otp}>
              {loading ? "Verifying..." : "Verify & Sign In"}
            </button>
            <div className="text-center" style={{ marginTop: "16px" }}>
              <button 
                type="button" 
                onClick={() => { setStep("phone"); setOtp(""); }} 
                style={{ background: "none", border: "none", color: "var(--primary-purple)", cursor: "pointer", fontSize: "14px", fontWeight: 500 }}
              >
                Change Phone Number
              </button>
            </div>
          </form>
        )}

        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
}

// Add recaptchaVerifier to window object for TypeScript
declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}
