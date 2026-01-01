'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError, setToken } from './apiClient';
import { User, userSchema } from './schemas';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // TODO: migrate token storage to httpOnly cookies via a session route.
      setTokenState(window.localStorage.getItem('gd.jwt'));
      setBooted(true);
    }
  }, []);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const data = await apiFetch<{ user: User }>('/users/me');
      return userSchema.parse(data.user);
    },
    enabled: !!token,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      setToken(null);
      setTokenState(null);
    }
  }, [meQuery.error]);

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: User }>('/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setTokenState(data.token);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    router.push('/courses');
  };

  const register = async (email: string, password: string, name?: string) => {
    const data = await apiFetch<{ token: string; user: User }>('/auth/password/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setToken(data.token);
    setTokenState(data.token);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    router.push('/courses');
  };

  const logout = () => {
    setToken(null);
    setTokenState(null);
    queryClient.clear();
    router.push('/login');
  };

  const value = useMemo(
    () => ({
      user: meQuery.data || null,
      token,
      isLoading: !booted || (token ? meQuery.isLoading : false),
      login,
      register,
      logout,
    }),
    [booted, meQuery.data, meQuery.isLoading, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
