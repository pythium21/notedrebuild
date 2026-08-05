'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  convertActionToTask,
  createAction,
  listActionsForProject,
  setActionCompleted,
  setActionFlaggedToday,
  type Action,
} from '@/lib/actions';
import {
  computeProjectProgress,
  createProject,
  getProject,
  listChildProjects,
  updateProject,
  type Project,
  type ProjectPriority,
  type ProjectProgress,
  type ProjectStatus,
} from '@/lib/projects';

const STATUSES: ProjectStatus[] = ['active', 'on_hold', 'done', 'archived'];
const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  done: 'Done',
  archived: 'Archived',
};

const PRIORITIES: ProjectPriority[] = ['high', 'medium', 'low'];
const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

type SortBy = 'created_at' | 'title' | 'completed';
type FilterBy = 'all' | 'open' | 'completed';

function sortActions(actions: Action[], sortBy: SortBy): Action[] {
  const sorted = [...actions];
  if (sortBy === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'completed') {
    sorted.sort((a, b) => Number(a.completed) - Number(b.completed));
  } else {
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return sorted;
}

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [childProjects, setChildProjects] = useState<Project[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [progress, setProgress] = useState<ProjectProgress>({ completed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');

  const [newActionTitle, setNewActionTitle] = useState('');
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [newChildName, setNewChildName] = useState('');
  const [isAddingChild, setIsAddingChild] = useState(false);

  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');

  async function refreshProgress() {
    setProgress(await computeProjectProgress(projectId));
  }

  useEffect(() => {
    Promise.all([getProject(projectId), listChildProjects(projectId), listActionsForProject(projectId), computeProjectProgress(projectId)])
      .then(([p, children, projectActions, prog]) => {
        setProject(p);
        setChildProjects(children);
        setActions(projectActions);
        setProgress(prog);
        setDescription(p.description || '');
        setTagsText((p.tags || []).join(', '));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleFieldUpdate(input: Parameters<typeof updateProject>[1]) {
    if (!project) return;
    const prev = project;
    setProject({ ...project, ...input });
    try {
      const updated = await updateProject(project.id, input);
      setProject(updated);
    } catch (e) {
      setProject(prev);
      setError((e as Error).message);
    }
  }

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const name = e.target.value.trim();
    if (!name || name === project?.name) return;
    handleFieldUpdate({ name });
  }

  function handleDescriptionBlur() {
    if (description === (project?.description || '')) return;
    handleFieldUpdate({ description: description || null });
  }

  function handleDueDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFieldUpdate({ due_date: e.target.value || null });
  }

  function handleTagsBlur() {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    handleFieldUpdate({ tags: tags.length > 0 ? tags : null });
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as ProjectStatus | '';
    handleFieldUpdate({ status: value || null });
  }

  function handlePriorityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as ProjectPriority | '';
    handleFieldUpdate({ priority: value || null });
  }

  async function handleAddAction(e: FormEvent) {
    e.preventDefault();
    if (!newActionTitle.trim() || isAddingAction) return;
    setError(null);
    setIsAddingAction(true);
    try {
      const action = await createAction(projectId, newActionTitle.trim());
      setActions((prev) => [action, ...prev]);
      setNewActionTitle('');
      await refreshProgress();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAddingAction(false);
    }
  }

  async function handleToggleAction(action: Action) {
    const next = !action.completed;
    setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, completed: next } : a)));
    try {
      await setActionCompleted(action.id, next);
      await refreshProgress();
    } catch (e) {
      setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, completed: action.completed } : a)));
      setError((e as Error).message);
    }
  }

  async function handleToggleActionFlag(action: Action) {
    const next = !action.flagged_today;
    setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, flagged_today: next } : a)));
    try {
      await setActionFlaggedToday(action.id, next);
    } catch (e) {
      setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, flagged_today: action.flagged_today } : a)));
      setError((e as Error).message);
    }
  }

  async function handleConvertAction(action: Action) {
    if (convertingId) return;
    setError(null);
    setConvertingId(action.id);
    try {
      const { action: updated } = await convertActionToTask(action);
      setActions((prev) => prev.map((a) => (a.id === action.id ? updated : a)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConvertingId(null);
    }
  }

  async function handleAddChild(e: FormEvent) {
    e.preventDefault();
    if (!newChildName.trim() || isAddingChild) return;
    setError(null);
    setIsAddingChild(true);
    try {
      const child = await createProject({ name: newChildName.trim(), parent_id: projectId });
      setChildProjects((prev) => [child, ...prev]);
      setNewChildName('');
      await refreshProgress();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAddingChild(false);
    }
  }

  if (loading) return null;
  if (error && !project) return <p className="auth-error">{error}</p>;
  if (!project) return null;

  const openActionsCount = actions.filter((a) => !a.completed).length;
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  const displayedActions = sortActions(
    actions.filter((a) => (filterBy === 'open' ? !a.completed : filterBy === 'completed' ? a.completed : true)),
    sortBy
  );

  return (
    <div className="project-detail">
      <Link href="/projects" className="project-detail__back">
        ← Projects
      </Link>

      {error && <p className="auth-error">{error}</p>}

      <input
        type="text"
        className="project-detail__name"
        defaultValue={project.name}
        onBlur={handleNameBlur}
      />

      <div className="project-detail__fields">
        <label className="project-detail__field">
          <span>Status</span>
          <select className="status-select" value={project.status || ''} onChange={handleStatusChange}>
            <option value="">unset</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="project-detail__field">
          <span>Priority</span>
          <select className="status-select" value={project.priority || ''} onChange={handlePriorityChange}>
            <option value="">unset</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="project-detail__field">
          <span>Due date</span>
          <input type="date" value={project.due_date || ''} onChange={handleDueDateChange} />
        </label>
      </div>

      {project.status === 'done' && openActionsCount > 0 && (
        <p className="project-detail__warning">{openActionsCount} action{openActionsCount === 1 ? '' : 's'} still open</p>
      )}

      <label className="project-detail__field project-detail__field--full">
        <span>Tags (comma-separated)</span>
        <input
          type="text"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          onBlur={handleTagsBlur}
          placeholder="e.g. work, urgent"
        />
      </label>

      <label className="project-detail__field project-detail__field--full">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
          rows={3}
        />
      </label>

      <div className="project-card__progress project-detail__progress">
        <div className="progress-bar">
          <div className="progress-bar__fill" style={{ width: `${pct ?? 0}%` }} />
        </div>
        <span className="progress-bar__label">
          {progress.total === 0 ? 'No actions yet' : `${progress.completed}/${progress.total} (${pct}%)`}
        </span>
      </div>

      {childProjects.length > 0 && (
        <div className="project-detail__section">
          <h2 className="project-detail__section-title">Sub-projects</h2>
          <div className="project-grid project-grid--nested">
            {childProjects.map((child) => (
              <Link key={child.id} href={`/projects/${child.id}`} className="project-card">
                <div className="project-card__title">{child.name}</div>
                <span
                  className={`badge${child.status ? ` badge--status-${child.status}` : ' badge--unset'}`}
                >
                  {child.status ? STATUS_LABELS[child.status] : 'unset'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <form className="add-form" onSubmit={handleAddChild}>
        <input
          type="text"
          className="add-form__name"
          placeholder="Add a sub-project…"
          value={newChildName}
          onChange={(e) => setNewChildName(e.target.value)}
        />
        <button type="submit" className="add-form__submit" disabled={isAddingChild}>
          {isAddingChild ? 'Adding…' : 'Add'}
        </button>
      </form>

      <div className="project-detail__section">
        <h2 className="project-detail__section-title">Actions</h2>

        <form className="add-form" onSubmit={handleAddAction}>
          <input
            type="text"
            className="add-form__name"
            placeholder="Add an action, press Enter…"
            value={newActionTitle}
            onChange={(e) => setNewActionTitle(e.target.value)}
          />
          <button type="submit" className="add-form__submit" disabled={isAddingAction}>
            {isAddingAction ? 'Adding…' : 'Add'}
          </button>
        </form>

        <div className="actions-controls">
          <label>
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="created_at">Created</option>
              <option value="title">Title</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            Filter
            <select value={filterBy} onChange={(e) => setFilterBy(e.target.value as FilterBy)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>

        {displayedActions.length === 0 ? (
          <p className="list-empty">No actions yet — add one above.</p>
        ) : (
          <div className="list">
            {displayedActions.map((action) => (
              <div key={action.id} className={`item${action.completed ? ' is-done' : ''}`}>
                <label className="item__main">
                  <input
                    type="checkbox"
                    checked={action.completed}
                    onChange={() => handleToggleAction(action)}
                  />
                  <span className="item__name">{action.title}</span>
                </label>
                <div className="item__actions">
                  <button
                    type="button"
                    className={`item__action item__action--flag${action.flagged_today ? ' is-flagged' : ''}`}
                    onClick={() => handleToggleActionFlag(action)}
                    title={action.flagged_today ? 'Remove from Today' : 'Flag for Today'}
                  >
                    🚩
                  </button>
                  {action.linked_task_id ? (
                    <span className="action-linked-indicator">🔗 linked to task</span>
                  ) : (
                    <button
                      type="button"
                      className="item__action"
                      onClick={() => handleConvertAction(action)}
                      disabled={convertingId === action.id}
                    >
                      {convertingId === action.id ? 'Converting…' : 'Convert to task'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
