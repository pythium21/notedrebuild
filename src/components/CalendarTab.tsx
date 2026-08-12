'use client';

import { useEffect, useMemo, useState } from 'react';
import { listEventsInRange, type CalendarEvent } from '@/lib/events';
import { listTasksInRange, type Task } from '@/lib/tasks';

type CalendarView = 'month' | 'agenda';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function addDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

// Always 6 full weeks (42 days) so the grid height doesn't jump between
// months — Monday-first to match Recurring Items' weekday convention (D-018).
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = Monday
  const gridStart = addDays(monthStart, -firstWeekday);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

interface DayItems {
  events: CalendarEvent[];
  tasks: Task[];
}

// Grouped by the event's/task's LOCAL calendar day. Multi-day events aren't
// split across days in phase 1 — an event only appears on its start day.
function buildDayMap(events: CalendarEvent[], tasks: Task[]): Map<string, DayItems> {
  const map = new Map<string, DayItems>();
  function bucket(dateStr: string): DayItems {
    let entry = map.get(dateStr);
    if (!entry) {
      entry = { events: [], tasks: [] };
      map.set(dateStr, entry);
    }
    return entry;
  }
  for (const event of events) {
    bucket(toDateString(new Date(event.start_time))).events.push(event);
  }
  for (const task of tasks) {
    if (task.date) bucket(task.date).tasks.push(task);
  }
  return map;
}

function formatDayHeading(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatEventTime(event: CalendarEvent): string {
  if (event.all_day) return 'All day';
  return new Date(event.start_time).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CalendarTab() {
  const [view, setView] = useState<CalendarView>('month');
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const gridDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const gridStart = gridDays[0];
  const gridEnd = gridDays[gridDays.length - 1];

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      listEventsInRange(gridStart.toISOString(), addDays(gridEnd, 1).toISOString()),
      listTasksInRange(toDateString(gridStart), toDateString(gridEnd)),
    ])
      .then(([e, t]) => {
        setEvents(e);
        setTasks(t);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonth]);

  const dayMap = useMemo(() => buildDayMap(events, tasks), [events, tasks]);
  const today = toDateString(new Date());

  const agendaDays = useMemo(
    () =>
      gridDays
        .map(toDateString)
        .filter((dateStr) => {
          const entry = dayMap.get(dateStr);
          return entry && (entry.events.length > 0 || entry.tasks.length > 0);
        }),
    [gridDays, dayMap],
  );

  return (
    <div className="calendar">
      <div className="calendar-header">
        <div className="calendar-month-nav">
          <button type="button" className="item__action" onClick={() => setVisibleMonth((m) => addMonths(m, -1))}>
            ‹
          </button>
          <span className="calendar-month-nav__label">
            {visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <button type="button" className="item__action" onClick={() => setVisibleMonth((m) => addMonths(m, 1))}>
            ›
          </button>
          <button type="button" className="item__action" onClick={() => setVisibleMonth(startOfMonth(new Date()))}>
            Today
          </button>
        </div>

        <div className="frequency-chips" role="group" aria-label="Calendar view">
          <button
            type="button"
            className={`chip${view === 'month' ? ' is-selected' : ''}`}
            onClick={() => setView('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={`chip${view === 'agenda' ? ' is-selected' : ''}`}
            onClick={() => setView('agenda')}
          >
            Agenda
          </button>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : view === 'month' ? (
        <div className="calendar-grid">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="calendar-weekday">
              {label}
            </div>
          ))}
          {gridDays.map((date) => {
            const dateStr = toDateString(date);
            const entry = dayMap.get(dateStr);
            const inMonth = date.getMonth() === visibleMonth.getMonth();
            return (
              <button
                type="button"
                key={dateStr}
                className={`calendar-day${inMonth ? '' : ' calendar-day--outside'}${dateStr === today ? ' calendar-day--today' : ''}${dateStr === selectedDate ? ' is-selected' : ''}`}
                onClick={() => setSelectedDate(dateStr)}
              >
                <span className="calendar-day__num">{date.getDate()}</span>
                {entry && entry.events.length > 0 && (
                  <span className="calendar-day__dots" aria-hidden="true">
                    {entry.events.slice(0, 3).map((e) => (
                      <span key={e.id} className="calendar-dot" />
                    ))}
                  </span>
                )}
                {entry && entry.tasks.length > 0 && (
                  <span className="calendar-day__due-count">{entry.tasks.length} due</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="calendar-agenda">
          {agendaDays.length === 0 ? (
            <p className="list-empty">Nothing scheduled this month.</p>
          ) : (
            agendaDays.map((dateStr) => {
              const entry = dayMap.get(dateStr)!;
              return (
                <section key={dateStr} className="agenda-day">
                  <button
                    type="button"
                    className={`agenda-day__header${dateStr === today ? ' agenda-day__header--today' : ''}`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    {formatDayHeading(dateStr)}
                  </button>
                  <div className="list">
                    {entry.events.map((event) => (
                      <div key={event.id} className="item">
                        <span className="item__name">{event.title}</span>
                        <span className="badge badge--event">{formatEventTime(event)}</span>
                      </div>
                    ))}
                    {entry.tasks.map((task) => (
                      <div key={task.id} className="item">
                        <span className="item__name">{task.name}</span>
                        <span className="item__tag">Task due</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
