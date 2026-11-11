import { Component, DestroyRef, HostListener, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, interval } from 'rxjs';
import { finalize } from 'rxjs/operators';

import {
  IKdsBoard,
  IKdsItem,
  IKdsStationSummary,
  IKdsTicket,
  PREP_STATUS_LABELS,
  PrepStatus,
  STATION_LABELS,
  Station,
  toAmount
} from '../../../models/ICms.model';
import { CmsKdsService } from '../../../services/cms/kds.service';
import { ConfirmationService } from '../../../services/confirmation.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/** How often the board re-reads itself. */
const BOARD_POLL_MS = 5000;

/** Failed reads in a row before the board admits it is showing stale data. */
const STALE_AFTER_FAILURES = 2;

/** How long an arrival keeps its NEW flag. */
const NEW_BADGE_MS = 120000;

/** How long a bumped ticket can be put back in the queue. */
const UNDO_WINDOW_MS = 10000;

/** Per-browser memory of how this screen was left. */
const STORAGE_STATION = 'kds.station';
const STORAGE_INCLUDE_READY = 'kds.includeReady';
const STORAGE_ORDER_BY = 'kds.orderBy';

type KdsOrderBy = 'oldest_first' | 'newest_first';

/** Minutes before a ticket stops being "on time" and starts being amber. */
const WAIT_WARN_MINUTES = 10;

/** ...and before it goes red, i.e. a chef should already be shouting about it. */
const WAIT_LATE_MINUTES = 20;

/**
 * The three states the kitchen is allowed to set, spelled out as a local union
 * rather than trusting `PrepStatus`.
 *
 * `voided` is server-set only -- voiding is a cashier action that needs a
 * reason, and the API's validator rejects it outright. Narrowing the parameter
 * type here turns "never send voided" from a comment into something the
 * TypeScript compiler enforces: `setPrep(item, 'voided')` will not compile.
 */
type SettablePrepStatus = Extract<PrepStatus, 'pending' | 'preparing' | 'ready'>;

/**
 * Kitchen display system.
 *
 * Built for a pass, not a desk: high contrast, oversized type, and hit targets
 * big enough to find with a wet hand at arm's length. Nothing here is a hover
 * affordance -- every action is a tap that works on the first try.
 *
 * Unlike the POS, the board polls unconditionally. There is no transaction in
 * progress to disturb, and a ticket that appears 10 seconds late is a guest
 * waiting on food.
 */
@Component({
  selector: 'app-kds-screen',
  templateUrl: './kds-screen.component.html',
  styleUrl: './kds-screen.component.scss'
})
export class KdsScreenComponent implements OnInit {

  //// Inject Services
  private _kdsService = inject(CmsKdsService);
  private _snackbar = inject(CustomSnackbarService);
  private _confirm = inject(ConfirmationService);
  private _destroyRef = inject(DestroyRef);

  //// Constants
  readonly PREP_STATUS_LABELS = PREP_STATUS_LABELS;
  readonly WAIT_WARN_MINUTES = WAIT_WARN_MINUTES;
  readonly WAIT_LATE_MINUTES = WAIT_LATE_MINUTES;

  //// State Properties
  /** Blocking overlay, raised only for the very first paint. */
  isPageLoad = false;
  /**
   * A BOARD READ is in flight — the timer poll, or the re-read that follows a
   * write. Deliberately NOT shared with line writes: those track their own
   * per-line / per-ticket ids, because a write that also set this flag would
   * block the very re-read it needs in order to see its own result.
   */
  isBusy = false;

  tickets: IKdsTicket[] = [];
  stations: IKdsStationSummary[] = [];
  /** `null` means every station — the "All stations" tab. */
  activeStation: Station | null = null;
  /** Plated lines come back onto the board so a chef can spot-check or requeue. */
  includeReady = false;
  /** Overdue-first by default; newest-first is for checking what just landed. */
  orderBy: KdsOrderBy = 'oldest_first';

  serverTime = '';
  summary = { pending: 0, preparing: 0, ready: 0 };

  /** Wall clock for the board header — the pass has no other time in view. */
  clock = new Date();

