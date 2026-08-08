'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { type Action, listActionsForProject } from '@/lib/actions';
import { attachSave } from '@/lib/projectSaves';
import { listAllProjects, type Project } from '@/lib/projects';
import { createSave, listSaves, PLATFORMS, type Platform, type Save } from '@/lib/saves';
import { Picker } from '@/components/Picker';

type ActionOrWhole = Action | { id: '__whole__'; title: string };

export default function SavesPage() {
  const [saves, setSaves] = useState<Save[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<Platform | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [linkingSaveId, setLinkingSaveId] = useState<string | null>(null);
  const [linkStep, setLinkStep] = useState<'project' | 'action' | null>(null);
  const [chosenProject, setChosenProject] = useState<Project | null>(null);
  const [projectActions, setProjectActions] = useState<Action[]>([]);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    listSaves()
      .then(setSaves)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      let finalTitle = title.trim();
      if (!finalTitle) {
        // Best-effort — falls through to createSave()'s own URL fallback if
        // this fails, times out, or the page has no title. See D-015.
        try {
          const res = await fetch('/api/link-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url.trim() }),
          });
          if (res.ok) {
            const body = await res.json();
            if (body.title) finalTitle = body.title;
          }
        } catch {
          // ignore — falls back below
        }
      }
      const save = await createSave({
        url: url.trim(),
        title: finalTitle,
        platform: platform || undefined,
      });
      setSaves((prev) => [save, ...prev]);
      setUrl('');
      setTitle('');
      setPlatform('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleOpenLinkPicker(save: Save) {
    setError(null);
    try {
      if (projects.length === 0) {
        setProjects(await listAllProjects());
      }
      setLinkingSaveId(save.id);
      setLinkStep('project');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleChooseProject(project: Project) {
    setError(null);
    setChosenProject(project);
    try {
      setProjectActions(await listActionsForProject(project.id));
      setLinkStep('action');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleFinalizeLink(actionId: string | null) {
    if (!linkingSaveId || !chosenProject || linking) return;
    setLinking(true);
    setError(null);
    try {
      await attachSave({ project_id: chosenProject.id, save_id: linkingSaveId, action_id: actionId });
      closeLinkPicker();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLinking(false);
    }
  }

  function closeLinkPicker() {
    setLinkingSaveId(null);
    setLinkStep(null);
    setChosenProject(null);
    setProjectActions([]);
  }

  const actionPickerItems: ActionOrWhole[] = [
    { id: '__whole__', title: 'No specific action — link to whole project' },
    ...projectActions,
  ];

  return (
    <div>
      <h1 className="page-title">Saves</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="url"
          className="add-form__name"
          placeholder="Paste a link…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | '')}>
          <option value="">Auto-detect</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="submit" className="add-form__submit" disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : saves.length === 0 ? (
        <p className="list-empty">No saves yet — add a link above.</p>
      ) : (
        <div className="list">
          {saves.map((save) => (
            <div key={save.id} className="item">
              <a href={save.url} target="_blank" rel="noreferrer" className="item__main">
                <span className="item__name">{save.title}</span>
              </a>
              <div className="item__actions">
                <span className="item__tag">{save.platform}</span>
                <button type="button" className="item__action" onClick={() => handleOpenLinkPicker(save)}>
                  Link to project
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {linkStep === 'project' && (
        <Picker
          title="Link to project"
          items={projects}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          onSelect={handleChooseProject}
          onClose={closeLinkPicker}
          emptyLabel="No projects yet — add one in Projects first."
        />
      )}

      {linkStep === 'action' && chosenProject && (
        <Picker
          title={`Link within "${chosenProject.name}"`}
          items={actionPickerItems}
          getKey={(a) => a.id}
          getLabel={(a) => a.title}
          onSelect={(a) => handleFinalizeLink(a.id === '__whole__' ? null : a.id)}
          onClose={closeLinkPicker}
          searchable={false}
        />
      )}
    </div>
  );
}
