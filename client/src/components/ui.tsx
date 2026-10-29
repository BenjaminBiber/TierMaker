import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { Person } from '../types';

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-icons-round ${className}`} aria-hidden>
      {name}
    </span>
  );
}

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function Avatar({ person, size = 28 }: { person: Pick<Person, 'name' | 'avatarUrl'>; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (person.avatarUrl) {
    return <img className="avatar" src={person.avatarUrl} alt="" style={style} referrerPolicy="no-referrer" />;
  }
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: `hsl(${hue(person.name)} 55% 62%)` }} aria-hidden>
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ── Tooltip ─────────────────────────────────────────────────────────── */

interface TipPos {
  x: number;
  y: number;
  above: boolean;
  host: Element;
}

/** Shifts a centred tooltip sideways when it would stick out of the window. */
function keepInViewport(el: HTMLElement | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const shift = Math.max(8 - r.left, Math.min(0, window.innerWidth - 8 - r.right));
  el.style.marginLeft = `${shift}px`;
}

/** Hover/focus tooltip rendered in a portal, so overflow containers never clip it. */
function useTooltip(label: string) {
  const [pos, setPos] = useState<TipPos | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const above = r.bottom + 44 > window.innerHeight;
    setPos({
      x: r.left + r.width / 2,
      y: above ? r.top - 8 : r.bottom + 8,
      above,
      // A modal <dialog> sits in the top layer; the tip has to live inside it to be visible.
      host: el.closest('dialog[open]') ?? document.body,
    });
  };
  const hide = () => setPos(null);
  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => e.pointerType !== 'touch' && show(e.currentTarget),
    onPointerLeave: hide,
    onFocus: (e: FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && show(e.currentTarget),
    onBlur: hide,
  };
  const tip =
    pos &&
    createPortal(
      <span role="tooltip" className={`tooltip ${pos.above ? 'is-above' : ''}`} style={{ left: pos.x, top: pos.y }} ref={keepInViewport}>
        {label}
      </span>,
      pos.host,
    );
  return { handlers, tip, hide };
}

type IconButtonProps = {
  icon: string;
  /** Accessible name, also shown as tooltip */
  label: string;
  variant?: 'plain' | 'soft' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  to?: string;
  href?: string;
  download?: boolean;
  badge?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function IconButton({ icon, label, variant = 'plain', size = 'md', to, href, download, badge, className = '', onClick, ...rest }: IconButtonProps) {
  const { handlers, tip, hide } = useTooltip(label);
  const cls = `icon-btn icon-btn-${variant} icon-btn-${size} ${className}`;
  const content = (
    <>
      <Icon name={icon} />
      {badge != null && <span className="icon-btn-badge">{badge}</span>}
      {tip}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={label} {...handlers} onClick={hide}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} download={download} className={cls} aria-label={label} {...handlers} onClick={hide}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      {...rest}
      {...handlers}
      onClick={(e) => {
        hide();
        onClick?.(e);
      }}
    >
      {content}
    </button>
  );
}

/* ── Dialogs ─────────────────────────────────────────────────────────── */

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton icon="close" label="Schließen" onClick={onClose} />
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}

let formIds = 0;

/** Modal with a form; the submit button lives in the footer. */
export function FormDialog({
  title,
  submitLabel = 'Speichern',
  submitIcon,
  busy,
  error,
  disabled,
  onSubmit,
  onClose,
  children,
  size,
}: {
  title: ReactNode;
  submitLabel?: string;
  submitIcon?: string;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [id] = useState(() => `form-${++formIds}`);
  return (
    <Modal
      title={title}
      onClose={onClose}
      size={size}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" form={id} disabled={busy || disabled}>
            {submitIcon && <Icon name={submitIcon} />}
            {busy ? 'Einen Moment …' : submitLabel}
          </button>
        </>
      }
    >
      <form
        id={id}
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <ErrorNote error={error ?? null} />
      </form>
    </Modal>
  );
}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  icon?: string;
  danger?: boolean;
  /** User has to type this text before the confirm button unlocks */
  requireText?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);
  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog {...request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm outside ConfirmProvider');
  return ctx;
}

function ConfirmDialog({ title, message, confirmLabel = 'Bestätigen', icon, danger, requireText, onClose }: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const unlocked = !requireText || typed.trim() === requireText.trim();
  return (
    <Modal
      title={title}
      size="sm"
      onClose={() => onClose(false)}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>
            Abbrechen
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!unlocked} onClick={() => onClose(true)} autoFocus={!requireText}>
            {icon && <Icon name={icon} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack-sm">
        {message && <div className="confirm-message">{message}</div>}
        {requireText && (
          <label className="field">
            <span>Zum Bestätigen „{requireText}“ eingeben</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlocked && onClose(true)}
              autoFocus
            />
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────── */

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error-note" role="alert">
      <Icon name="error_outline" /> {error}
    </p>
  );
}

export function SearchField({ value, onChange, placeholder = 'Suchen' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="search">
      <Icon name="search" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export const matches = (name: string, query: string) => name.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'));

/** Pick black or white text for a tier colour. */
export function readableOn(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#1a1f2c' : '#ffffff';
}
