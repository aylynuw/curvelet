import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteProject, downloadText, freeName, getProject, listProjects, projectCounts, projectFile, projectFileName, putProject, type Project } from './projects';
import { newId } from '../storage';
import type { FileStrings } from './strings';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed';

/** The Projects tab: the open project's name and saving, then every saved project as a card. */
export function ProjectsView({
  s,
  currentId,
  name,
  onName,
  status,
  version,
  hasContent,
  onNew,
  onSave,
  onSaveCopy,
  onExport,
  onImport,
  onOpen,
  onNotice,
  onForget,
}: {
  s: FileStrings;
  currentId: string | null;
  name: string;
  onName: (name: string) => void;
  status: SaveStatus;
  /** bumps when the app saved, so the list reads again */
  version: number;
  /** the open project holds something worth keeping */
  hasContent: boolean;
  onNew: () => void;
  onSave: () => void;
  onSaveCopy: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpen: (p: Project) => void;
  onNotice: (text: string) => void;
  /** the open project was deleted: it carries on unsaved */
  onForget: () => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** a project to open once the user says what to do with the unsaved one */
  const [pending, setPending] = useState<Project | 'new' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () =>
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  useEffect(() => {
    void reload();
  }, [version]);
  // a menu closes when the press lands outside it
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.pcard__menu, .pcard__more')) setMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const open = (p: Project) => {
    if (p.id === currentId) return onOpen(p);
    if (!currentId && hasContent) return setPending(p);
    onOpen(p);
  };
  const rename = async (p: Project, next: string) => {
    setRenaming(null);
    const n = next.trim().slice(0, 80);
    if (!n || n === p.name) return;
    if (p.id === currentId) return onName(n);
    await putProject({ ...p, name: n });
    void reload();
  };
  const duplicate = async (p: Project) => {
    setMenu(null);
    const fresh = await getProject(p.id);
    if (!fresh) return;
    const copyName = freeName(fresh.name, (projects ?? []).map((x) => x.name));
    await putProject({ ...fresh, id: newId(), name: copyName, created: Date.now(), updated: Date.now() });
    onNotice(s.copied(copyName));
    void reload();
  };
  const exportOne = async (p: Project) => {
    setMenu(null);
    const fresh = await getProject(p.id);
    if (fresh) downloadText(projectFile(fresh), projectFileName(fresh.name));
  };
  const remove = async (p: Project) => {
    setConfirming(null);
    setMenu(null);
    await deleteProject(p.id);
    if (p.id === currentId) onForget();
    void reload();
  };

  const statusText = { saved: s.statusSaved, saving: s.statusSaving, unsaved: s.statusUnsaved, failed: s.statusFailed }[status];

  return (
    <main className="workspace workspace--tool projects">
      <div className="projects__inner">
        <section className="projects__current" aria-labelledby="projects-current">
          <label className="field projects__name">
            <span id="projects-current" className="field__label">
              {s.projectName}
            </span>
            <input className="input" value={name} placeholder={s.untitled} maxLength={80} onChange={(e) => onName(e.target.value)} />
          </label>
          <p className={`projects__status projects__status--${status}`} role="status">
            {statusText}
          </p>
          <div className="projects__actions">
            <button type="button" className="btn btn--primary" title={`${s.saveProject} (⌘S)`} onClick={onSave}>
              {s.saveProject}
            </button>
            <button type="button" className="btn" onClick={onSaveCopy}>
              {s.saveCopy}
            </button>
            <button type="button" className="btn" onClick={onExport}>
              {s.exportProject}
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              {s.importProject}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".curvelet,.json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onImport(f);
              }}
            />
            <button type="button" className="btn btn--quiet projects__new" onClick={() => (!currentId && hasContent ? setPending('new') : onNew())}>
              {s.newProject}
            </button>
          </div>
        </section>

        {pending && (
          <div className="projects__ask" role="alertdialog" aria-label={s.unsavedLeave}>
            <p>{s.unsavedLeave}</p>
            <div className="projects__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  onSave();
                  if (pending === 'new') onNew();
                  else onOpen(pending);
                  setPending(null);
                }}
              >
                {s.saveFirst}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (pending === 'new') onNew();
                  else onOpen(pending);
                  setPending(null);
                }}
              >
                {s.discard}
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => setPending(null)}>
                {s.cancel}
              </button>
            </div>
          </div>
        )}

        <div className="projects__bar">
          <h2 className="projects__title">{s.projectsTitle}</h2>
          {(projects?.length ?? 0) > 3 && <input className="input projects__search" type="search" placeholder={s.search} aria-label={s.search} value={query} onChange={(e) => setQuery(e.target.value)} />}
        </div>
        <p className="projects__note">{s.projectsNote}</p>

        {projects === null ? null : shown.length === 0 ? (
          <p className="projects__empty">{projects.length ? s.noMatch : s.noProjects}</p>
        ) : (
          <ul className="projects__grid">
            {shown.map((p) => {
              const here = p.id === currentId;
              return (
                <li key={p.id} className={`pcard${here ? ' is-current' : ''}`}>
                  <button type="button" className="pcard__open" aria-label={`${s.open2}: ${p.name}`} onClick={() => open(p)}>
                    <span className="pcard__thumb">{p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <span className="pcard__nothumb">{s.noPicture}</span>}</span>
                  </button>
                  <div className="pcard__body">
                    {renaming === p.id ? (
                      <input
                        className="input pcard__rename"
                        defaultValue={here ? name : p.name}
                        aria-label={s.rename}
                        autoFocus
                        maxLength={80}
                        onBlur={(e) => void rename(p, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <p className="pcard__name">{here ? name || s.untitled : p.name}</p>
                    )}
                    <p className="pcard__meta">{s.contents(projectCounts(p))}</p>
                    <p className="pcard__meta">{here ? s.current : s.edited(new Date(p.updated))}</p>
                  </div>
                  <button type="button" className="icon-btn pcard__more" aria-label={s.more(p.name)} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                      <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
                      <circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
                    </svg>
                  </button>
                  {menu === p.id && (
                    <div className="pcard__menu menu__list" role="menu">
                      <button type="button" role="menuitem" className="menu__item" onClick={() => (setMenu(null), setRenaming(p.id))}>
                        {s.rename}
                      </button>
                      <button type="button" role="menuitem" className="menu__item" onClick={() => void duplicate(p)}>
                        {s.duplicate}
                      </button>
                      <button type="button" role="menuitem" className="menu__item" onClick={() => void exportOne(p)}>
                        {s.exportOne}
                      </button>
                      {confirming === p.id ? (
                        <button type="button" role="menuitem" className="menu__item pcard__danger" onClick={() => void remove(p)}>
                          {s.confirm}
                        </button>
                      ) : (
                        <button type="button" role="menuitem" className="menu__item" onClick={() => setConfirming(p.id)}>
                          {s.delete}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
