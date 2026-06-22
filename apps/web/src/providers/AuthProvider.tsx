"use client";

import { createContext, useContext, useEffect, useReducer } from "react";
import type { MakySchoolRole, TenantUser } from "@makyschool/shared/types";
import { apiClient } from "@/lib/api/client";

type AuthMeResponse = {
  accountType: "school" | "platform";
  role?: MakySchoolRole;
  user?: TenantUser;
  school?: { slug: string; id: string };
};

type AuthState = {
  user: TenantUser | null;
  loading: boolean;
  error: string | null;
};

type AuthAction =
  | { type: "LOADING" }
  | { type: "SET_USER"; user: TenantUser | null }
  | { type: "SET_ERROR"; error: string | null };

const AuthContext = createContext<{
  state: AuthState;
  login: (email: string, password: string, schoolSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
} | null>(null);

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOADING":
      return { ...state, loading: true, error: null };
    case "SET_USER":
      return { user: action.user, loading: false, error: null };
    case "SET_ERROR":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    loading: true,
    error: null,
  });

  async function refresh() {
    dispatch({ type: "LOADING" });
    try {
      const response = await apiClient<AuthMeResponse>("/auth/me");
      const payload = response.data;

      if (payload.accountType === "school" && payload.user) {
        dispatch({
          type: "SET_USER",
          user: {
            ...payload.user,
            role: payload.user.role ?? payload.role ?? "admin",
          },
        });
        return;
      }

      dispatch({ type: "SET_USER", user: null });
    } catch {
      dispatch({ type: "SET_USER", user: null });
    }
  }

  async function login(email: string, password: string, schoolSlug?: string) {
    dispatch({ type: "LOADING" });
    try {
      await apiClient("/auth/login", {
        method: "POST",
        body: { email, password },
        schoolSlug,
      });
      await refresh();
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Login failed",
      });
      throw error;
    }
  }

  async function logout() {
    await apiClient("/auth/logout", { method: "POST" });
    dispatch({ type: "SET_USER", user: null });
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
