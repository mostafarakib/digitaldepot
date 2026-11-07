'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { apiClient, onAuthLogout, coordinateRefresh } from '@/lib/api-client';
import type {
  AuthenticatedUser,
  AuthContextValue,
  RegisterResult,
  RegisterData,
  LoginResult,
} from '@/lib/auth-types';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const data = await apiClient<{ user: AuthenticatedUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const data = await apiClient<{ user: AuthenticatedUser }>('/api/auth/me');
        if (isMounted) setUser(data.user);
      } catch {
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadUser();

    // Listen to session revocation notifications from apiClient
    const unsubscribeLogout = onAuthLogout(() => {
      setUser(null);
    });

    // Cross-tab synchronization via BroadcastChannel
    let channel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      channel = new BroadcastChannel('dd_auth_channel');
      channel.onmessage = (event: MessageEvent<{ type: string }>) => {
        if (event.data?.type === 'LOGOUT') {
          setUser(null);
        } else if (event.data?.type === 'LOGIN') {
          void fetchCurrentUser();
        }
      };
    }

    return () => {
      isMounted = false;
      unsubscribeLogout();
      if (channel) {
        channel.close();
      }
    };
  }, [fetchCurrentUser]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await apiClient<LoginResult>('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setUser(result.user);

      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('dd_auth_channel');
        channel.postMessage({ type: 'LOGIN' });
        channel.close();
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<RegisterResult> => {
    setIsLoading(true);
    try {
      const result = await apiClient<RegisterResult>('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiClient('/api/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Best-effort logout; clear local state regardless of network response
    } finally {
      setUser(null);
      setIsLoading(false);

      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('dd_auth_channel');
        channel.postMessage({ type: 'LOGOUT' });
        channel.close();
      }
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const refreshed = await coordinateRefresh();
    if (refreshed) {
      await fetchCurrentUser();
      return true;
    }
    return false;
  }, [fetchCurrentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      refreshSession,
      refreshUser: fetchCurrentUser,
    }),
    [user, isLoading, login, register, logout, refreshSession, fetchCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
