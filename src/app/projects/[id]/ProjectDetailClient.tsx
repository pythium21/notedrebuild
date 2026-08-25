'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  convertActionToTask,
  createAction,
  listActionsForProject,
  setActionCompleted,
  setActionFlaggedToday,
  type Action,
} from '@/lib/actions';
import { createPage, getPage, type Page } from '@/lib/pages';
import {
  attachSave,
  listSavesForAction,
  listSavesForProject,
  removeProjectSave,
  type ProjectSaveWithSave,
} from '@/lib/projectSaves';
import {
  computeProjectProgress,
  createProject,
  deleteProject,
  getProject,
  listAllProjects,
  listChildProjects,
  updateProject,
  type Project,
  type ProjectPriority,
  type ProjectProgress,
  type ProjectStatus,
} from '@/lib/projects';
import { listSaves, type Save } from '@/lib/saves';
import { BreadcrumbMenu } from '@/components/BreadcrumbMenu';
import { Picker } from '@/components/Picker';

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
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [childProjects, setChildProjects] = useState<Project[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [progress, setProgress] = useState<ProjectProgress>({ completed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [outcome, setOutcome] = useState('');

  const [notesPage, setNotesPage] = useState<Page | null>(null);
  const [isAddingNotes, setIsAddingNotes] = useState(false);

  const [projectSaves, setProjectSaves] = useState<ProjectSaveWithSave[]>([]);
  const [allSaves, setAllSaves] = useState<Save[]>([]);
  const [savePickerFor, setSavePickerFor] = useState<{ actionId: string | null } | null>(null);
  const [attaching, setAttaching] = useState(false);

  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [actionSaves, setActionSaves] = useState<Record<string, ProjectSaveWithSave[]>>({});
  const [loadingActionSaves, setLoadingActionSaves] = useState<string | null>(null);

  const [newActionTitle, setNewActionTitle] = useState('');
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [newChildName, setNewChildName] = useState('');
  const [isAddingChild, setIsAddingChild] = useState(false);

  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [isDeleting, setIsDeleting] = useState(false);

  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [breadcrumbOpen, setBreadcrumbOpen] = useState(false);

  async function refreshProgress() {
    setProgress(await computeProjectProgress(projectId));
  }

  useEffect(() => {
    setBreadcrumbOpen(false);
    Promise.all([
      getProject(projectId),
      listChildProjects(projectId),
      listActionsForProject(projectId),
      computeProjectProgress(projectId),
      listSavesForProject(projectId),
    ])
      .then(async ([p, children, projectActions, prog, saves]) => {
        setProject(p);
        setChildProjects(children);
        setActions(projectActions);
        setProgress(prog);
        setDescription(p.description || '');
        setTagsText((p.tags || []).join(', '));
        setOutcome(p.outcome || '');
        setProjectSaves(saves);
        if (p.page_id) {
          try {
            setNotesPage(await getPage(p.page_id));
          } catch {
            // linked page may no longer exist — leave notesPage null, "Add notes" affordance re-shows
          }
        }
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

  function handleOutcomeBlur() {
    if (outcome === (project?.outcome || '')) return;
    handleFieldUpdate({ outcome: outcome || null });
  }

  async function handleAddNotes() {
    if (isAddingNotes || !project) return;
    setIsAddingNotes(true);
    setError(null);
    try {
      const page = await createPage({ title: `${project.name} notes` });
      await handleFieldUpdate({ page_id: page.id });
      router.push(`/pages/${page.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAddingNotes(false);
    }
  }

  async function openBreadcrumbMenu() {
    setError(null);
    try {
      if (allProjects.length === 0) {
        setAllProjects(await listAllProjects());
      }
      setBreadcrumbOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openSavePicker(actionId: string | null) {
    setError(null);
    try {
      if (allSaves.length === 0) {
        setAllSaves(await listSaves());
      }
      setSavePickerFor({ actionId });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAttachSave(save: Save) {
    if (!savePickerFor || attaching) return;
    const actionId = savePickerFor.actionId;
    setAttaching(true);
    setError(null);
    try {
      const row = await attachSave({ project_id: projectId, save_id: save.id, action_id: actionId });
      const withSave: ProjectSaveWithSave = { ...row, save };
      if (actionId) {
        setActionSaves((prev) => ({ ...prev, [actionId]: [withSave, ...(prev[actionId] || [])] }));
      } else {
        setProjectSaves((prev) => [withSave, ...prev]);
      }
      setSavePickerFor(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAttaching(false);
    }
  }

  async function handleRemoveProjectSave(id: string, actionId: string | null) {
    if (!window.confirm('Remove this save from the project?')) return;
    setError(null);
    try {
      await removeProjectSave(id);
      if (actionId) {
        setActionSaves((prev) => ({ ...prev, [actionId]: (prev[actionId] || []).filter((s) => s.id !== id) }));
      } else {
        setProjectSaves((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleToggleExpand(action: Action) {
    if (expandedActionId === action.id) {
      setExpandedActionId(null);
      return;
    }
    setExpandedActionId(action.id);
    if (!actionSaves[action.id]) {
      setLoadingActionSaves(action.id);
      try {
        const saves = await listSavesForAction(action.id);
        setActionSaves((prev) => ({ ...prev, [action.id]: saves }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingActionSaves(null);
      }
    }
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

  async function handleDeleteProject() {
    if (isDeleting) return;
    if (childProjects.length > 0) {
      setError(
        'This project has sub-projects, which must be deleted or moved out first — the database blocks deleting a project while it still has children.'
      );
      return;
    }
    if (!window.confirm("Delete this project? Its actions and attached-save links will be deleted too. This can't be undone.")) {
      return;
    }
    setError(null);
    setIsDeleting(true);
    try {
      await deleteProject(projectId);
      router.push('/projects');
    } catch (e) {
      setError((e as Error).message);
      setIsDeleting(false);
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
      <nav className="breadcrumb">
        <Link href="/projects" className="breadcrumb__link">
          Projects
        </Link>
        <span className="breadcrumb__segment breadcrumb__segment--current">
          <span className="breadcrumb__sep">/</span>
          <button
            type="button"
            className="breadcrumb__current"
            onClick={() => (breadcrumbOpen ? setBreadcrumbOpen(false) : openBreadcrumbMenu())}
          >
            {project.name} ▾
          </button>
          {breadcrumbOpen && (
            <BreadcrumbMenu onClose={() => setBreadcrumbOpen(false)}>
              {allProjects.filter((p) => p.id !== project.id).length === 0 ? (
                <p className="breadcrumb-menu__empty">No other projects yet.</p>
              ) : (
                allProjects
                  .filter((p) => p.id !== project.id)
                  .map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="breadcrumb-menu__item breadcrumb-menu__item--project"
                      onClick={() => setBreadcrumbOpen(false)}
                    >
                      <span className="breadcrumb-menu__item-label">{p.name}</span>
                      <span className={`badge${p.status ? ` badge--status-${p.status}` : ' badge--unset'}`}>
                        {p.status ? STATUS_LABELS[p.status] : 'unset'}
                      </span>
                    </Link>
                  ))
              )}
            </BreadcrumbMenu>
          )}
        </span>
      </nav>

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

      <label className="project-detail__field project-detail__field--full">
        <span>Outcome — what does success look like?</span>
        <textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          onBlur={handleOutcomeBlur}
          rows={2}
          placeholder="e.g. Fence replaced, matches the Colorbond sample, passes council inspection"
        />
      </label>

      <div className="project-detail__section">
        <h2 className="project-detail__section-title">Notes</h2>
        {project.page_id ? (
          notesPage ? (
            <Link href={`/pages/${notesPage.id}`} className="project-detail__notes-link">
              {notesPage.emoji ? `${notesPage.emoji} ` : '📝 '}
              {notesPage.title}
            </Link>
          ) : (
            <p className="list-empty">Linked page could not be loaded.</p>
          )
        ) : (
          <button type="button" className="project-detail__notes-link" onClick={handleAddNotes} disabled={isAddingNotes}>
            {isAddingNotes ? 'Adding…' : '+ Add notes'}
          </button>
        )}
      </div>

      <div className="project-detail__section">
        <div className="attached-saves__header">
          <h2 className="project-detail__section-title">Attached saves</h2>
          <button type="button" className="item__action" onClick={() => openSavePicker(null)}>
            + Attach a save
          </button>
        </div>
        {projectSaves.length === 0 ? (
          <p className="list-empty">No saves attached yet.</p>
        ) : (
          <div className="attached-saves">
            {projectSaves.map((ps) => (
              <div key={ps.id} className="attached-save">
                <a href={ps.save.url} target="_blank" rel="noreferrer" className="attached-save__title">
                  {ps.save.title}
                </a>
                <span className="item__tag">{ps.save.platform}</span>
                <button
                  type="button"
                  className="item__action item__action--danger"
                  onClick={() => handleRemoveProjectSave(ps.id, null)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
              <div key={action.id}>
                <div className={`item${action.completed ? ' is-done' : ''}`}>
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
                      className="item__action item__action--expand"
                      onClick={() => handleToggleExpand(action)}
                      title="Show details"
                    >
                      {expandedActionId === action.id ? '▾' : '▸'}
                    </button>
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

                {expandedActionId === action.id && (
                  <div className="action-detail">
                    <div className="attached-saves__header">
                      <span className="today-section__title">Attached saves</span>
                      <button type="button" className="item__action" onClick={() => openSavePicker(action.id)}>
                        + Attach a save
                      </button>
                    </div>
                    {loadingActionSaves === action.id ? null : (actionSaves[action.id] || []).length === 0 ? (
                      <p className="list-empty">No saves attached yet.</p>
                    ) : (
                      <div className="attached-saves">
                        {(actionSaves[action.id] || []).map((ps) => (
                          <div key={ps.id} className="attached-save">
                            <a href={ps.save.url} target="_blank" rel="noreferrer" className="attached-save__title">
                              {ps.save.title}
                            </a>
                            <span className="item__tag">{ps.save.platform}</span>
                            <button
                              type="button"
                              className="item__action item__action--danger"
                              onClick={() => handleRemoveProjectSave(ps.id, action.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="danger-zone">
        <button type="button" className="danger-zone__delete" onClick={handleDeleteProject} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete project'}
        </button>
      </div>

      {savePickerFor && (
        <Picker
          title="Attach a save"
          items={allSaves}
          getKey={(s) => s.id}
          getLabel={(s) => s.title}
          getSubLabel={(s) => s.platform}
          onSelect={handleAttachSave}
          onClose={() => setSavePickerFor(null)}
          emptyLabel="No saves yet — add one in Save Manager first."
        />
      )}
    </div>
  );
}