  /** Per-line in-flight ids, so one tap greys one row instead of the board. */
  private _pendingLines = new Set<number>();
  /** Tickets with a bump in flight, for the same reason. */
  private _pendingBumps = new Set<number>();

  /** When the board last painted successfully, for wait extrapolation. */
  private _boardReadAt = 0;
  /** A read was requested while one was already in flight. */
  private _refreshQueued = false;
  /** Incremented on every load, so a slower read for the old station is dropped. */
  private _boardGeneration = 0;
  /** Consecutive failed reads; reset by any success. */
  pollFailures = 0;
  /** Ticket ids already shown, so only genuine arrivals raise the NEW flag. */
  private _knownTickets = new Set<number>();
  /** Ticket id -> when it first appeared on this screen. */
  private _newAt = new Map<number, number>();
  /** False until the first board paints, so the initial list is not "new". */
  private _hasPainted = false;

  private _audioCtx: AudioContext | null = null;
  private _wakeLock: WakeLockSentinel | null = null;

  /** The most recent bump, kept only long enough to undo a mis-tap. */
  lastBump: {
    orderId: number;
    orderNumber: string;
    referenceLabel: string;
    itemIds: number[];
  } | null = null;
  isUndoingBump = false;
  private _undoTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.restorePreferences();
    this.load();
    this.startClock();
    this.keepScreenAwake();

    interval(BOARD_POLL_MS)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe(() => this.poll());

