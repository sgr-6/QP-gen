"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export interface User {
  email: string;
  role: 'professor' | 'hod' | 'controller_of_exams' | 'print_admin' | 'tenant_admin' | 'super_admin' | 'early_access';
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
    // Check local storage on initial load
    const storedUser = localStorage.getItem("qpgen_user");
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser) as User;
        setCurrentUser(user);
      } catch (e) {
        console.error("Failed to parse user from local storage", e);
        localStorage.removeItem("qpgen_user");
      }
    }
    setLoading(false);
  }, []);

  const login = (user: User) => {
    localStorage.setItem("qpgen_user", JSON.stringify(user));
    setCurrentUser(user);
    router.push("/");
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.error("Logout API failed", e);
    } finally {
      localStorage.removeItem("qpgen_user");
      setCurrentUser(null);
      router.push("/login");
    }
  };

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
