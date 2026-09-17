"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export interface User {
  email: string;
  role: 'professor' | 'hod';
  tenantId?: string;
  token?: string;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  login: () => {},
  logout: () => {},
  hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const verifySession = async () => {
      try {
        const storedUser = localStorage.getItem("qpgen_user");
        if (storedUser) {
          // Attempt to verify with the backend
          const res = await api.get('/auth/me');
          if (res.data && res.data.user) {
            // Keep the user state in sync with the backend
            setCurrentUser(res.data.user);
            localStorage.setItem("qpgen_user", JSON.stringify(res.data.user));
          } else {
            throw new Error('Invalid session');
          }
        }
      } catch (e) {
        console.error("Session verification failed", e);
        localStorage.removeItem("qpgen_user");
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = (user: User) => {
    localStorage.setItem("qpgen_user", JSON.stringify(user));
    setCurrentUser(user);
    router.push("/");
  };

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.error("Logout API failed", e);
    } finally {
      localStorage.removeItem("qpgen_user");
      setCurrentUser(null);
      router.push("/login");
    }
  }, [router]);

  // Auto-logout after 1 hour of inactivity
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      if (currentUser) {
        timeoutId = setTimeout(() => {
          logout();
        }, 60 * 60 * 1000); // 1 hour
      }
    };

    const events = ['mousemove', 'keydown', 'scroll', 'click'];

    if (currentUser) {
      resetTimer();
      events.forEach(e => window.addEventListener(e, resetTimer));
    }

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [currentUser, logout]);

  const hasRole = (...roles: string[]) => {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};
