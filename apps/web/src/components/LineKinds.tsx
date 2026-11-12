import { useLayoutEffect, useRef } from 'react';
import type { Strings } from '../i18n';
import type { Folder } from '../storage';

/** A note line: plain text between the math, growing with what is typed. */
export function NoteEditor({ n, t, text, onChange, onEnter }: { n: number; t: Strings; text: string; onChange: (text: string) => void; onEnter: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      className="note"
      data-note
      rows={1}
      value={text}
      aria-label={t.noteLabel(n)}
      placeholder={t.notePlaceholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Enter starts a new line below; Shift+Enter breaks the note
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

/** A folder heading: fold its lines away, take them off the graph, name it. */
export function FolderHead({ n, t, folder, count, onChange }: { n: number; t: Strings; folder: Folder; count: number; onChange: (f: Folder) => void }) {
  const title = folder.title || t.folderUntitled;
  return (
    <div className="folder">
      <button
        type="button"
        className="icon-btn folder__toggle"
        aria-expanded={!folder.collapsed}
        aria-label={folder.collapsed ? t.folderOpen(title) : t.folderClose(title)}
        onClick={() => onChange({ ...folder, collapsed: !folder.collapsed || undefined })}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d={folder.collapsed ? 'M6 4l4 4-4 4' : 'M4 6l4 4 4-4'} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <input
        className="folder__title"
        data-folder
        value={folder.title}
        placeholder={t.folderUntitled}
        aria-label={t.folderLabel(n)}
        maxLength={80}
        onChange={(e) => onChange({ ...folder, title: e.target.value })}
      />
      <span className="folder__count">{t.folderCount(count)}</span>
      <button
        type="button"
        className="icon-btn folder__eye"
        aria-pressed={!folder.hidden}
        aria-label={folder.hidden ? t.folderShow(title) : t.folderHide(title)}
        title={folder.hidden ? t.folderShow(title) : t.folderHide(title)}
        onClick={() => onChange({ ...folder, hidden: !folder.hidden || undefined })}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.4" fill="none" />
          {folder.hidden ? <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /> : <circle cx="8" cy="8" r="2" fill="currentColor" />}
        </svg>
      </button>
    </div>
  );
}
