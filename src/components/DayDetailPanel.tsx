'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { BreadcrumbMenu } from '@/components/BreadcrumbMenu';
import { createEvent, deleteEvent, type CalendarEvent } from '@/lib/events';
import type { Task } from '@/lib/tasks';

function formatHeading(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatEventTime(event: CalendarEvent): string {
  if (event.all_day) return 'All day';
  const start = new Date(event.start_time).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!event.end_time) return start;
  const end = new Date(event.end_time).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

export function DayDetailPanel({
  date,
  events,
  tasks,
  onClose,
  onEventCreated,
  onEventDeleted,
}: {
  date: string;
  events: CalendarEvent[];
  tasks: Task[];
  onClose: () => void;
  onEventCreated: (event: CalendarEvent) => void;
  onEventDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(date);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (isAdding) return;
    if (!title.trim() || !startDate || (!allDay && !startTime)) return;
    setError(null);
    setIsAdding(true);
    try {
      const start = new Date(`${startDate}T${allDay ? '00:00' : startTime}`);
      const end = !allDay && endTime ? new Date(`${startDate}T${endTime}`) : null;
      const created = await createEvent({
        title: title.trim(),
        start_time: start.toISOString(),
        end_time: end ? end.toISOString() : null,
        all_day: allDay,
        location: location.trim() || null,
        description: description.trim() || null,
      });
      onEventCreated(created);
      setTitle('');
      setStartTime('');
      setEndTime('');
      setAllDay(false);
      setLocation('');
      setDescription('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDelete(event: CalendarEvent) {
    if (deletingId) return;
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    setError(null);
    setDeletingId(event.id);
    try {
      await deleteEvent(event.id);
      onEventDeleted(event.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <BreadcrumbMenu onClose={onClose}>
      <div className="day-detail">
        <h3 className="day-detail__heading">{formatHeading(date)}</h3>

        {error && <p className="auth-error">{error}</p>}

        {events.length === 0 && tasks.length === 0 ? (
          <p className="day-detail__empty">Nothing scheduled.</p>
        ) : (
          <>
            {events.length > 0 && (
              <div className="list">
                {events.map((event) => (
                  <div key={event.id} className="item">
                    <span className="item__text">
                      <span className="item__name">{event.title}</span>
                      <span className="item__progress">
                        {formatEventTime(event)}
                        {event.location ? ` · ${event.location}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="item__action item__action--danger"
                      onClick={() => handleDelete(event)}
                      disabled={deletingId === event.id}
                    >
                      {deletingId === event.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tasks.length > 0 && (
              <div className="list">
                {tasks.map((task) => (
                  <Link key={task.id} href="/tasks" className="item today-item">
                    <span className="item__name">{task.name}</span>
                    <span className="item__tag">Task due</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        <form className="day-detail-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Add an event…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="day-detail-form__toggle">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          {!allDay && (
            <>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="Start time"
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="End time (optional)"
                placeholder="End time"
              />
            </>
          )}
          <input
            type="text"
            placeholder="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="submit"
            className="add-form__submit"
            disabled={isAdding || !title.trim() || !startDate || (!allDay && !startTime)}
          >
            {isAdding ? 'Adding…' : 'Add event'}
          </button>
        </form>
      </div>
    </BreadcrumbMenu>
  );
}
