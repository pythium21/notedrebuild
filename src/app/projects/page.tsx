'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  computeProjectProgress,
  createProject,
  listProjects,
  type Project,
  type ProjectProgress,
} from '@/lib/projects';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  on_hold: 'On hold',
  done: 'Done',
  archived: 'Archived',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [progress, setProgress] = useState<Record<string, ProjectProgress>>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    listProjects()
      .then(async (list) => {
        setProjects(list);
        const entries = await Promise.all(
          list.map(async (p) => [p.id, await computeProjectProgress(p.id)] as const)
        );
        setProgress(Object.fromEntries(entries));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const project = await createProject({ name: name.trim() });
      setProjects((prev) => [project, ...prev]);
      setProgress((prev) => ({ ...prev, [project.id]: { completed: 0, total: 0 } }));
      setName('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Projects</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="add-form__name"
          placeholder="Add a project…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="add-form__submit" disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : projects.length === 0 ? (
        <p className="list-empty">No projects yet — add one above.</p>
      ) : (
        <div className="project-grid">
          {projects.map((project) => {
            const p = progress[project.id];
            const pct = p && p.total > 0 ? Math.round((p.completed / p.total) * 100) : null;
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="project-card">
                <div className="project-card__title">{project.name}</div>
                <div className="project-card__badges">
                  <span className={`badge${project.status ? ` badge--status-${project.status}` : ' badge--unset'}`}>
                    {project.status ? STATUS_LABELS[project.status] : 'unset'}
                  </span>
                  <span
                    className={`badge${project.priority ? ` badge--priority-${project.priority}` : ' badge--unset'}`}
                  >
                    {project.priority ? PRIORITY_LABELS[project.priority] : 'unset'}
                  </span>
                </div>
                {project.tags && project.tags.length > 0 && (
                  <div className="project-card__tags">
                    {project.tags.map((tag) => (
                      <span key={tag} className="item__tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`project-card__outcome${project.outcome ? '' : ' project-card__outcome--empty'}`}>
                  {project.outcome || 'No outcome set yet'}
                </div>
                <div className="project-card__progress">
                  <div className="progress-bar">
                    <div className="progress-bar__fill" style={{ width: `${pct ?? 0}%` }} />
                  </div>
                  <span className="progress-bar__label">{pct === null ? 'No actions yet' : `${pct}%`}</span>
                </div>
                {project.due_date && <div className="project-card__due">Due {project.due_date}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
