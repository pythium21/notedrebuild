'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarTab } from '@/components/CalendarTab';
import { RecurringDetailPanel } from '@/components/RecurringDetailPanel';
import { RecurringItemRow } from '@/components/RecurringItemRow';
import {
  listFlaggedActions,
  listUpcomingActions,
  setActionCompleted,
  setActionFlaggedToday,
  type FlaggedAction,
  type UpcomingAction,
} from '@/lib/actions';
import { listFlaggedTasks, listUpcomingTasks, setTaskDone, setTaskFlaggedToday, type Task } from '@/lib/tasks';
import { listUpcomingProjects, type Project } from '@/lib/projects';
import { getIncompleteDailyItems, getStreak, setCompletedToday, type ChecklistItemToday } from '@/lib/checklist';
import { getEntryConfigsForItems, type EntryConfigWithLabels } from '@/lib/entryConfig';
import { getEntryCount, periodRangeForFrequency } from '@/lib/recurringEntries';

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

type UpcomingItem =
  | { kind: 'task'; date: string; task: Task }
  | { kind: 'action'; date: string; action: UpcomingAction }
  | { kind: 'project'; date: string; project: Project };

function buildUpcoming(tasks: Task[], actions: UpcomingAction[], projects: Project[]): UpcomingItem[] {
  const items: UpcomingItem[] = [
    ...tasks.filter((t): t is Task & { date: string } => !!t.date).map((task) => ({ kind: 'task' as const, date: task.date, task })),
    ...actions
      .filter((a): a is UpcomingAction & { due_date: string } => !!a.due_date)
      .map((action) => ({ kind: 'action' as const, date: action.due_date, action })),
    ...projects
      .filter((p): p is Project & { due_date: string } => !!p.due_date)
      .map((project) => ({ kind: 'project' as const, date: project.due_date, project })),
  ];
  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

function formatUpcomingDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type TodayTab = 'today' | 'calendar';

export default function TodayPage() {
  const [activeTab, setActiveTab] = useState<TodayTab>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actions, setActions] = useState<FlaggedAction[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [upcomingActions, setUpcomingActions] = useState<UpcomingAction[]>([]);
  const [upcomingProjects, setUpcomingProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dailyItems, setDailyItems] = useState<ChecklistItemToday[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyEntryConfigs, setDailyEntryConfigs] = useState<Record<string, EntryConfigWithLabels>>({});
  const [dailyEntryCounts, setDailyEntryCounts] = useState<Record<string, number>>({});
  const [dailyStreaks, setDailyStreaks] = useState<Record<string, string>>({});
  // Holds the item object itself, not just an id — getIncompleteDailyItems()
  // drops an item from `dailyItems` the moment it's completed (unlike
  // RecurringItems.tsx's list, which shows all due items regardless of
  // completion), so looking the id back up in `dailyItems` after a reload
  // triggered by logging the completing entry could momentarily resolve to
  // undefined. Keeping the snapshot instead is safe since the panel only
  // reads item.id/frequency/title, none of which change from logging.
  const [dailyDetailItem, setDailyDetailItem] = useState<ChecklistItemToday | null>(null);

  useEffect(() => {
    Promise.all([
      listFlaggedTasks(),
      listFlaggedActions(),
      listUpcomingTasks(),
      listUpcomingActions(),
      listUpcomingProjects(),
    ])
      .then(([t, a, ut, ua, up]) => {
        setTasks(t);
        setActions(a);
        setUpcomingTasks(ut);
        setUpcomingActions(ua);
        setUpcomingProjects(up);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function reloadDaily() {
    return getIncompleteDailyItems()
      .then(setDailyItems)
      .catch((e) => setError((e as Error).message));
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
      .catch((e) => setError((e as Error).message));

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

  async function handleCompleteDaily(item: ChecklistItemToday) {
    setDailyItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await setCompletedToday(item.id, true);
    } catch (e) {
      setDailyItems((prev) => [...prev, item]);
      setError((e as Error).message);
    }
  }

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
  const nothingFlagged = tasks.length === 0 && actions.length === 0;
  const upcoming = buildUpcoming(upcomingTasks, upcomingActions, upcomingProjects);

  return (
    <div>
      <h1 className="page-title">Today</h1>

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

          {loading ? null : (
            <div className="today-view">
              {nothingFlagged ? (
                <p className="list-empty">
                  Nothing flagged for today — flag a task from Tasks, or an action from a project, to see it here.
                </p>
              ) : (
                <>
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
                </>
              )}

              {!dailyLoading && (
                <section className="today-section">
                  <h2 className="today-section__title today-section__title--secondary">Daily habits</h2>
                  {dailyItems.length === 0 ? (
                    <p className="list-empty">All habits complete</p>
                  ) : (
                    <div className="list">
                      {dailyItems.map((item) => (
                        <RecurringItemRow
                          key={item.id}
                          item={item}
                          config={dailyEntryConfigs[item.id]}
                          count={dailyEntryCounts[item.id]}
                          progressText={dailyStreaks[item.id]}
                          onClick={
                            dailyEntryConfigs[item.id] ? () => setDailyDetailItem(item) : undefined
                          }
                          actions={
                            !dailyEntryConfigs[item.id] ? (
                              <button
                                type="button"
                                className="complete-circle"
                                onClick={() => handleCompleteDaily(item)}
                                title="Complete"
                                aria-label={`Complete ${item.title}`}
                              >
                                ✓
                              </button>
                            ) : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {upcoming.length > 0 && (
                <section className="today-section today-section--upcoming">
                  <h2 className="today-section__title">Upcoming</h2>
                  <div className="list">
                    {upcoming.map((item) => {
                      if (item.kind === 'task') {
                        return (
                          <div key={`task-${item.task.id}`} className="item today-item">
                            <span className="item__name">{item.task.name}</span>
                            <span className="item__tag">Task</span>
                            <span className="item__date">{formatUpcomingDate(item.date)}</span>
                          </div>
                        );
                      }
                      if (item.kind === 'action') {
                        return (
                          <Link
                            key={`action-${item.action.id}`}
                            href={`/projects/${item.action.project_id}`}
                            className="item today-item"
                          >
                            <span className="item__name">{item.action.title}</span>
                            <span className="item__tag">{item.action.project?.name || 'Project'}</span>
                            <span className="item__date">{formatUpcomingDate(item.date)}</span>
                          </Link>
                        );
                      }
                      return (
                        <Link
                          key={`project-${item.project.id}`}
                          href={`/projects/${item.project.id}`}
                          className="item today-item"
                        >
                          <span className="item__name">{item.project.name}</span>
                          <span className="item__tag">Project</span>
                          <span className="item__date">{formatUpcomingDate(item.date)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}

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
    </div>
  );
}
