import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { ErrorNote, Icon, IconButton, SearchField, matches, readableOn, useConfirm } from '../../components/ui';
import { ItemModal } from '../../components/ItemModal';
import type { Board, Item, Tier } from '../../types';

const POOL = 'pool';

export default function VoteView({ board, setBoard }: { board: Board; setBoard: Dispatch<SetStateAction<Board | null>> }) {
  const confirm = useConfirm();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = board.status === 'open';

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byTier = useMemo(() => {
    const map = new Map<number | typeof POOL, Item[]>([[POOL, []]]);
    for (const t of board.tiers) map.set(t.id, []);
    for (const item of board.items) {
      const tierId = board.myVotes[item.id];
      (map.get(tierId ?? POOL) ?? map.get(POOL)!).push(item);
    }
    return map;
  }, [board]);

  const placed = Object.keys(board.myVotes).length;

  async function place(itemId: number, tierId: number | null) {
    const previous = board.myVotes[itemId] ?? null;
    if (previous === tierId) return;
    const apply = (value: number | null) =>
      setBoard((b) => {
        if (!b) return b;
        const myVotes = { ...b.myVotes };
        if (value === null) delete myVotes[itemId];
        else myVotes[itemId] = value;
        return { ...b, myVotes };
      });
    apply(tierId);
    setError(null);
    try {
      await api.put(`/tierlists/${board.id}/votes/${itemId}`, { tierId });
    } catch (err) {
      apply(previous);
      setError(errorMessage(err));
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const target = e.over.id === POOL ? null : Number(e.over.id);
    place(Number(e.active.id), target);
  }

  function onZoneClick(tierId: number | null) {
    if (selectedId === null) return;
    place(selectedId, tierId);
    setSelectedId(null);
  }

  /** Placing from the picker keeps the run going with the next unranked item. */
  function pick(tierId: number | null) {
    if (selectedId === null) return;
    const fromPool = board.myVotes[selectedId] === undefined;
    const idx = visiblePool.findIndex((i) => i.id === selectedId);
    const next = fromPool && tierId !== null ? (visiblePool[idx + 1] ?? visiblePool[idx - 1] ?? null) : null;
    place(selectedId, tierId);
    setSelectedId(next?.id ?? null);
  }

  async function reset() {
    const ok = await confirm({
      title: 'Neu anfangen?',
      message: `Deine ${placed} Einordnungen in diesem Board werden entfernt. Die Stimmen der anderen bleiben erhalten.`,
      confirmLabel: 'Zurücksetzen',
      icon: 'restart_alt',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/tierlists/${board.id}/votes`);
      setBoard((b) => (b ? { ...b, myVotes: {} } : b));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const activeItem = board.items.find((i) => i.id === activeId) ?? null;
  const tileProps = {
    disabled: !open,
    selectedId,
    onSelect: (id: number) => {
      setSelectedId((cur) => (cur === id ? null : id));
      setSheetOpen(false);
    },
    onInfo: setDetail,
  };
  const pool = byTier.get(POOL) ?? [];
  const visiblePool = query ? pool.filter((i) => matches(i.name, query)) : pool;
  const total = board.items.length;
  const selectedItem = board.items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="vote">
      {!open && (
        <p className="notice">
          <Icon name="lock" /> Die Abstimmung ist beendet, du kannst nichts mehr ändern.
          <Link to={`/boards/${board.id}/results`}>Zum Ergebnis</Link>
        </p>
      )}
      <ErrorNote error={error} />

      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          setActiveId(Number(e.active.id));
          setSelectedId(null);
          // Get the sheet out of the way so the tiers are free to drop on.
          setSheetOpen(false);
        }}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="vote-layout">
          <div className={`tierboard ${selectedId !== null ? 'is-placing' : ''}`}>
            {board.tiers.map((tier) => (
              <TierRow key={tier.id} tier={tier} items={byTier.get(tier.id) ?? []} onZoneClick={onZoneClick} {...tileProps} />
            ))}
          </div>

          <PoolZone
            items={visiblePool}
            remaining={pool.length}
            onZoneClick={onZoneClick}
            picking={selectedItem !== null}
            sheetOpen={sheetOpen}
            onSheet={setSheetOpen}
            {...tileProps}
            header={
              <>
                <div className="pool-progress">
                  <div className="pool-progress-text">
                    <strong>{pool.length === 0 ? 'Fertig!' : `${pool.length} übrig`}</strong>
                    <small>
                      {placed} / {total}
                    </small>
                  </div>
                  <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={placed} aria-label="Eingeordnet">
                    <span style={{ width: `${total ? (placed / total) * 100 : 0}%` }} />
                  </div>
                </div>
                {open && placed > 0 && <IconButton icon="restart_alt" label="Alle Einordnungen zurücksetzen" onClick={reset} size="sm" />}
              </>
            }
            search={pool.length > 8 && <SearchField value={query} onChange={setQuery} placeholder="Eintrag suchen" />}
            hint={
              selectedItem ? (
                <TierPicker
                  item={selectedItem}
                  tiers={board.tiers}
                  current={board.myVotes[selectedItem.id] ?? null}
                  onPick={pick}
                  onInfo={() => setDetail(selectedItem)}
                  onCancel={() => setSelectedId(null)}
                />
              ) : open && pool.length > 0 ? (
                <p className="pool-hint">Ziehen oder antippen, dann Rang wählen</p>
              ) : null
            }
            done={
              <div className="pool-done">
                <Icon name="celebration" className="pool-done-icon" />
                <p>Alles eingeordnet. Umsortieren geht jederzeit.</p>
                {board.canSeeResults && (
                  <Link to={`/boards/${board.id}/results`} className="btn btn-primary btn-sm">
                    <Icon name="leaderboard" /> Ergebnis ansehen
                  </Link>
                )}
              </div>
            }
          />
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>{activeItem && <TileFace item={activeItem} lifted />}</DragOverlay>
      </DndContext>

      {detail && <ItemModal item={detail} tiers={board.tiers} onClose={() => setDetail(null)} />}
    </div>
  );
}

interface TileHandlers {
  disabled: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onInfo: (item: Item) => void;
}

function TierRow({ tier, items, onZoneClick, ...tile }: TileHandlers & { tier: Tier; items: Item[]; onZoneClick: (id: number | null) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: tier.id, disabled: tile.disabled });
  return (
    <div className={`tier-row ${isOver ? 'is-over' : ''}`}>
      <div className="tier-label" style={{ background: tier.color, color: readableOn(tier.color) }}>
        <span>{tier.name}</span>
        {items.length > 0 && <small className="tier-count">{items.length}</small>}
      </div>
      <div ref={setNodeRef} className="tier-zone" onClick={() => onZoneClick(tier.id)}>
        {items.map((item) => (
          <Tile key={item.id} item={item} {...tile} />
        ))}
      </div>
    </div>
  );
}

function TierPicker({
  item,
  tiers,
  current,
  onPick,
  onInfo,
  onCancel,
}: {
  item: Item;
  tiers: Tier[];
  current: number | null;
  onPick: (tierId: number | null) => void;
  onInfo: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="picker" role="group" aria-label={`Rang für ${item.name} wählen`}>
      <div className="picker-item">
        {item.image ? <img src={item.image} alt="" /> : <Icon name="style" className="picker-noimg" />}
        <strong>{item.name}</strong>
        <IconButton icon="info" label="Details" size="sm" onClick={onInfo} />
        <IconButton icon="close" label="Auswahl aufheben" size="sm" onClick={onCancel} />
      </div>
      <div className="picker-tiers">
        {tiers.map((t) => (
          <button
            key={t.id}
            type="button"
            className="picker-tier"
            style={{ background: t.color, color: readableOn(t.color) }}
            aria-pressed={current === t.id}
            onClick={() => onPick(t.id)}
          >
            {t.name}
          </button>
        ))}
        {current !== null && <IconButton icon="move_down" label="Zurück zu den offenen Einträgen" variant="soft" onClick={() => onPick(null)} />}
      </div>
    </div>
  );
}

function PoolZone({
  items,
  remaining,
  onZoneClick,
  picking,
  sheetOpen,
  onSheet,
  header,
  search,
  hint,
  done,
  ...tile
}: TileHandlers & {
  items: Item[];
  remaining: number;
  onZoneClick: (id: number | null) => void;
  picking: boolean;
  sheetOpen: boolean;
  onSheet: (open: boolean) => void;
  header: ReactNode;
  search: ReactNode;
  hint: ReactNode;
  done: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL, disabled: tile.disabled });
  const sheetRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [peek, setPeek] = useState(0);
  const drag = useSheetDrag(sheetRef, sheetOpen, onSheet);

  // Collapsed, the sheet shows its top part down to the end of the first tile row.
  useLayoutEffect(() => {
    const measure = () => {
      const zone = zoneRef.current;
      if (!zone) return;
      const first = zone.firstElementChild as HTMLElement | null;
      const pad = parseFloat(getComputedStyle(zone).paddingTop) || 0;
      setPeek(Math.round(zone.offsetTop + pad + (first?.offsetHeight ?? 0) + pad));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (topRef.current) observer.observe(topRef.current);
    if (zoneRef.current) observer.observe(zoneRef.current);
    return () => observer.disconnect();
  }, [items.length, remaining, picking]);

  useEffect(() => {
    if (!sheetOpen && zoneRef.current) zoneRef.current.scrollTop = 0;
  }, [sheetOpen]);

  return (
    <>
      {sheetOpen && <div className="sheet-backdrop" onClick={() => onSheet(false)} aria-hidden />}
      <aside
        ref={sheetRef}
        className={`pool ${isOver ? 'is-over' : ''} ${picking ? 'is-picking' : ''} ${sheetOpen ? 'is-open' : ''}`}
        style={{ '--peek': `${peek}px` } as CSSProperties}
        aria-label="Noch nicht eingeordnet"
      >
        <div className="pool-top" ref={topRef} {...drag}>
          <button
            type="button"
            className="sheet-handle"
            aria-expanded={sheetOpen}
            aria-controls="pool-zone"
            aria-label={sheetOpen ? 'Auswahl einklappen' : 'Alle offenen Einträge zeigen'}
            // Pointer taps are handled by the drag hook; this covers Enter/Space.
            onClick={(e) => e.detail === 0 && onSheet(!sheetOpen)}
          >
            <span />
          </button>
          <div className="pool-head">{header}</div>
          {search}
          {hint}
        </div>
        <div
          id="pool-zone"
          ref={(node) => {
            setNodeRef(node);
            zoneRef.current = node;
          }}
          className={`pool-zone ${remaining === 0 ? 'is-empty' : ''}`}
          onClick={() => onZoneClick(null)}
        >
          {remaining === 0 ? done : items.length === 0 ? <p className="muted pool-none">Kein Treffer.</p> : items.map((item) => <Tile key={item.id} item={item} {...tile} />)}
        </div>
      </aside>
      <div className="sheet-spacer" style={{ height: peek }} aria-hidden />
    </>
  );
}

/** Below this width the pool is a bottom sheet instead of a sidebar. */
const SHEET_QUERY = '(max-width: 999px)';

/** Pull the sheet up or down by its top area; it follows the finger and snaps open or shut on release. */
function useSheetDrag(sheetRef: RefObject<HTMLElement | null>, open: boolean, onSheet: (open: boolean) => void) {
  const state = useRef<{ y: number; t: number; base: number; max: number; offset: number; moved: boolean; onHandle: boolean } | null>(null);

  const end = (e: PointerEvent<HTMLElement>) => {
    const s = state.current;
    const sheet = sheetRef.current;
    state.current = null;
    if (!s || !sheet) return;
    sheet.style.transform = '';
    sheet.style.transition = '';
    // Pointer capture retargets the click away from the handle, so taps are recognised here.
    if (!s.moved) {
      if (s.onHandle && e.type === 'pointerup') onSheet(!open);
      return;
    }
    const velocity = (e.clientY - s.y) / Math.max(1, e.timeStamp - s.t);
    const shouldOpen = Math.abs(velocity) > 0.4 ? velocity < 0 : s.offset < s.max / 2;
    onSheet(shouldOpen);
  };

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      const sheet = sheetRef.current;
      if (!sheet || e.button !== 0 || !matchMedia(SHEET_QUERY).matches) return;
      const target = e.target as Element;
      if (target.closest('input, a, button:not(.sheet-handle)')) return;
      const max = sheet.offsetHeight - (parseFloat(sheet.style.getPropertyValue('--peek')) || 0);
      const base = open ? 0 : max;
      state.current = { y: e.clientY, t: e.timeStamp, base, max, offset: base, moved: false, onHandle: !!target.closest('.sheet-handle') };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = state.current;
      const sheet = sheetRef.current;
      if (!s || !sheet) return;
      const dy = e.clientY - s.y;
      if (!s.moved && Math.abs(dy) < 6) return;
      s.moved = true;
      s.offset = Math.min(s.max, Math.max(0, s.base + dy));
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${s.offset}px)`;
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

function Tile({ item, disabled, selectedId, onSelect, onInfo }: TileHandlers & { item: Item }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled });
  const selected = selectedId === item.id;
  const el = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Auto-advanced selection may sit below the fold of the sidebar list.
    if (selected && !matchMedia(SHEET_QUERY).matches) el.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        el.current = node;
      }}
      className={`tile ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}
      {...listeners}
      {...attributes}
      aria-label={item.name}
      aria-pressed={selected}
      title={item.name}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onSelect(item.id);
        else onInfo(item);
      }}
      onDoubleClick={() => onInfo(item)}
    >
      <TileFace item={item} />
      <button
        className="tile-info"
        aria-label={`Details zu ${item.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onInfo(item);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Icon name="info" />
      </button>
    </div>
  );
}

export function TileFace({ item, lifted }: { item: Item; lifted?: boolean }) {
  return (
    <div className={`tile-face ${lifted ? 'is-lifted' : ''} ${item.image ? '' : 'no-image'}`}>
      {item.image ? <img src={item.image} alt="" draggable={false} loading="lazy" /> : null}
      <span className="tile-name">{item.name}</span>
    </div>
  );
}
