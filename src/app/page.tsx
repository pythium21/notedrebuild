'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarTab } from '@/components/CalendarTab';
import { BreadcrumbMenu } from '@/components/BreadcrumbMenu';
import { RecurringDetailPanel } from '@/components/RecurringDetailPanel';
import {
  listFlaggedActions,
  listUpcomingActions,
  setActionCompleted,
  setActionFlaggedToday,
  type FlaggedAction,
  type UpcomingAction,
} from '@/lib/actions';
import {
  getOverdueTasks,
  getTasksForDateRange,
  getUndatedTasks,
  listFlaggedTasks,
  setTaskDone,
  setTaskFlaggedToday,
  type Task,
} from '@/lib/tasks';
import { getEventsForDateRange, type CalendarEvent } from '@/lib/events';
import { listUpcomingProjects, type Project } from '@/lib/projects';
import { getIncompleteDailyItems, getStreak, localToday, setCompletedToday, type ChecklistItemToday } from '@/lib/checklist';
import { getEntryConfigsForItems, type EntryConfigWithLabels } from '@/lib/entryConfig';
import { getEntryCount, periodRangeForFrequency } from '@/lib/recurringEntries';
import { toDisplayError, withAuthRetry } from '@/lib/errors';

// ---- Section order (DECISIONS.md D-024, 'undated' added by D-029) ----

type SectionKey = 'habits' | 'overdue' | 'today' | 'undated' | 'upcoming';

const DEFAULT_SECTION_ORDER: SectionKey[] = ['habits', 'overdue', 'today', 'undated', 'upcoming'];
const SECTION_LABELS: Record<SectionKey, string> = {
  habits: 'Daily habits',
  overdue: 'Overdue',
  today: 'Today',
  undated: 'No date',
  upcoming: 'Upcoming',
};
const SECTION_ORDER_STORAGE_KEY = 'today-section-order';

function loadStoredSectionOrder(): SectionKey[] {
  try {
    const raw = window.localStorage.getItem(SECTION_ORDER_STORAGE_KEY);
    if (!raw) return DEFAULT_SECTION_ORDER;
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_SECTION_ORDER.length &&
      DEFAULT_SECTION_ORDER.every((key) => parsed.includes(key))
    ) {
      return parsed as SectionKey[];
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_SECTION_ORDER;
}

// ---- Local-date helpers (avoid UTC-offset drift, matching checklist.ts's
// localToday()/parseLocalDate() convention) ----

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysStr(dateStr: string, delta: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + delta);
  return formatLocalDateStr(d);
}

