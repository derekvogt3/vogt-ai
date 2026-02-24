import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { AuthContext } from '../hooks/use-auth';
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  type User,
} from '../api/auth-client';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, inviteCode: string) => {
    const res = await apiRegister(email, password, inviteCode);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext>
  );
}
