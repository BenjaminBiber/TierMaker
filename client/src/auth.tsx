import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AuthConfig, User } from './types';

interface AuthState {
  user: User | null;
  config: AuthConfig | null;
  /** Set when the backend could not be reached on startup */
  error: string | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<{ user: User | null }>('/auth/me'), api.get<AuthConfig>('/auth/config')])
      .then(([me, cfg]) => {
        setUser(me.user);
        setConfig(cfg);
      })
      .catch(() => setError('Der Server ist nicht erreichbar. Läuft das Backend (im Dev-Modus: „npm run dev“ im Ordner server)?'))
      .finally(() => setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('tm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('tm:unauthorized', onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, config, error, loading, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
