'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createTask, listTasks, setTaskDone, type Task } from '@/lib/tasks';

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTasks()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const task = await createTask({ name: name.trim(), tag: tag.trim(), date: date || null });
      setTasks((prev) => [task, ...prev]);
      setName('');
      setTag('');
      setDate('');
    } catch (e) {
      setError((e as Error).message);
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
    }
  }

  return (
    <div>
      <h1 className="page-title">Tasks</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="add-form__name"
          placeholder="Add a task…"
          autoFocus
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
        <button type="submit" className="add-form__submit">
          Add
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : tasks.length === 0 ? (
        <p className="list-empty">No tasks yet — add one above.</p>
      ) : (
        <div className="list">
          {tasks.map((task) => (
            <label key={task.id} className={`item${task.done ? ' is-done' : ''}`}>
              <input type="checkbox" checked={task.done} onChange={() => handleToggle(task)} />
              <span className="item__name">{task.name}</span>
              {task.tag && <span className="item__tag">{task.tag}</span>}
              {task.date && <span className="item__date">{task.date}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