    this._destroyRef.onDestroy(() => {
      if (this._undoTimer) clearTimeout(this._undoTimer);
    });
  }

  /**
   * The header only shows minutes, so assigning a new Date every second would
   * re-render the whole board 60 times a minute for no visible change. Tick
   * often, reassign only when the minute actually turns.
   */
  private startClock(): void {
    interval(1000)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe(() => {
        const now = new Date();
        if (now.getMinutes() !== this.clock.getMinutes()) {
          this.clock = now;
        }
      });
  }

  /**
   * A wall-mounted screen is left alone for a whole service, so it remembers
   * which pass it is on rather than resetting to "All stations" on every
   * reload — and silently falls back when storage is unavailable.
   */
  private restorePreferences(): void {
    try {
      const station = localStorage.getItem(STORAGE_STATION);
      this.activeStation = station && station !== 'null' ? station as Station : null;
      this.includeReady = localStorage.getItem(STORAGE_INCLUDE_READY) === '1';
      this.orderBy = localStorage.getItem(STORAGE_ORDER_BY) === 'newest_first'
        ? 'newest_first'
        : 'oldest_first';
    } catch {
      this.activeStation = null;
      this.includeReady = false;
      this.orderBy = 'oldest_first';
    }
  }

  private persistPreferences(): void {
    try {
      localStorage.setItem(STORAGE_STATION, this.activeStation ?? 'null');
      localStorage.setItem(STORAGE_INCLUDE_READY, this.includeReady ? '1' : '0');
      localStorage.setItem(STORAGE_ORDER_BY, this.orderBy);
    } catch {
      /* storage disabled — the board still works, it just won't remember */
    }
  }

  /**
   * Browsers refuse to start audio without a gesture, so the context is created
   * on the first tap anywhere on the screen. Until a chef has touched it, a new
   * ticket is silent — the NEW badge still shows.
   */
  @HostListener('document:pointerdown')
  unlockAudio(): void {
    if (this._audioCtx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this._audioCtx = new Ctor();
      void this._audioCtx.resume?.();
    } catch {
      this._audioCtx = null;
    }
  }

  /** Two rising tones: distinct from the POS chime and short enough to ignore. */
  private chime(): void {
    const ctx = this._audioCtx;
    if (!ctx) return;
    try {
      const start = ctx.currentTime;
      [880, 1174.66].forEach((frequency, i) => {
        const at = start + i * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.18);
      });
    } catch {
      /* audio is a courtesy; the board never depends on it */
    }
  }

  /** Keep the wall tablet awake; releases on destroy so a tab left open does not hold a lock. */
  private keepScreenAwake(): void {
    const wakeLock = (navigator as unknown as {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> };
    }).wakeLock;
    if (!wakeLock?.request) return;

    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      wakeLock.request('screen')
        .then(lock => { this._wakeLock = lock; })
        .catch(() => { /* battery saver or policy — not fatal */ });
    };

    acquire();
    document.addEventListener('visibilitychange', acquire);
    this._destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', acquire);
      try { this._wakeLock?.release(); } catch { /* already released */ }
    });
  }

  get isFullscreen(): boolean {
    return !!document.fullscreenElement;
  }

  toggleFullscreen(): void {
    if (this.isFullscreen) {
      void document.exitFullscreen?.();
      return;
    }
    const request = document.documentElement.requestFullscreen?.();
    if (request) request.catch(() => { /* the browser may refuse without a gesture */ });
  }
  //// ------------------------------------------------------------------
  ////  Derived read models
  //// ------------------------------------------------------------------

  get stationLabel(): string {
    return this.activeStation ? this.labelForStation(this.activeStation) : 'All stations';
  }

  /** Outstanding lines across every station — the number on the "All" tab. */
  get totalOutstanding(): number {
    return this.stations.reduce((sum, s) => sum + (s.total ?? 0), 0);
  }

  get ticketCount(): number {
    return this.tickets.length;
  }

  isLineBusy(item: IKdsItem): boolean {
    return this._pendingLines.has(item.id);
  }

  isTicketBusy(ticket: IKdsTicket): boolean {
    return this._pendingBumps.has(ticket.order_id);
  }

  /** The board is showing data older than it can verify — say so on screen. */
  get isStale(): boolean {
    return this.pollFailures >= STALE_AFTER_FAILURES;
  }

  /**
   * Minutes a ticket has been waiting, taken from what the server said at the
   * last read plus the local time elapsed since. The server number alone would
   * only move every poll, so a ticket would sit on "9 min" past its amber
   * threshold until the next refresh.
   */
  waitMinutes(ticket: IKdsTicket): number {
    const elapsed = this._boardReadAt ? Math.floor((Date.now() - this._boardReadAt) / 60000) : 0;
    return toAmount(ticket.max_wait_minutes) + elapsed;
  }

  waitClassFor(ticket: IKdsTicket): 'wait-ok' | 'wait-warn' | 'wait-late' {
    return this.waitClass(this.waitMinutes(ticket));
  }

  /**
   * Time on the fire for one line, with the same local drift as the ticket
   * wait so a dish crossing the amber band does not wait for the next poll.
   */
  prepMinutes(item: IKdsItem): number {
    const elapsed = this._boardReadAt ? Math.floor((Date.now() - this._boardReadAt) / 60000) : 0;
    return toAmount(item.minutes_in_prep) + elapsed;
  }

  /** Arrived while this screen was already showing the board. */
  isNew(ticket: IKdsTicket): boolean {
    const at = this._newAt.get(ticket.order_id);
    return at != null && Date.now() - at < NEW_BADGE_MS;
  }

  /** The station view hides other stations' lines; this is how many. */
  otherStationCount(ticket: IKdsTicket): number {
    return this.activeStation ? toAmount(ticket.other_station_outstanding) : 0;
  }

  trackByOrderId(_index: number, ticket: IKdsTicket): number {
    return ticket.order_id;
  }

  trackByItemId(_index: number, item: IKdsItem): number {
    return item.id;
  }

  //// ------------------------------------------------------------------
  ////  Loading
  //// ------------------------------------------------------------------

  /**
   * The board + its station badges, in one read.
   *
   * Both callers share this deliberately. `load()` and `poll()` are the same
   * question asked with a different sense of urgency, and duplicating the
   * query here would let them drift -- at which point the tab badges describe
   * a different board than the one on screen, which is worse than either.
   */
  private readBoard() {
    return forkJoin({
      board: this._kdsService.getTickets({
        station: this.activeStation,
        order_by: this.orderBy,
        include_ready: this.includeReady
      }),
      stations: this._kdsService.getStationSummary()
    });
  }

  /**
   * First paint. Blocking, and loud on failure: a chef staring at an empty
   * board has no way to tell "no orders" from "the screen is broken".
   */
  private load(): void {
    this.isPageLoad = true;
    const generation = ++this._boardGeneration;
    // A manual reload (station toggle) starts a fresh board, so nothing on it
    // is "new" and the chime must not fire for the whole station.
    this._knownTickets.clear();
    this._newAt.clear();
    this._hasPainted = false;
    this._refreshQueued = false;

    this.readBoard()
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: ({ board, stations }) => {
          // A newer load (another station tap) already owns the screen.
          if (generation !== this._boardGeneration) return;
          if (!board?.status || !stations?.status) {
            this.pollFailures++;
            this._snackbar.openSnackBar(
              board?.message || stations?.message || 'Failed to load the kitchen board',
              'error'
            );
            return;
          }
          this.pollFailures = 0;
          this.adoptBoard(board.data as IKdsBoard);
          this.adoptStations((stations.data?.stations ?? []) as IKdsStationSummary[]);
        },
        error: (err) => {
          if (generation !== this._boardGeneration) return;
          this.pollFailures++;
          this.fail(err, 'Could not load the kitchen board');
        }
      });
  }

  /**
   * Background refresh. Silent on failure: the next tick is seconds away, and a
   * board that toasts an error every 5 seconds trains the kitchen to ignore
   * every toast on it. Repeated failures are surfaced through `isStale`
   * instead, which is visible without being loud.
   */
  private poll(): void {
    // A read is already in flight. Queue one rather than dropping it: the
    // caller is usually a write that needs to see its own result.
    if (this.isBusy) {
      this._refreshQueued = true;
      return;
    }
    this.isBusy = true;
    const generation = this._boardGeneration;
    this.readBoard()
      .pipe(finalize(() => {
        this.isBusy = false;
        if (this._refreshQueued) {
          this._refreshQueued = false;
          this.poll();
        }
      }))
      .subscribe({
        next: ({ board, stations }) => {
          // The station changed while this read was in flight; the board it
          // describes is not the one on screen.
          if (generation !== this._boardGeneration) return;
          this.pollFailures = 0;
          if (board?.status) this.adoptBoard(board.data as IKdsBoard);
          if (stations?.status) this.adoptStations((stations.data?.stations ?? []) as IKdsStationSummary[]);
        },
        error: () => {
          if (generation !== this._boardGeneration) return;
          this.pollFailures++; /* retried on the next tick */
        }
      });
  }

  private adoptStations(stations: IKdsStationSummary[]): void {
    this.stations = stations;
    // A remembered station can outlive the enum row it names. Clearing it is
    // better than filtering the board to a station that no longer has a tab.
    if (this.activeStation && !stations.some(s => s.station === this.activeStation)) {
      this.activeStation = null;
      this.persistPreferences();
    }
  }

  private adoptBoard(board: IKdsBoard): void {
    const tickets = board?.tickets ?? [];
    const now = Date.now();

    const arrivals = this._hasPainted
      ? tickets.filter(t => !this._knownTickets.has(t.order_id)).map(t => t.order_id)
      : [];

    this._knownTickets = new Set(tickets.map(t => t.order_id));
    for (const id of arrivals) this._newAt.set(id, now);
    // Drop flags for tickets that left the board so the map cannot grow all day.
    for (const id of Array.from(this._newAt.keys())) {
      if (!this._knownTickets.has(id)) this._newAt.delete(id);
    }
    if (arrivals.length > 0) this.chime();

    this._hasPainted = true;
    this._boardReadAt = now;

    this.tickets = tickets;
    this.serverTime = board?.server_time ?? '';
    if (board?.summary) this.summary = board.summary;
  }

  /** Manual refresh. The 10s poll is the safety net; this is for right now. */
  refreshNow(): void {
    this.poll();
  }

  /** Oldest-first is the kitchen order; newest-first answers "what just came in?". */
  toggleSort(): void {
    this.orderBy = this.orderBy === 'oldest_first' ? 'newest_first' : 'oldest_first';
    this.persistPreferences();
    this.dismissUndo();
    this.load();
  }

  onStationChange(station: Station | null): void {
    if (station === this.activeStation) return;
    this.activeStation = station;
    this.persistPreferences();
    // A station change invalidates every ticket id on screen.
    this._pendingLines.clear();
    this._pendingBumps.clear();
    this.dismissUndo();
    this.load();
  }

  /**
   * Plated lines are hidden by default so the board only shows what still needs
   * hands on it. Turning them on is how a head chef checks a plate went out, or
   * requeues a line that went cold.
   */
  onToggleIncludeReady(includeReady: boolean): void {
    this.includeReady = includeReady;
    this.persistPreferences();
    this._pendingLines.clear();
    this._pendingBumps.clear();
    this.dismissUndo();
    this.load();
  }

  //// ------------------------------------------------------------------
  ////  Line actions
  //// ------------------------------------------------------------------

  onStart(item: IKdsItem): void {
    this.setPrep(item, 'preparing');
  }

  onReady(item: IKdsItem): void {
    // pending -> ready is legal in one tap. Most KDS screens work as
    // "tap when it leaves the pass", and forcing a tap-to-start first
    // doubles the taps on every single dish.
    this.setPrep(item, 'ready');
  }

  /** Requeue a plated line. Restarts its timers server-side. */
  onRequeue(item: IKdsItem): void {
    this.setPrep(item, 'pending');
  }

  /**
   * The only write path for a line's kitchen state.
   *
   * `status` is typed `SettablePrepStatus`, so 'voided' is not a value this
   * method can be called with. That matters because the model file and the API
   * both list 'voided' as a real `PrepStatus` — without the narrowing, a
   * template-driven loop would happily send it and the server would reject
   * every one of those taps.
   */
  private setPrep(item: IKdsItem, status: SettablePrepStatus): void {
    if (this._pendingLines.has(item.id)) return;

    this._pendingLines.add(item.id);

    this._kdsService.updatePrepStatus(item.order_id, item.id, status)
      .pipe(finalize(() => this._pendingLines.delete(item.id)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            // Re-read rather than patching: the same write also advances the
            // ORDER header (preparing -> ready), so a local edit would leave
            // the till showing a stale order status.
            this.poll();
          } else {
            this._snackbar.openSnackBar(res?.message || `Could not update ${item.item_name}`, 'error');
          }
        },
        error: (err) => this.fail(err, `Could not update ${item.item_name}`)
      });
  }

  //// ------------------------------------------------------------------
  ////  Ticket actions
  //// ------------------------------------------------------------------

  /**
   * "Bump all" plates every remaining line on the ticket at the current
   * station with no per-line review, so it is confirmed -- unlike every
   * single-line tap. The bump response carries the line ids, which buys the
   * board a short undo window.
   */
  async onBumpAll(ticket: IKdsTicket): Promise<void> {
    if (this._pendingBumps.has(ticket.order_id)) return;

    const pendingCount = this.countOutstanding(ticket);
    const stationText = this.activeStation ? ` on ${this.labelForStation(this.activeStation)}` : '';

    const answer = await this._confirm.confirm(
      'Bump the whole ticket?',
      `Mark all ${pendingCount} outstanding item(s) ready${stationText} on ${ticket.order_number}? You will have 10 seconds to undo.`,
      'Yes, bump all'
    );
    if (!answer.isConfirmed) return;

    this._pendingBumps.add(ticket.order_id);

    this._kdsService.bumpOrder(ticket.order_id, this.activeStation)
      .pipe(finalize(() => this._pendingBumps.delete(ticket.order_id)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.offerUndo(ticket, res.data);
            this._snackbar.openSnackBar(res.message || 'Ticket bumped', 'success');
            this.poll();
          } else {
            this._snackbar.openSnackBar(res?.message || 'Could not bump the ticket', 'error');
          }
        },
        // 409 here means another station (or another screen) already finished
        // this pass — the state the chef wanted is already true.
        error: (err) => {
          if (err?.status === 409) {
            this.poll();
            this._snackbar.openSnackBar('Those items are already done', 'info');
            return;
          }
          this.fail(err, 'Could not bump the ticket');
        }
      });
  }

  /** Lines on this ticket that are not plated and not voided. */
  countOutstanding(ticket: IKdsTicket): number {
    return ticket.items.filter(i => i.prep_status === 'pending' || i.prep_status === 'preparing').length;
  }

  /**
   * Only the last bump is undoable, and only for a few seconds. Keeping a
   * history would imply every bump can be reversed long after the pass has
   * moved on, which is not what the kitchen wants.
   */
  private offerUndo(ticket: IKdsTicket, data: unknown): void {
    const ids = ((data ?? {}) as { bumped_item_ids?: number[] }).bumped_item_ids ?? [];
    if (ids.length === 0) return;

    this.lastBump = {
      orderId: ticket.order_id,
      orderNumber: ticket.order_number,
      referenceLabel: ticket.reference_label,
      itemIds: ids
    };

    if (this._undoTimer) clearTimeout(this._undoTimer);
    this._undoTimer = setTimeout(() => this.dismissUndo(), UNDO_WINDOW_MS);
  }

  undoLastBump(): void {
    const bump = this.lastBump;
    if (!bump || this.isUndoingBump) return;

    this.isUndoingBump = true;
    this._kdsService.undoBump(bump.orderId, bump.itemIds)
      .pipe(finalize(() => this.isUndoingBump = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.dismissUndo();
            this._snackbar.openSnackBar(res.message || 'Bump undone', 'success');
            this.poll();
          } else {
            this._snackbar.openSnackBar(res?.message || 'Could not undo the bump', 'error');
          }
        },
        error: (err) => {
          // 409: another screen already re-bumped or the order moved on.
          if (err?.status === 409) {
            this.dismissUndo();
            this.poll();
            this._snackbar.openSnackBar('Those lines are no longer ready', 'info');
            return;
          }
          this.fail(err, 'Could not undo the bump');
        }
      });
  }

  dismissUndo(): void {
    if (this._undoTimer) {
      clearTimeout(this._undoTimer);
      this._undoTimer = null;
    }
    this.lastBump = null;
  }

  //// ------------------------------------------------------------------
  ////  Template helpers
  //// ------------------------------------------------------------------

  /**
   * `station` is nullable on the way out: an order line added before the recipe
   * had a station comes back as null and the server buckets it under
   * "unassigned". Falling back to the raw value keeps such a tab readable
   * instead of blank.
   */
  labelForStation(station: Station | null | undefined): string {
    if (!station) return 'Unassigned';
    return STATION_LABELS[station] ?? station;
  }

  prepLabel(status?: PrepStatus): string {
    return status ? (PREP_STATUS_LABELS[status] ?? status) : 'Unknown';
  }

  /**
   * Wait colour. The band boundaries are the whole point of the badge -- a
   * chef triages on amber vs red long before they read the number -- so the
   * class is derived once here rather than in three separate ngClass bindings.
   */
  waitClass(minutes: number): 'wait-ok' | 'wait-warn' | 'wait-late' {
    const wait = toAmount(minutes);
    if (wait >= WAIT_LATE_MINUTES) return 'wait-late';
    if (wait >= WAIT_WARN_MINUTES) return 'wait-warn';
    return 'wait-ok';
  }

  /** Spice is shouted to the pass in words, not degrees, so it reads as text. */
  spiceLabel(spice?: string | null): string {
    return spice ? spice.replace(/_/g, ' ') : '';
  }

  orderTypeLabel(orderType: string): string {
    const labels: Record<string, string> = {
      dine_in: 'Dine-in',
      takeaway: 'Takeaway',
      delivery: 'Delivery'
    };
    return labels[orderType] ?? orderType;
  }

  /**
   * Modifiers arrive as an arbitrary key/value map (add-ons, sides, allergy
   * flags from the till). They are shown as chips because a modifier the chef
   * does not see is a dish sent back.
   */
  modifierChips(item: IKdsItem): string[] {
    if (!item.modifiers) return [];
    return Object.entries(item.modifiers)
      .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false)
      .map(([key, value]) => value === true ? key : `${key}: ${value}`);
  }

  private fail(err: any, fallback: string): void {
    this._snackbar.openSnackBar(err?.error?.message || fallback, 'error');
  }
}