'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  createProject,
  listProjects,
  setProjectStatus,
  type Project,
  type ProjectStatus,
} from '@/lib/projects';

const STATUSES: ProjectStatus[] = ['Planning', 'In progress', 'Done'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const project = await createProject({ name: name.trim(), steps: steps.trim() });
      setProjects((prev) => [project, ...prev]);
      setName('');
      setSteps('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleStatusChange(project: Project, status: ProjectStatus) {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status } : p)));
    try {
      await setProjectStatus(project.id, status);
    } catch (e) {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: project.status } : p)));
      setError((e as Error).message);
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
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Steps (optional)"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
        <button type="submit" className="add-form__submit" disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : projects.length === 0 ? (
        <p className="list-empty">No projects yet — add one above.</p>
      ) : (
        <div className="list">
          {projects.map((project) => (
            <div key={project.id} className="item">
              <div className="item__name">
                {project.name}
                {project.steps && <span className="item__steps">{project.steps}</span>}
              </div>
              <select
                className="status-select"
                value={project.status}
                onChange={(e) => handleStatusChange(project, e.target.value as ProjectStatus)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