function daysOverdue(dateStr: string): number {
  const due = parseLocalDate(dateStr).getTime();
  const today = parseLocalDate(localToday()).getTime();
  return Math.round((today - due) / (24 * 60 * 60 * 1000));
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Manual formatting (not toLocaleDateString) so the "Thu 28 Aug" shape from
// the spec is exact regardless of the viewer's locale ordering/punctuation.
function formatDayHeading(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

function formatEventTime(event: CalendarEvent): string {
  if (event.all_day) return 'All day';
  return new Date(event.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function groupByProject(actions: FlaggedAction[]): { projectId: string; projectName: string; items: FlaggedAction[] }[] {
  const groups = new Map<string, { projectId: string; projectName: string; items: FlaggedAction[] }>();
  for (const action of actions) {
    const existing = groups.get(action.project_id);
    if (existing) {
      existing.items.push(action);
    } else {
      groups.set(action.project_id, {
        projectId: action.project_id,
        projectName: action.project?.name || 'Untitled project',
        items: [action],
      });
    }
  }
  return Array.from(groups.values());
}

// ---- Today section: tasks (date = today OR flagged_today) + events (date = today) ----

type TodayRowItem = { kind: 'event'; event: CalendarEvent } | { kind: 'task'; task: Task };

function buildTodayRows(tasks: Task[], events: CalendarEvent[]): TodayRowItem[] {
  const sortedEvents = [...events].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const sortedTasks = [...tasks].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [
    ...sortedEvents.map((event) => ({ kind: 'event' as const, event })),
    ...sortedTasks.map((task) => ({ kind: 'task' as const, task })),
  ];
}

// ---- Upcoming section: next 7 days, grouped by day ----
// Tasks/events are strictly bounded to the 7-day window per spec. Actions
// and projects reuse the existing unbounded listUpcomingActions()/
// listUpcomingProjects() (DECISIONS.md D-013) so nothing that used to show
// on Today disappears — anything beyond the 7-day window lands in a
// trailing "Later" group instead of a dated day header.

type UpcomingRowItem =
  | { kind: 'event'; date: string; event: CalendarEvent }
  | { kind: 'task'; date: string; task: Task }
  | { kind: 'action'; date: string; action: UpcomingAction }
  | { kind: 'project'; date: string; project: Project };

function rankKind(kind: UpcomingRowItem['kind']): number {
  return kind === 'event' ? 0 : kind === 'task' ? 1 : kind === 'action' ? 2 : 3;
}

function sortDayItems(items: UpcomingRowItem[]): UpcomingRowItem[] {
  return [...items].sort((a, b) => {
    const diff = rankKind(a.kind) - rankKind(b.kind);
    if (diff !== 0) return diff;
    if (a.kind === 'event' && b.kind === 'event') return a.event.start_time.localeCompare(b.event.start_time);
    return 0;
  });
}

function buildUpcomingGroups(
  tasks: Task[],
  events: CalendarEvent[],
  actions: UpcomingAction[],
  projects: Project[],
  rangeStart: string,
  rangeEnd: string,
): { days: { date: string; items: UpcomingRowItem[] }[]; later: UpcomingRowItem[] } {
  const byDate = new Map<string, UpcomingRowItem[]>();
  function push(date: string, item: UpcomingRowItem) {
    const existing = byDate.get(date);
    if (existing) existing.push(item);
    else byDate.set(date, [item]);
  }

  for (const task of tasks) {
    if (task.date) push(task.date, { kind: 'task', date: task.date, task });
  }
  for (const event of events) {
    const date = formatLocalDateStr(new Date(event.start_time));
    push(date, { kind: 'event', date, event });
  }

  const later: UpcomingRowItem[] = [];
  for (const action of actions) {
    if (!action.due_date) continue;
    const item: UpcomingRowItem = { kind: 'action', date: action.due_date, action };
    if (action.due_date >= rangeStart && action.due_date <= rangeEnd) push(action.due_date, item);
    else if (action.due_date > rangeEnd) later.push(item);
  }
  for (const project of projects) {
    if (!project.due_date) continue;
    const item: UpcomingRowItem = { kind: 'project', date: project.due_date, project };
    if (project.due_date >= rangeStart && project.due_date <= rangeEnd) push(project.due_date, item);
    else if (project.due_date > rangeEnd) later.push(item);
  }

  const days = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items: sortDayItems(items) }));
  later.sort((a, b) => a.date.localeCompare(b.date));
  return { days, later };
}

function TodayRowView({
  item,
  onCompleteTask,
  isCompleting,
}: {
  item: TodayRowItem | UpcomingRowItem;
  onCompleteTask: (task: Task) => void;
  isCompleting: (id: string) => boolean;
}) {
  if (item.kind === 'event') {
    return (
      <div className="today-row">
        <span className="event-dot" aria-hidden="true">
          <span className="event-dot__inner" />
        </span>
        <span className="today-row__name">{item.event.title}</span>
        <span className="today-row__time">{formatEventTime(item.event)}</span>
      </div>
    );
  }
  if (item.kind === 'task') {
    const busy = isCompleting(item.task.id);
    return (
      <button
        type="button"
        className="today-row"
        onClick={() => onCompleteTask(item.task)}
        disabled={busy}
        aria-label={`Complete ${item.task.name}`}
      >
        <span className="check-box" aria-hidden="true" />
        <span className="today-row__name">{item.task.name}</span>
        {item.task.tag && <span className="today-row__meta">{item.task.tag}</span>}
      </button>
    );
  }
  if (item.kind === 'action') {
    return (
      <Link href={`/projects/${item.action.project_id}`} className="today-row">
        <span className="today-row__name">{item.action.title}</span>
        <span className="today-row__meta">{item.action.project?.name || 'Project'}</span>
      </Link>
    );
  }
  return (
    <Link href={`/projects/${item.project.id}`} className="today-row">
      <span className="today-row__name">{item.project.name}</span>
      <span className="today-row__meta">Project</span>
    </Link>
  );
}

function OverdueRowView({
  task,
  onComplete,
  busy,
}: {
  task: Task;
  onComplete: (task: Task) => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      className="today-row today-row--overdue"
      onClick={() => onComplete(task)}
      disabled={busy}
      aria-label={`Complete ${task.name}`}
    >
      <span className="check-box check-box--danger" aria-hidden="true" />
      <span className="today-row__name">{task.name}</span>
      {task.tag && <span className="today-row__meta">{task.tag}</span>}
      <span className="today-row__overdue">{daysOverdue(task.date!)}d overdue</span>
    </button>
  );
}

// ---- Daily habits: 4-column box grid with an SVG progress ring (DECISIONS.md D-024) ----
// checklist_items has no emoji column (SCHEMA.md) and this decision makes no
// schema changes, so each ring shows the habit's initial letter instead of
// the spec's literal "habit emoji" — the closest same-size substitute
// without a migration.

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 100.5; // 2 * PI * 16, rounded — matches the spec's dash-total literally

function HabitBox({
  item,
  config,
  count,
  onOpenDetail,
  onComplete,
  busy,
}: {
  item: ChecklistItemToday;
  config?: EntryConfigWithLabels;
  count?: number;
  onOpenDetail: () => void;
  onComplete: () => void;
  busy: boolean;
}) {
  const target = config ? config.target : 1;
  const progress = config ? count ?? 0 : item.completedToday ? 1 : 0;
  const pct = target > 0 ? Math.min(1, progress / target) : 0;
  const dash = pct * RING_CIRCUMFERENCE;
  const progressLabel = config ? `${count ?? 0}/${target}` : item.completedToday ? 'Done' : '';
  const initial = item.title.trim().charAt(0).toUpperCase() || '•';

  return (
    <button
      type="button"
      className={`habit-box${item.completedToday ? ' is-done' : ''}`}
      onClick={config ? onOpenDetail : onComplete}
      disabled={!config && busy}
      aria-label={`${item.title} — ${progressLabel || 'not started'}`}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" className="habit-box__ring" aria-hidden="true">
        <circle cx="20" cy="20" r={RING_RADIUS} className="habit-box__ring-track" />
        <circle
          cx="20"
          cy="20"
          r={RING_RADIUS}
          className="habit-box__ring-fill"
          strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
          transform="rotate(-90 20 20)"
        />
        <text x="20" y="21" textAnchor="middle" dominantBaseline="middle" className="habit-box__glyph">
          {initial}
        </text>
      </svg>
      <span className="habit-box__name">{item.title}</span>
      <span className="habit-box__progress">{progressLabel}</span>
    </button>
  );
}

// ---- Arrange overlay (DECISIONS.md D-024) ----

function ArrangePanel({
  order,
  onReorder,
  onClose,
}: {
  order: SectionKey[];
  onReorder: (order: SectionKey[]) => void;
  onClose: () => void;
}) {
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  }

  return (
    <BreadcrumbMenu onClose={onClose}>
      <div className="day-detail">
        <h3 className="day-detail__heading">Arrange sections</h3>
        <div className="list">
          {order.map((key, index) => (
            <div key={key} className="item">
              <span className="item__name">{SECTION_LABELS[key]}</span>
              <div className="item__actions">
                <button
                  type="button"
                  className="item__action"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${SECTION_LABELS[key]} up`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="item__action"
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${SECTION_LABELS[key]} down`}
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="add-form__submit arrange-panel__done" onClick={onClose}>
          Done
        </button>
      </div>
    </BreadcrumbMenu>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="section-header">
      <h2 className="section-header__label">{label}</h2>
      <span className="section-header__count">{count}</span>
    </div>
  );
}

type TodayTab = 'today' | 'calendar';

export default function TodayPage() {
  const [activeTab, setActiveTab] = useState<TodayTab>('today');

  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(DEFAULT_SECTION_ORDER);
  const [arrangeOpen, setArrangeOpen] = useState(false);

  useEffect(() => {
    setSectionOrder(loadStoredSectionOrder());
  }, []);

  function handleReorder(next: SectionKey[]) {
    setSectionOrder(next);
    try {
      window.localStorage.setItem(SECTION_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode, etc.) — order just won't persist
    }
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [undatedTasks, setUndatedTasks] = useState<Task[]>([]);

  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [todayFlaggedActions, setTodayFlaggedActions] = useState<FlaggedAction[]>([]);

  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [upcomingActions, setUpcomingActions] = useState<UpcomingAction[]>([]);
  const [upcomingProjects, setUpcomingProjects] = useState<Project[]>([]);

  const [dailyItems, setDailyItems] = useState<ChecklistItemToday[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyEntryConfigs, setDailyEntryConfigs] = useState<Record<string, EntryConfigWithLabels>>({});
  const [dailyEntryCounts, setDailyEntryCounts] = useState<Record<string, number>>({});
  const [dailyStreaks, setDailyStreaks] = useState<Record<string, string>>({});
  // Holds the item object itself, not just an id — getIncompleteDailyItems()
  // drops an item the instant it's completed, so looking the id back up in
  // dailyItems after a reload triggered by logging the completing entry
  // could momentarily resolve to undefined. The panel only reads
  // item.id/frequency/title, none of which change from logging.
  const [dailyDetailItem, setDailyDetailItem] = useState<ChecklistItemToday | null>(null);

  const today = localToday();
  const tomorrow = addDaysStr(today, 1);
  const weekEnd = addDaysStr(today, 7);

  function reloadToday() {
    return withAuthRetry(() =>
      Promise.all([
        getOverdueTasks(),
        getTasksForDateRange(today, today),
        listFlaggedTasks(),
        getUndatedTasks(),
        getEventsForDateRange(today, today),
        listFlaggedActions(),
        getTasksForDateRange(tomorrow, weekEnd),
        getEventsForDateRange(tomorrow, weekEnd),
        listUpcomingActions(),
        listUpcomingProjects(),
      ]),
    )
      .then(([overdue, todayDated, flaggedTasks, undated, todayEvts, flaggedActions, upTasks, upEvents, upActions, upProjects]) => {
        setOverdueTasks(overdue);
        setUndatedTasks(undated);
        const todayTaskMap = new Map<string, Task>();
        for (const t of todayDated) todayTaskMap.set(t.id, t);
        for (const t of flaggedTasks) todayTaskMap.set(t.id, t);
        setTodayTasks(Array.from(todayTaskMap.values()));
        setTodayEvents(todayEvts);
        setTodayFlaggedActions(flaggedActions);
        setUpcomingTasks(upTasks);
        setUpcomingEvents(upEvents);
        setUpcomingActions(upActions);
        setUpcomingProjects(upProjects);
      })
      .catch((e) => setError(toDisplayError(e)));
  }

  useEffect(() => {
    reloadToday().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reloadDaily() {
    return withAuthRetry(() => getIncompleteDailyItems())
      .then(setDailyItems)
      .catch((e) => setError(toDisplayError(e)));
  }

  useEffect(() => {
    reloadDaily().finally(() => setDailyLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracking configs/counts + streak text for the incomplete daily items —
  // same batch pattern as RecurringItems.tsx's list view (DECISIONS.md D-023).
  useEffect(() => {
    if (dailyItems.length === 0) {
      setDailyEntryConfigs({});
      setDailyEntryCounts({});
      setDailyStreaks({});
      return;
    }
    let cancelled = false;
    getEntryConfigsForItems(dailyItems.map((i) => i.id))
      .then(async (configs) => {
        if (cancelled) return;
        setDailyEntryConfigs(configs);
        const counts: Record<string, number> = {};
        await Promise.all(
          Object.values(configs).map(async (config) => {
            const { start, end } = periodRangeForFrequency('daily');
            try {
              counts[config.checklist_item_id] = await getEntryCount(config.checklist_item_id, start, end);
            } catch {
              counts[config.checklist_item_id] = 0;
            }
          }),
        );
        if (!cancelled) setDailyEntryCounts(counts);
      })
      .catch((e) => setError(toDisplayError(e)));

    Promise.all(
      dailyItems.map(async (item): Promise<[string, string]> => {
        try {
          const streak = await getStreak(item.id);
          return [item.id, `${streak} day streak`];
        } catch {
          return [item.id, ''];
        }
      }),
    ).then((entries) => {
      if (!cancelled) setDailyStreaks(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [dailyItems]);

  function withCompleting(id: string, action: () => Promise<void>, rollback: () => void) {
    if (completingIds.has(id)) return;
    setCompletingIds((prev) => new Set(prev).add(id));
    action()
      .catch((e) => {
        rollback();
        setError(toDisplayError(e));
      })
      .finally(() => {
        setCompletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }

  function handleCompleteDaily(item: ChecklistItemToday) {
    setDailyItems((prev) => prev.filter((i) => i.id !== item.id));
    withCompleting(
      item.id,
      () => setCompletedToday(item.id, true),
      () => setDailyItems((prev) => [...prev, item]),
    );
  }

  function handleCompleteTask(task: Task) {
    setOverdueTasks((prev) => prev.filter((t) => t.id !== task.id));
    setUndatedTasks((prev) => prev.filter((t) => t.id !== task.id));
    setTodayTasks((prev) => prev.filter((t) => t.id !== task.id));
    setUpcomingTasks((prev) => prev.filter((t) => t.id !== task.id));
    withCompleting(
      task.id,
      () => Promise.all([setTaskDone(task.id, true), setTaskFlaggedToday(task.id, false)]).then(() => undefined),
      () => reloadToday(),
    );
  }

  function handleCompleteAction(action: FlaggedAction) {
    setTodayFlaggedActions((prev) => prev.filter((a) => a.id !== action.id));
    withCompleting(
      action.id,
      () =>
        Promise.all([setActionCompleted(action.id, true), setActionFlaggedToday(action.id, false)]).then(
          () => undefined,
        ),
      () => setTodayFlaggedActions((prev) => [...prev, action]),
    );
  }

  const todayRows = buildTodayRows(todayTasks, todayEvents);
  const todayActionGroups = groupByProject(todayFlaggedActions);
  const { days: upcomingDays, later: upcomingLater } = buildUpcomingGroups(
    upcomingTasks,
    upcomingEvents,
    upcomingActions,
    upcomingProjects,
    tomorrow,
    weekEnd,
  );

  const todayCount = todayRows.length + todayFlaggedActions.length;
  const upcomingCount = upcomingDays.reduce((sum, day) => sum + day.items.length, 0) + upcomingLater.length;

  function renderSection(key: SectionKey) {
    if (key === 'habits') {
      return (
        <section key={key} className="today-section">
          <SectionHeader label={SECTION_LABELS.habits} count={dailyItems.length} />
          {dailyLoading ? null : dailyItems.length === 0 ? (
            <p className="list-empty">All habits complete</p>
          ) : (
            <div className="habit-grid">
              {dailyItems.map((item) => (
                <HabitBox
                  key={item.id}
                  item={item}
                  config={dailyEntryConfigs[item.id]}
                  count={dailyEntryCounts[item.id]}
                  busy={completingIds.has(item.id)}
                  onOpenDetail={() => setDailyDetailItem(item)}
                  onComplete={() => handleCompleteDaily(item)}
                />
              ))}
            </div>
          )}
        </section>
      );
    }

    if (key === 'overdue') {
      if (overdueTasks.length === 0) return null;
      return (
        <section key={key} className="today-section">
          <SectionHeader label={SECTION_LABELS.overdue} count={overdueTasks.length} />
          <div className="list">
            {overdueTasks.map((task) => (
              <OverdueRowView
                key={task.id}
                task={task}
                onComplete={handleCompleteTask}
                busy={completingIds.has(task.id)}
              />
            ))}
          </div>
        </section>
      );
    }

    if (key === 'today') {
      if (todayCount === 0) return null;
      return (
        <section key={key} className="today-section">
          <SectionHeader label={SECTION_LABELS.today} count={todayCount} />
          {todayRows.length > 0 && (
            <div className="list">
              {todayRows.map((item) => (
                <TodayRowView
                  key={item.kind === 'event' ? `event-${item.event.id}` : `task-${item.task.id}`}
                  item={item}
                  onCompleteTask={handleCompleteTask}
                  isCompleting={(id) => completingIds.has(id)}
                />
              ))}
            </div>
          )}
          {todayActionGroups.map((group) => (
            <div key={group.projectId} className="today-subgroup">
              <Link href={`/projects/${group.projectId}`} className="today-subgroup__title">
                {group.projectName}
              </Link>
              <div className="list">
                {group.items.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="today-row"
                    onClick={() => handleCompleteAction(action)}
                    disabled={completingIds.has(action.id)}
                    aria-label={`Complete ${action.title}`}
                  >
                    <span className="check-box" aria-hidden="true" />
                    <span className="today-row__name">{action.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (key === 'undated') {
      if (undatedTasks.length === 0) return null;
      return (
        <section key={key} className="today-section">
          <SectionHeader label={SECTION_LABELS.undated} count={undatedTasks.length} />
          <div className="list">
            {undatedTasks.map((task) => (
              <TodayRowView
                key={`task-${task.id}`}
                item={{ kind: 'task', task }}
                onCompleteTask={handleCompleteTask}
                isCompleting={(id) => completingIds.has(id)}
              />
            ))}
          </div>
        </section>
      );
    }

    // upcoming
    if (upcomingCount === 0) return null;
    return (
      <section key={key} className="today-section">
        <SectionHeader label={SECTION_LABELS.upcoming} count={upcomingCount} />
        {upcomingDays.map((day) => (
          <div key={day.date} className="day-group">
            <h3 className="day-group__header">{formatDayHeading(day.date)}</h3>
            <div className="list">
              {day.items.map((item, i) => (
                <TodayRowView
                  key={i}
                  item={item}
                  onCompleteTask={handleCompleteTask}
                  isCompleting={(id) => completingIds.has(id)}
                />
              ))}
            </div>
          </div>
        ))}
        {upcomingLater.length > 0 && (
          <div className="day-group">
            <h3 className="day-group__header">Later</h3>
            <div className="list">
              {upcomingLater.map((item, i) => (
                <TodayRowView
                  key={i}
                  item={item}
                  onCompleteTask={handleCompleteTask}
                  isCompleting={(id) => completingIds.has(id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div>
      <h1 className="page-title">Today</h1>

      <div className="today-topbar">
        <p className="today-topbar__date">{formatDayHeading(today)}</p>
        {activeTab === 'today' && (
          <button type="button" className="chip today-topbar__arrange" onClick={() => setArrangeOpen(true)}>
            ⇅ Arrange
          </button>
        )}
      </div>

      <div className="today-tabs" role="group" aria-label="Today view">
        <button
          type="button"
          className={`chip${activeTab === 'today' ? ' is-selected' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          Today
        </button>
        <button
          type="button"
          className={`chip${activeTab === 'calendar' ? ' is-selected' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          Calendar
        </button>
      </div>

      {activeTab === 'calendar' ? (
        <CalendarTab />
      ) : (
        <>
          {error && <p className="auth-error">{error}</p>}

          {loading ? null : <div className="today-view">{sectionOrder.map(renderSection)}</div>}

          {dailyDetailItem && dailyEntryConfigs[dailyDetailItem.id] && (
            <RecurringDetailPanel
              item={dailyDetailItem}
              config={dailyEntryConfigs[dailyDetailItem.id]}
              streakOrRate={dailyStreaks[dailyDetailItem.id] || ''}
              onClose={() => setDailyDetailItem(null)}
              onChanged={reloadDaily}
            />
          )}
        </>
      )}

      {arrangeOpen && (
        <ArrangePanel order={sectionOrder} onReorder={handleReorder} onClose={() => setArrangeOpen(false)} />
      )}
    </div>
  );
}
