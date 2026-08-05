'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listFlaggedActions, setActionCompleted, setActionFlaggedToday, type FlaggedAction } from '@/lib/actions';
import { listFlaggedTasks, setTaskDone, setTaskFlaggedToday, type Task } from '@/lib/tasks';

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

export default function TodayPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actions, setActions] = useState<FlaggedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listFlaggedTasks(), listFlaggedActions()])
      .then(([t, a]) => {
        setTasks(t);
        setActions(a);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCompleteTask(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await Promise.all([setTaskDone(task.id, true), setTaskFlaggedToday(task.id, false)]);
    } catch (e) {
      setTasks((prev) => [task, ...prev]);
      setError((e as Error).message);
    }
  }

  async function handleCompleteAction(action: FlaggedAction) {
    setActions((prev) => prev.filter((a) => a.id !== action.id));
    try {
      await Promise.all([setActionCompleted(action.id, true), setActionFlaggedToday(action.id, false)]);
    } catch (e) {
      setActions((prev) => [action, ...prev]);
      setError((e as Error).message);
    }
  }

  const actionGroups = groupByProject(actions);

  return (
    <div>
      <h1 className="page-title">Today</h1>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : tasks.length === 0 && actions.length === 0 ? (
        <p className="list-empty">
          Nothing flagged for today — flag a task from Tasks, or an action from a project, to see it here.
        </p>
      ) : (
        <div className="today-view">
          {tasks.length > 0 && (
            <section className="today-section">
              <h2 className="today-section__title">Tasks</h2>
              <div className="list">
                {tasks.map((task) => (
                  <label key={task.id} className="item today-item">
                    <input type="checkbox" onChange={() => handleCompleteTask(task)} />
                    <span className="item__name">{task.name}</span>
                    {task.tag && <span className="item__tag">{task.tag}</span>}
                  </label>
                ))}
              </div>
            </section>
          )}

          {actionGroups.map((group) => (
            <section key={group.projectId} className="today-section">
              <h2 className="today-section__title">
                <Link href={`/projects/${group.projectId}`}>{group.projectName}</Link>
              </h2>
              <div className="list">
                {group.items.map((action) => (
                  <label key={action.id} className="item today-item">
                    <input type="checkbox" onChange={() => handleCompleteAction(action)} />
                    <span className="item__name">{action.title}</span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
