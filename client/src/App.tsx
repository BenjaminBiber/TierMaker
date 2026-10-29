import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { safeNext } from './api';
import { useAuth } from './auth';
import { Avatar, IconButton } from './components/ui';
import LoginPage from './pages/LoginPage';
import BoardsPage from './pages/BoardsPage';
import NewBoardPage from './pages/NewBoardPage';
import BoardPage from './pages/BoardPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) return <div className="splash" aria-busy="true" />;
  if (!user) {
    // The target travels in the URL, so it survives reloads and the Google round trip.
    const target = location.pathname + location.search;
    const login = target === '/' ? '/login' : `/login?next=${encodeURIComponent(target)}`;
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to={login} replace />} />
      </Routes>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="wordmark" aria-label="TierMaker – Startseite">
          <span className="wordmark-bars" aria-hidden>
            <i style={{ background: 'var(--tier-s)' }} />
            <i style={{ background: 'var(--tier-b)' }} />
            <i style={{ background: 'var(--tier-f)' }} />
          </span>
          TierMaker
        </Link>
        <nav className="topnav">
          <NavLink to="/" end>
            Boards
          </NavLink>
          {user.isAdmin && <NavLink to="/admin">Benutzer</NavLink>}
        </nav>
        <div className="me">
          <Avatar person={user} size={30} />
          <span className="me-name">{user.name}</span>
          <IconButton icon="logout" label="Abmelden" onClick={logout} />
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/login" element={<Navigate to={safeNext(new URLSearchParams(location.search).get('next'))} replace />} />
          <Route path="/" element={<BoardsPage />} />
          <Route path="/new" element={<NewBoardPage />} />
          <Route path="/boards/:id/*" element={<BoardPage />} />
          {user.isAdmin && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
