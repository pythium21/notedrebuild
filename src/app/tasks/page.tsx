'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getActionByLinkedTaskId, setActionCompleted } from '@/lib/actions';
import { RecurringItems } from '@/components/RecurringItems';
import {
  createTask,
  deleteTask,
  listTasks,
  setTaskDone,
  setTaskFlaggedToday,
  updateTask,
  type Task,
} from '@/lib/tasks';

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type TasksTab = 'tasks' | 'recurring';

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<TasksTab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editDate, setEditDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    listTasks()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const task = await createTask({ name: name.trim(), tag: tag.trim(), date: date || null });
      setTasks((prev) => [task, ...prev]);
      setName('');
      setTag('');
      setDate('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggle(task: Task) {
    const next = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: next } : t)));
    try {
      await setTaskDone(task.id, next);
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)));
      setError((e as Error).message);
      return;
    }

    if (next) {
      try {
        const linkedAction = await getActionByLinkedTaskId(task.id);
        if (linkedAction && !linkedAction.completed) {
          if (window.confirm(`Also mark the linked action "${linkedAction.title}" complete?`)) {
            await setActionCompleted(linkedAction.id, true);
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  async function handleToggleFlag(task: Task) {
    const next = !task.flagged_today;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, flagged_today: next } : t)));
    try {
      await setTaskFlaggedToday(task.id, next);
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, flagged_today: task.flagged_today } : t)));
      setError((e as Error).message);
    }
  }

  function handleEditStart(task: Task) {
    setEditingId(task.id);
    setEditName(task.name);
    setEditTag(task.tag || '');
    setEditDate(task.date || '');
  }

  function handleEditCancel() {
    setEditingId(null);
  }

  async function handleEditSave(e: FormEvent, task: Task) {
    e.preventDefault();
    if (!editName.trim() || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const updated = await updateTask(task.id, {
        name: editName.trim(),
        tag: editTag.trim(),
        date: editDate || null,
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      setEditingId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(task: Task) {
    if (deletingId) return;
    if (!window.confirm(`Delete "${task.name}"?`)) return;
    setError(null);
    setDeletingId(task.id);
    try {
      await deleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleToggleExpand(taskId: string) {
    setExpandedId((prev) => (prev === taskId ? null : taskId));
  }

  return (
    <div>
      <h1 className="page-title">Tasks</h1>

      <div className="today-tabs" role="group" aria-label="Tasks view">
        <button
          type="button"
          className={`chip${activeTab === 'tasks' ? ' is-selected' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks
        </button>
        <button
          type="button"
          className={`chip${activeTab === 'recurring' ? ' is-selected' : ''}`}
          onClick={() => setActiveTab('recurring')}
        >
          Recurring
        </button>
      </div>

      {activeTab === 'recurring' ? (
        <RecurringItems />
      ) : (
        <>
          <form className="add-form" onSubmit={handleAdd}>
            <input
              type="text"
              className="add-form__name"
              placeholder="Add a task…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Tag (optional)"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="submit" className="add-form__submit" disabled={isAdding}>
              {isAdding ? 'Adding…' : 'Add'}
            </button>
          </form>

          {error && <p className="auth-error">{error}</p>}

          {loading ? null : tasks.length === 0 ? (
            <p className="list-empty">No tasks yet — add one above.</p>
          ) : (
            <div className="list">
              <div className="task-grid-header" aria-hidden="true">
                <span>Task</span>
                <span>Tag</span>
                <span>Date</span>
                <span>Created</span>
                <span>Actions</span>
              </div>
              {tasks.map((task) =>
                editingId === task.id ? (
                  <form
                    key={task.id}
                    className="item item-edit-form"
                    onSubmit={(e) => handleEditSave(e, task)}
                  >
                    <input
                      type="text"
                      className="item-edit-form__name"
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Tag (optional)"
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value)}
                    />
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                    <button type="submit" className="item-edit-form__save" disabled={isSaving}>
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="item-edit-form__cancel"
                      onClick={handleEditCancel}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div key={task.id}>
                    <div
                      className={`item item--task${task.done ? ' is-done' : ''}${expandedId === task.id ? ' is-expanded' : ''}`}
                      onClick={() => handleToggleExpand(task.id)}
                    >
                      <label className="item__main">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => handleToggle(task)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="item__name">{task.name}</span>
                      </label>
                      <div className="item__meta">
                        <span className={`item__tag${task.tag ? '' : ' item__tag--empty'}`}>
                          {task.tag || '–'}
                        </span>
                        <span className="item__date">{task.date || '–'}</span>
                        <span className="item__created">{formatRelativeTime(task.created_at)}</span>
                      </div>
                      <div className="item__actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`item__action item__action--flag${task.flagged_today ? ' is-flagged' : ''}`}
                          onClick={() => handleToggleFlag(task)}
                          title={task.flagged_today ? 'Remove from Today' : 'Flag for Today'}
                        >
                          🚩
                        </button>
                      </div>
                    </div>
                    <div className={`item-accordion${expandedId === task.id ? ' is-open' : ''}`}>
                      <div className="item-accordion__body">
                        <div className="item-accordion__actions">
                          <button
                            type="button"
                            className="item__action"
                            onClick={() => handleEditStart(task)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="item__action item__action--danger"
                            onClick={() => handleDelete(task)}
                            disabled={deletingId === task.id}
                          >
                            {deletingId === task.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
