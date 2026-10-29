import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage, safeNext } from '../api';
import { useAuth } from '../auth';
import { ErrorNote } from '../components/ui';
import type { User } from '../types';

const PREVIEW_TIERS = [
  ['S', 'var(--tier-s)'],
  ['A', 'var(--tier-a)'],
  ['B', 'var(--tier-b)'],
  ['C', 'var(--tier-c)'],
  ['D', 'var(--tier-d)'],
] as const;

export default function LoginPage() {
  const { config, error: serverError, setUser } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const goingToBoard = /^\/boards\/\d+/.test(next);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error'));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: User }>(`/auth/${mode}`, { username, password });
      // App's /login route sends signed-in users on to `next`.
      setUser(user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const nothingEnabled = config && !config.googleAuth && !config.passwordAuth;

  return (
    <div className="login">
      <div className="login-art" aria-hidden>
        {PREVIEW_TIERS.map(([label, color], i) => (
          <div className="login-row" key={label} style={{ animationDelay: `${i * 70}ms` }}>
            <span className="login-label" style={{ background: color }}>
              {label}
            </span>
            <span className="login-slots">
              {Array.from({ length: 5 - i }, (_, j) => (
                <i key={j} />
              ))}
            </span>
          </div>
        ))}
      </div>

      <section className="login-card">
        <h1>TierMaker</h1>
        <p className="lede">
          {goingToBoard
            ? 'Melde dich an, danach geht es direkt weiter zum Board.'
            : 'Gemeinsam ranken: Jede:r sortiert für sich, der Median entscheidet.'}
        </p>

        <ErrorNote error={serverError ?? error} />

        {config?.googleAuth && (
          <a className="btn btn-google" href={next === '/' ? '/api/auth/google' : `/api/auth/google?next=${encodeURIComponent(next)}`}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
            </svg>
            Mit Google anmelden
          </a>
        )}

        {config?.googleAuth && config.passwordAuth && <div className="or">oder</div>}

        {config?.passwordAuth && (
          <form onSubmit={submit} className="stack">
            <label className="field">
              <span>Benutzername</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} />
            </label>
            <label className="field">
              <span>Passwort</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : 1}
              />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
            {config.allowRegistration && (
              <button type="button" className="link-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon registriert? Anmelden'}
              </button>
            )}
          </form>
        )}

        {nothingEnabled && <p className="muted">Es ist keine Anmeldemethode aktiviert. Prüfe die Umgebungsvariablen des Containers.</p>}
      </section>
    </div>
  );
}
