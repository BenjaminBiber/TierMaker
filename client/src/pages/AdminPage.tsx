import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Avatar, ErrorNote, FormDialog, IconButton, useConfirm } from '../components/ui';
import type { AdminUser } from '../types';

export default function AdminPage() {
  const { user: me, config } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);

  const load = useCallback(() => api.get<AdminUser[]>('/admin/users').then(setUsers, (err) => setError(errorMessage(err))), []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleAdmin(u: AdminUser) {
    const ok = await confirm(
      u.isAdmin
        ? { title: 'Admin-Rechte entziehen?', message: `${u.name} kann danach keine fremden Boards und Benutzer mehr verwalten.`, confirmLabel: 'Entziehen', icon: 'remove_moderator', danger: true }
        : { title: 'Zum Admin machen?', message: `${u.name} kann danach alle Boards und Benutzer verwalten.`, confirmLabel: 'Zum Admin machen', icon: 'shield' },
    );
    if (ok) act(() => api.patch(`/admin/users/${u.id}`, { isAdmin: !u.isAdmin }));
  }

  async function remove(u: AdminUser) {
    const ok = await confirm({
      title: 'Benutzer löschen?',
      message: `${u.name} wird mit ${u.voteCount} Stimmen gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: 'Löschen',
      icon: 'person_remove',
      danger: true,
    });
    if (ok) act(() => api.del(`/admin/users/${u.id}`));
  }

  return (
    <>
      <div className="page-head">
        <h1>
          Benutzer <span className="count">{users.length}</span>
        </h1>
        <span className="spacer" />
        {config?.passwordAuth && <IconButton icon="person_add" label="Konto mit Passwort anlegen" variant="primary" size="lg" onClick={() => setCreating(true)} />}
      </div>
      <ErrorNote error={error} />

      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id}>
            <Avatar person={u} size={40} />
            <span className="user-text">
              <strong>
                {u.name}
                {u.isAdmin && <span className="chip chip-admin">Admin</span>}
                {u.id === me?.id && <span className="chip">Du</span>}
              </strong>
              <small>
                {u.provider === 'google' ? u.email : `@${u.username}`} · {u.boardCount} Boards · {u.voteCount} Stimmen
              </small>
            </span>
            <span className="row-actions">
              {u.id !== me?.id && (
                <IconButton
                  icon={u.isAdmin ? 'remove_moderator' : 'shield'}
                  label={u.isAdmin ? 'Admin-Rechte entziehen' : 'Zum Admin machen'}
                  onClick={() => toggleAdmin(u)}
                />
              )}
              {u.provider === 'password' && <IconButton icon="key" label="Passwort zurücksetzen" onClick={() => setResetFor(u)} />}
              {u.id !== me?.id && <IconButton icon="person_remove" label={`${u.name} löschen`} variant="danger" onClick={() => remove(u)} />}
            </span>
          </li>
        ))}
      </ul>

      {creating && <CreateUserDialog onClose={() => setCreating(false)} onCreated={load} />}
      {resetFor && <PasswordDialog user={resetFor} onClose={() => setResetFor(null)} />}
    </>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const save = async () => {
    if (await run(() => api.post('/admin/users', { username, password }))) {
      await onCreated();
      onClose();
    }
  };
  return (
    <FormDialog title="Konto anlegen" submitLabel="Anlegen" submitIcon="person_add" size="sm" busy={busy} error={error} onSubmit={save} onClose={onClose}>
      <label className="field">
        <span>Benutzername</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} autoComplete="off" autoFocus />
      </label>
      <label className="field">
        <span>Passwort</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        <small className="muted">Mindestens 8 Zeichen.</small>
      </label>
    </FormDialog>
  );
}

function PasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const save = async () => {
    if (await run(() => api.patch(`/admin/users/${user.id}`, { password }))) onClose();
  };
  return (
    <FormDialog title={`Neues Passwort für ${user.name}`} submitLabel="Passwort setzen" submitIcon="key" size="sm" busy={busy} error={error} onSubmit={save} onClose={onClose}>
      <label className="field">
        <span>Neues Passwort</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" autoFocus />
        <small className="muted">Mindestens 8 Zeichen. {user.name} wird danach auf allen Geräten abgemeldet.</small>
      </label>
    </FormDialog>
  );
}
