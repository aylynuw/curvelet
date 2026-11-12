import { CasResolver } from '@math/cas';
import { DEFAULT_SETTINGS, Workspace, type EvalSettings } from '@math/engine';
import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { createWorkerRuntime, type EngineState } from './cas/workerRuntime';
import { GraphPanel, type FigureOptions } from './graph/GraphPanel';
import type { Sweep } from './graph/animate';
import { decodeShared, encodeShared, shareBase, shareUrl, sharedFromLocation } from './share';
import { Keypad, type KeyAction } from './components/Keypad';
import { LineRow, sliderOf } from './components/LineRow';
import { SidePanel, type Tab } from './components/SidePanel';
import { EXAMPLES, STRINGS, type Lang } from './i18n';
import { MathText } from './components/MathText';
import { Menu } from './graph/Menu';
import { applyUpdate, isNativeApp, onUpdateReady } from './pwa';
import { CALC } from './calc/strings';
import { GEO } from './geo/strings';
import { FilesDialog, SettingsDialog } from './files/Dialogs';
import { FILES } from './files/strings';
import { LEARN } from './learn/strings';
import { TEACH } from './teach/strings';
import { FORMULA_STRINGS } from './formulas/strings';
import { WordsInput } from './formulas/WordsInput';
import { INK } from './ink/strings';
import { blankProblem, loadWorksheet, saveWorksheet, type Worksheet } from './teach/worksheet';
import type { FigureTemplate, Range } from './teach/templates';
import type { Node } from '@math/engine';
import { load, newId, save, type Folder, type HistoryItem, type Line, type LineData, type SliderSettings, type Theme } from './storage';
import { cleanLook, renderLook, slotOf, swatchColor, type LineLook } from './graph/looks';
import type { MoveOut } from './components/MathInput';
import { emptyUndo, record, redo, undo, undoKey } from './undo';
import { emptyTable, fitSource, tableSource, type Model, type Table } from './table/table';
import { cleanLine, foldersOf, lineData } from './lines';
import type { MathfieldElement } from './math/mathlive';

const HISTORY_LIMIT = 100;
/** the practice answer's key among the math fields */
const PRACTICE = 'practice';
const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function initialState() {
  const saved = load();
  const loaded: Line[] = saved.lines?.length
    ? saved.lines.flatMap((l) => {
        const data = cleanLine(l);
        return data ? [{ id: String(l.id ?? newId()), ...data }] : [];
      })
    : [];
  const lines: Line[] = loaded.length ? loaded : [{ id: newId(), source: '' }];
  const lang: Lang = saved.lang ?? (navigator.language?.startsWith('ko') ? 'ko' : 'en');
  return {
    lines,
    history: saved.history ?? [],
    settings: { ...DEFAULT_SETTINGS, ...saved.settings } as EvalSettings,
    lang,
    keypad: saved.keypad ?? coarsePointer(),
    theme: saved.theme ?? ('system' as Theme),
  };
}

/** 0, π/2, 2π, 4π… in radians; plain numbers otherwise */
function angleText(value: number, angle: 'rad' | 'deg'): string {
  if (angle === 'rad') {
    for (const q of [1, 2, 3, 4, 6]) {
      const p = Math.round((value / Math.PI) * q);
      if (Math.abs((value / Math.PI) * q - p) < 1e-9) {
        if (p === 0) return '0';
        const num = `${p === 1 ? '' : p === -1 ? '−' : p}π`;
        return q === 1 ? num : `${num}/${q}`;
      }
    }
  }
  return String(Number(value.toPrecision(6))).replace('-', '−');
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const CalculatorTool = lazy(() => import('./calc/CalculatorTool').then((m) => ({ default: m.CalculatorTool })));
const GeometryTool = lazy(() => import('./geo/GeometryTool').then((m) => ({ default: m.GeometryTool })));
const StudyTool = lazy(() => import('./teach/StudyTool').then((m) => ({ default: m.StudyTool })));
const InkPanel = lazy(() => import('./ink/InkPanel').then((m) => ({ default: m.InkPanel })));
const TutorialPanel = lazy(() => import('./tutorial/TutorialPanel'));
const FormulasPanel = lazy(() => import('./formulas/FormulasPanel').then((m) => ({ default: m.FormulasPanel })));
/** a line worth keeping: math, a table, a note or a folder */
const hasContent = (l: Line) => !!l.source.trim() || l.note !== undefined || !!l.folder || !!l.table;

const GRAPH_KEY = 'calculator.graph.v1';

type Tool = 'graph' | 'calc' | 'geo' | 'sheet';
const TOOLS: Tool[] = ['graph', 'calc', 'geo', 'sheet'];
const TOOL_KEY = 'calculator.tool.v1';

export function App() {
  const initial = useMemo(initialState, []);
  const [lines, setLines] = useState<Line[]>(initial.lines);
  // the latest lines, for handlers registered once
  const linesRef = useRef(lines);
  linesRef.current = lines;

  // undo and redo over the lines: every change is recorded, typing in one line merges
  const undoRef = useRef(emptyUndo());
  const prevLinesRef = useRef(lines);
  const replayingRef = useRef(false);
  const [canStep, setCanStep] = useState({ undo: false, redo: false });
  useEffect(() => {
    if (prevLinesRef.current === lines) return;
    if (!replayingRef.current) undoRef.current = record(undoRef.current, prevLinesRef.current, lines, Date.now());
    replayingRef.current = false;
    prevLinesRef.current = lines;
    setCanStep({ undo: undoRef.current.past.length > 0, redo: undoRef.current.future.length > 0 });
  }, [lines]);
  const stepHistory = useCallback((dir: 'undo' | 'redo') => {
    const r = (dir === 'undo' ? undo : redo)(undoRef.current, linesRef.current);
    if (!r) return;
    undoRef.current = r.state;
    replayingRef.current = true;
    setLines(r.lines);
  }, []);
  useEffect(() => {
    // caught before the math fields, whose own undo only knows one line
    const onKey = (e: globalThis.KeyboardEvent) => {
      const dir = undoKey(e);
      // the other tools keep their own history
      if (!dir || modeRef.current !== 'graph') return;
      const el = e.target as HTMLElement | null;
      // ordinary text boxes (a hex code, a name) keep their own undo
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      e.stopPropagation();
      stepHistory(dir);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [stepHistory]);
  const [history, setHistory] = useState<HistoryItem[]>(initial.history);
  const [settings, setSettings] = useState<EvalSettings>(initial.settings);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [keypad, setKeypad] = useState(initial.keypad);
  const [tab, setTab] = useState<Tab>('lines');
  const [theme, setTheme] = useState<Theme>(initial.theme);
  // the graph's own settings (grid, π numbers, point coordinates) are remembered between visits
  const [figure, setFigure] = useState<FigureOptions>(() => {
    const base: FigureOptions = { style: 'screen', axisNumbers: false, curveLabels: true, axes: true };
    try {
      const v = JSON.parse(localStorage.getItem(GRAPH_KEY) ?? '{}') as Record<string, unknown>;
      return {
        ...base,
        ...(v.grid === 'polar' || v.grid === 'none' ? { grid: v.grid } : {}),
        ...(v.piTicks === true ? { piTicks: true } : {}),
        ...(v.pointLabels === false ? { pointLabels: false } : {}),
        ...(v.axes === false ? { axes: false } : {}),
      };
    } catch {
      return base;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(GRAPH_KEY, JSON.stringify({ grid: figure.grid, piTicks: figure.piTicks, pointLabels: figure.pointLabels, axes: figure.axes }));
    } catch {
      // kept for this visit only
    }
  }, [figure.grid, figure.piTicks, figure.pointLabels, figure.axes]);
  const [notice, setNotice] = useState<{ text: string; link?: string; action?: { label: string; run: () => void } } | null>(null);
  // a new version downloaded in the background: offer to switch
  useEffect(
    () => onUpdateReady(() => setNotice({ text: t.updateReady, action: { label: t.updateNow, run: applyUpdate } })),
    // the strings at the moment it arrives are fine
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // notices close by themselves, unless the pointer or focus is on them or they hold a link to copy
  const [noticeHeld, setNoticeHeld] = useState(false);
  useEffect(() => {
    if (!notice || notice.link || noticeHeld) return;
    const id = setTimeout(() => setNotice(null), notice.action ? 12000 : 6000);
    return () => clearTimeout(id);
  }, [notice, noticeHeld]);
  const [backup, setBackup] = useState<Line[] | null>(null);
  /** why the worksheet was replaced: a shared link (the default) or a template */
  const [backupNote, setBackupNote] = useState<string | null>(null);
  /** the curve selected on the graph (its line id) */
  const [selected, setSelected] = useState<string | null>(null);
  const t = STRINGS[lang];
  const learn = LEARN[lang];
  const teach = TEACH[lang];
  const cs = CALC[lang];
  const gs = GEO[lang];
  const fls = FILES[lang];
  const [dialog, setDialog] = useState<'settings' | 'files' | null>(null);
  // the worksheet's name, for saving and file names
  const [docName, setDocName] = useState(() => {
    try {
      return localStorage.getItem('calculator.docname.v1') ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('calculator.docname.v1', docName);
    } catch {
      // kept for this visit only
    }
  }, [docName]);
  const fs = FORMULA_STRINGS[lang];
  const ink = INK[lang];
  const [inkOpen, setInkOpen] = useState(false);
  // which tool is open; each keeps its own document
  const [mode, setModeState] = useState<Tool>(() => {
    try {
      const v = localStorage.getItem(TOOL_KEY);
      return TOOLS.includes(v as Tool) ? (v as Tool) : 'graph';
    } catch {
      return 'graph';
    }
  });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const setMode = (m: Tool) => {
    setModeState(m);
    try {
      localStorage.setItem(TOOL_KEY, m);
    } catch {
      // remembered for this visit only
    }
  };
  const [sheet, setSheet] = useState<Worksheet>(() => loadWorksheet(initial.lang));
  useEffect(() => saveWorksheet(sheet), [sheet]);
  /** a template's range for the graph to show */
  const [fit, setFit] = useState<{ range: Range; nonce: number } | null>(null);

  const [engine, setEngine] = useState<EngineState>('idle');
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // SymPy runs in a worker; the resolver caches its answers for the workspace
  const resolver = useMemo(() => new CasResolver(createWorkerRuntime(setEngine)), []);

  // the engine workspace, kept in step with `lines`
  const ws = useMemo(() => {
    const w = new Workspace(initial.settings, resolver);
    for (const l of initial.lines) w.set(l.id, l.source);
    return w;
  }, [initial, resolver]);

  // when SymPy answers, re-evaluate and show the new results
  useEffect(
    () =>
      resolver.onAnswer(() => {
        if (ws.refresh().length > 0) rerender();
      }),
    [resolver, ws],
  );

  // step-by-step working: integral steps come from SymPy; the steps views listen for its answers
  const askIntegral = useCallback((args: Node[]) => resolver.resolve('integral_steps', args, ws.getSettings()), [resolver, ws]);
  const onAnswer = useCallback((l: () => void) => resolver.onAnswer(l), [resolver]);
  const stepsFor = (id: string) => {
    const r = ws.result(id);
    if (!r || r.status === 'error' || r.status === 'pending' || r.status === 'empty') return undefined;
    const call = ws.symbolicCall(id);
    if (!call || !['diff', 'integrate', 'solve'].includes(call.op)) return undefined;
    return { call, s: learn, settings, askIntegral, onAnswer };
  };

  // light or dark, for lightening custom colours on a dark graph
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  // each graphed line keeps its colour slot while it is graphed, wherever it moves;
  // a slot it gives up goes to the next new line, so colours don't run out
  const looks = useMemo(() => new Map(lines.filter((l) => l.look).map((l) => [l.id, l.look!])), [lines]);
  const looksRef = useRef(looks);
  looksRef.current = looks;
  const series = useRef(new Map<string, number>());
  const seriesOf = useCallback((id: string) => {
    const chosen = slotOf(looksRef.current.get(id)?.color);
    if (chosen !== null) return chosen;
    let slot = series.current.get(id);
    if (slot === undefined) {
      const taken = new Set(series.current.values());
      slot = 0;
      while (taken.has(slot)) slot++;
      series.current.set(id, slot);
    }
    return slot;
    // looks change which slot a line chose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looks]);
  const allGraphables = ws.graphables();
  // curves take colour slots; points are drawn in ink and don't use one up
  const curveIds = new Set(allGraphables.filter((g) => g.kind !== 'point').map((g) => g.id));
  const pointIds = new Set(allGraphables.filter((g) => g.kind === 'point').map((g) => g.id));
  for (const id of series.current.keys()) if (!curveIds.has(id)) series.current.delete(id);
  // hidden lines keep their colour but aren't drawn
  // folders: what each line sits under, and how many lines each holds
  const folderOf = foldersOf(lines);
  const folderSizes = new Map<string, number>();
  for (const f of folderOf.values()) folderSizes.set(f.id, (folderSizes.get(f.id) ?? 0) + 1);
  const graphables = allGraphables.filter((g) => !looks.get(g.id)?.hidden && !folderOf.get(g.id)?.folder?.hidden);
  const lookOf = useCallback((id: string) => renderLook(looksRef.current.get(id), dark), [dark, looks]);
  const fillableIds = new Set(
    allGraphables.filter((g) => ((g.kind === 'curve' || g.kind === 'implicit') && g.op !== '=') || (g.kind === 'shape' && g.shape.type === 'polygon')).map((g) => g.id),
  );
  const setLook = (id: string, look: LineLook | undefined) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l;
        const { look: _old, ...rest } = l;
        return look ? { ...rest, look } : rest;
      }),
    );
  const setSliderSettings = (id: string, slider: SliderSettings | undefined) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l;
        const { slider: _old, ...rest } = l;
        return slider ? { ...rest, slider } : rest;
      }),
    );
  /** a table's cells changed: its line is rewritten from them */
  const setTable = (id: string, table: Table) => {
    const source = tableSource(table);
    ws.set(id, source);
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, table, source } : l)));
  };
  const addTable = () => {
    const current = linesRef.current;
    const last = current[current.length - 1];
    const line: Line = { id: newId(), source: '', table: emptyTable() };
    // an empty last line becomes the table
    const keep = last && !last.source.trim() && !last.table ? current.slice(0, -1) : current;
    if (keep !== current) ws.remove(last!.id);
    const next = [...keep, line];
    ws.set(line.id, '');
    ws.setOrder(next.map((l) => l.id));
    linesRef.current = next;
    setLines(next);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-cell="x0"]`)?.focus());
  };
  /** change a note's text or a folder heading (not the math) */
  const patchLine = (id: string, patch: Partial<Pick<Line, 'note' | 'folder'>>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  /** a line of another kind at the end: a note or a folder heading */
  const appendKind = (data: LineData, focus: string) => {
    const current = linesRef.current;
    const last = current[current.length - 1];
    const line: Line = { id: newId(), ...data };
    const keep = last && !hasContent(last) ? current.slice(0, -1) : current;
    if (keep !== current) ws.remove(last!.id);
    const next = [...keep, line];
    ws.set(line.id, line.source);
    ws.setOrder(next.map((l) => l.id));
    linesRef.current = next;
    setLines(next);
    requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>(focus)].pop()?.focus());
  };
  /** a regression for a table, as the line after it */
  const fitTable = (index: number, model: Model) => {
    const table = linesRef.current[index]?.table;
    if (table) insertLine(index, fitSource(table, model));
  };
  /** a line moved to another place in the list (drag, or Alt+↑/↓) */
  const moveLine = (from: number, to: number) => {
    const cur = linesRef.current;
    if (to < 0 || to >= cur.length || from === to || from < 0 || from >= cur.length) return;
    const next = [...cur];
    const [l] = next.splice(from, 1);
    next.splice(to, 0, l!);
    ws.setOrder(next.map((x) => x.id));
    linesRef.current = next;
    setLines(next);
  };
  const curveRange = (id: string) => {
    const g = graphables.find((k) => k.id === id);
    if (g?.kind !== 'parametric' && g?.kind !== 'polar') return undefined;
    const v = g.kind === 'polar' ? 'θ' : 't';
    return `${angleText(g.tmin, settings.angle)} ≤ ${v} ≤ ${angleText(g.tmax, settings.angle)}`;
  };

  const inputs = useRef(new Map<string, MathfieldElement>());
  const lastFocused = useRef<string>(initial.lines[0]!.id);
  const pendingFocus = useRef<{ id: string; caret?: number } | null>(null);

  useEffect(() => {
    save({ lines, history, settings, lang, keypad, theme });
  }, [lines, history, settings, lang, keypad, theme]);

  // light, dark, or the system's; the graph redraws in the new colours
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    window.dispatchEvent(new Event('themechange'));
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.docTitle;
  }, [lang, t]);

  // move focus after the line list re-renders
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const el = inputs.current.get(target.id);
    if (!el) return;
    el.focus();
    el.executeCommand(target.caret === 0 ? 'moveToMathfieldStart' : 'moveToMathfieldEnd');
  });

  /** Replace every line (opening a shared link, or restoring after one). */
  const replaceAll = (items: LineData[]) => {
    for (const l of linesRef.current) ws.remove(l.id);
    const next: Line[] = (items.length ? items : [{ source: '' }]).map((d) => ({ id: newId(), ...d }));
    for (const l of next) ws.set(l.id, l.source);
    ws.setOrder(next.map((l) => l.id));
    linesRef.current = next;
    setLines(next);
  };

  // a shared link (#w=…) opens its worksheet, on page load or when pasted into
  // the address bar of an open page; the current worksheet is kept to bring back
  useEffect(() => {
    const open = () => {
      const packed = sharedFromLocation();
      if (!packed) return;
      // clear the address first, so the link is opened once even if this runs twice
      window.history.replaceState(null, '', location.pathname + location.search);
      void decodeShared(packed).then((data) => {
        if (!data) return;
        setBackup(linesRef.current.filter(hasContent));
        setBackupNote(null);
        if (data.settings) changeSettings(data.settings);
        replaceAll(data.items);
        if (data.name) setDocName(data.name);
      });
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
    // the handler reads current lines through linesRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const base = shareBase(isNativeApp());
    // an app built without a web address can't make a link; a file does the same job
    if (!base) return setNotice({ text: t.shareNeedsWeb, action: { label: t.shareAsFile, run: () => setDialog('files') } });
    const kept = lines.filter(hasContent);
    const url = shareUrl(await encodeShared({ items: kept.map(lineData), settings, ...(docName.trim() ? { name: docName.trim() } : {}) }), base);
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ text: t.linkCopied });
    } catch {
      setNotice({ text: t.copyThisLink, link: url });
    }
  };

  /** A point dragged on the graph: let A = (1, 2) becomes let A = (1.5, 2) */
  const movePoint = (name: string, x: number, y: number) => {
    const id = ws.definitions().find((d) => d.name === name)?.id;
    if (!id) return;
    ws.movePoint(name, x, y);
    const source = ws.source(id) ?? '';
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, source } : l)));
  };

  // sliders an animation can sweep; the sweep sets the value, draws, and puts the line back
  const sliders = lines.flatMap((l) => {
    const s = sliderOf(l.source);
    return s && ws.result(l.id)?.status === 'value' ? [{ ...s, id: l.id }] : [];
  });
  const sweep = (name: string): Sweep => {
    const s = sliders.find((k) => k.name === name)!;
    const source = s && lines.find((l) => l.id === s.id)!.source;
    return {
      name,
      min: s.min,
      max: s.max,
      at: (v) => {
        ws.setValue(name, v);
        return ws.graphables();
      },
      restore: () => {
        ws.set(s.id, source);
        rerender();
      },
    };
  };

  /** A click on the graph with a field selected: slopefield(f) becomes slopefield(f, (x, y)) */
  const addSeed = (id: string, x: number, y: number) => {
    const line = lines.find((l) => l.id === id);
    if (!line || !/\)\s*$/.test(line.source)) return;
    updateLine(id, line.source.replace(/\)\s*$/, `, (${x}, ${y}))`));
  };

  /** Start from an exam figure template; the current lines are kept to bring back. */
  const startTemplate = (tpl: FigureTemplate) => {
    const kept = linesRef.current.filter((l) => l.source.trim());
    setBackup(kept);
    setBackupNote(teach.templateUsed(tpl.name[lang]));
    replaceAll(tpl.lines.map((source) => ({ source })));
    setFigure((f) => ({ ...f, style: 'exam', axes: tpl.axes }));
    setFit({ range: tpl.range, nonce: Date.now() });
    setTab('lines');
  };

  /** This graph, as it is, becomes a worksheet problem with a figure. */
  const addFigure = (f: { range: Range; axes: boolean; axisNumbers: boolean; curveLabels: boolean }) => {
    const lines = linesRef.current.map((l) => l.source).filter((src) => src.trim());
    const round = (v: number) => Number(v.toPrecision(3));
    const range = { xmin: round(f.range.xmin), xmax: round(f.range.xmax), ymin: round(f.range.ymin), ymax: round(f.range.ymax) };
    setSheet((w) => ({ ...w, problems: [...w.problems, { ...blankProblem(), figure: { lines, range, axes: f.axes, axisNumbers: f.axisNumbers, curveLabels: f.curveLabels, width: 0.85 } }] }));
    setNotice({ text: teach.addedToSheet(sheet.problems.length + 1), action: { label: teach.openSheet, run: () => setMode('sheet') } });
  };

  /** Lines from a formula, after the worksheet's last line (an empty last line is used first). */
  const insertLines = (sources: string[], name: string) => {
    const current = linesRef.current;
    const last = current[current.length - 1];
    const keep = last && !last.source.trim() ? current.slice(0, -1) : current;
    const added = sources.map((source) => ({ id: newId(), source }));
    const next = [...keep, ...added];
    if (last && !last.source.trim()) ws.remove(last.id);
    for (const l of added) ws.set(l.id, l.source);
    ws.setOrder(next.map((l) => l.id));
    linesRef.current = next;
    setLines(next);
    setTab('lines');
    setNotice({ text: fs.inserted(name) });
    focusLine(added[added.length - 1]!.id);
  };

  /** A slider moved: let a = 3 becomes let a = 3.4 */
  const slide = (id: string, name: string, value: number) => {
    ws.setValue(name, value);
    const source = ws.source(id) ?? '';
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, source } : l)));
  };

  const focusLine = (id: string, caret?: number) => {
    pendingFocus.current = { id, caret };
  };

  const updateLine = (id: string, source: string) => {
    ws.set(id, source);
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, source } : l)));
  };

  const insertLine = (afterIndex: number, source = '') => {
    const line = { id: newId(), source };
    const next = [...lines.slice(0, afterIndex + 1), line, ...lines.slice(afterIndex + 1)];
    ws.set(line.id, source);
    ws.setOrder(next.map((l) => l.id));
    setLines(next);
    focusLine(line.id);
    return line.id;
  };

  const deleteLine = (index: number) => {
    const line = lines[index]!;
    if (lines.length === 1) {
      updateLine(line.id, '');
      focusLine(line.id);
      return;
    }
    ws.remove(line.id);
    const next = lines.filter((_, k) => k !== index);
    setLines(next);
    focusLine(next[Math.max(0, index - 1)]!.id);
  };

  const recordHistory = (line: Line) => {
    const r = ws.result(line.id);
    if (r?.status !== 'value' || !line.source.trim()) return;
    setHistory((h) =>
      h[0]?.source === line.source && h[0]?.text === r.text
        ? h
        : [{ id: newId(), source: line.source, text: r.text }, ...h].slice(0, HISTORY_LIMIT),
    );
  };

  const commitLine = (index: number) => {
    const line = lines[index]!;
    recordHistory(line);
    const next = lines[index + 1];
    // Enter on the last line, or on a filled line, opens a new line below
    if (!next || line.source.trim()) insertLine(index);
    else focusLine(next.id);
  };

  /** ↑ and ↓ past the top or bottom of a line go to the line above or below */
  const moveOut = (index: number, dir: MoveOut) => {
    const next = lines[index + (dir === 'up' ? -1 : 1)];
    if (next) focusLine(next.id, dir === 'up' ? undefined : 0);
    rerender();
  };

  const defineName = (index: number, name: string) => {
    // put the definition above the line that needs it
    const line = { id: newId(), source: `let ${name} = 1` };
    const next = [...lines.slice(0, index), line, ...lines.slice(index)];
    ws.set(line.id, line.source);
    ws.setOrder(next.map((l) => l.id));
    setLines(next);
    focusLine(line.id);
  };

  const insertAtEnd = (source: string) => {
    const last = lines[lines.length - 1]!;
    if (!last.source.trim()) {
      updateLine(last.id, source);
      focusLine(last.id);
    } else {
      insertLine(lines.length - 1, source);
    }
  };

  const onKeypad = (k: KeyAction) => {
    const id = lastFocused.current;
    const index = lines.findIndex((l) => l.id === id);
    const mf = inputs.current.get(id);
    if (!mf || (index < 0 && id !== PRACTICE)) return;
    // the practice answer: plain editing, Enter checks it
    if (index < 0) {
      if (!mf.hasFocus()) mf.focus();
      if ('type' in k) mf.executeCommand(['typedText', k.type]);
      else if ('latex' in k) mf.executeCommand(['insert', k.latex, { selectionMode: 'placeholder', format: 'latex' }]);
      else if (k.action === 'backspace') mf.executeCommand('deleteBackward');
      else if (k.action === 'left') mf.executeCommand('moveToPreviousChar');
      else if (k.action === 'right') mf.executeCommand('moveToNextChar');
      else if (k.action === 'row') mf.executeCommand('addRowAfter');
      else mf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return;
    }
    if (!mf.hasFocus()) mf.focus();
    if ('type' in k) mf.executeCommand(['typedText', k.type]);
    else if ('latex' in k) mf.executeCommand(['insert', k.latex, { selectionMode: 'placeholder', format: 'latex' }]);
    else if (k.action === 'backspace') {
      if (mf.value === '' && lines.length > 1) return deleteLine(index);
      mf.executeCommand('deleteBackward');
    } else if (k.action === 'left') mf.executeCommand('moveToPreviousChar');
    else if (k.action === 'right') mf.executeCommand('moveToNextChar');
    else if (k.action === 'row') mf.executeCommand('addRowAfter');
    else commitLine(index);
  };

  /** factor(…) ⇄ expand(…) on the same line */
  const switchForm = (id: string, to: 'factor' | 'expand') => {
    const source = lines.find((l) => l.id === id)?.source ?? '';
    const next = source.replace(/^(\s*)(factor|expand)(\s*\()/, `$1${to}$3`);
    if (next !== source) updateLine(id, next);
  };

  const changeSettings = (patch: Partial<EvalSettings>) => {
    ws.updateSettings(patch);
    setSettings((s) => ({ ...s, ...patch }));
  };

  // while the engine loads the first time, say so once, on the first waiting line
  const firstPending = lines.find((l) => ws.result(l.id)?.status === 'pending')?.id;
  const pendingNote = (id: string) => (engine === 'ready' ? t.pending : id === firstPending ? t.loadingEngine : null);

  const onlyEmptyLine = lines.length === 1 && !lines[0]!.source.trim();
  const keyboard = keypad && coarsePointer() ? 'none' : 'text';

  const themeOrder: Theme[] = ['system', 'light', 'dark'];
  const nextTheme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length]!;

  return (
    <div className="app" data-keypad={keypad || undefined}>
      <header className="topbar">
        <div className="brand">
          <svg className="brand__mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="var(--color-accent)" />
            <path d="M6 15.5c2.2 0 2.6-7 6-7s3.8 7 6 7" stroke="var(--color-accent-ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </svg>
          <h1 className="wordmark">{t.appName}</h1>
        </div>
        <Segmented
          label={cs.tools}
          value={mode}
          options={[
            { value: 'graph', label: cs.graph },
            { value: 'calc', label: cs.calculator },
            { value: 'geo', label: cs.geometry },
            { value: 'sheet', label: cs.worksheet },
          ]}
          onChange={setMode}
        />
        <div className="topbar__tools">
          <button type="button" className="icon-btn" aria-label={fls.files} title={fls.files} onClick={() => setDialog('files')}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M2.5 5.5a1.5 1.5 0 011.5-1.5h3.6l1.8 2H16a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0116 16H4a1.5 1.5 0 01-1.5-1.5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="btn btn--quiet topbar__quick" lang={lang === 'en' ? 'ko' : 'en'} aria-label={t.switchLanguageLabel} onClick={() => setLang(lang === 'en' ? 'ko' : 'en')}>
            {t.switchLanguage}
          </button>
          <button
            type="button"
            className="icon-btn topbar__quick"
            aria-label={t.themeButton(t.themeName[theme])}
            title={t.themeButton(t.themeName[theme])}
            onClick={() => setTheme(nextTheme)}
          >
            <ThemeIcon theme={theme} />
          </button>
          <button type="button" className="icon-btn" aria-pressed={keypad} aria-label={t.keypadToggle} title={t.keypadToggle} onClick={() => setKeypad((k) => !k)}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M6 8h.01M9 8h.01M12 8h.01M15 8h-.99M6 11h.01M7 12.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="icon-btn" aria-label={fls.settings} title={fls.settings} onClick={() => setDialog('settings')}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void share()}>
            {t.share}
          </button>
        </div>
      </header>

      {(notice || backup) && (
        <div
          className="notice"
          role="status"
          onPointerEnter={() => setNoticeHeld(true)}
          onPointerLeave={() => setNoticeHeld(false)}
          onFocus={() => setNoticeHeld(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setNoticeHeld(false);
          }}
        >
          {backup ? (
            <>
              <span>{backupNote ?? t.sharedOpened}</span>
              {backup.length > 0 && (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => {
                    replaceAll(backup.map(lineData));
                    setBackup(null);
                    setBackupNote(null);
                  }}
                >
                  {t.restore}
                </button>
              )}
            </>
          ) : (
            <>
              <span>{notice!.text}</span>
              {notice!.link && <input className="notice__link" readOnly value={notice!.link} aria-label={t.share} onFocus={(e) => e.currentTarget.select()} />}
              {notice!.action && (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => {
                    notice!.action!.run();
                    setNotice(null);
                  }}
                >
                  {notice!.action.label}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="icon-btn notice__close"
            aria-label={t.dismiss}
            onClick={() => {
              setNotice(null);
              setBackup(null);
              setBackupNote(null);
            }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        </div>
      )}

      <Suspense fallback={<main className="workspace workspace--tool" aria-busy="true" />}>
      {mode === 'calc' ? (
        <main className="workspace workspace--tool">
          <CalculatorTool
            s={cs}
            t={t}
            settings={settings}
            resolver={resolver}
            onAnswer={onAnswer}
            onNotice={(text) => setNotice({ text })}
            onSendToGraph={(source) => {
              insertAtEnd(source);
              setNotice({ text: cs.sentToGraph, action: { label: cs.openGraph, run: () => setMode('graph') } });
            }}
          />
        </main>
      ) : mode === 'geo' ? (
        <main className="workspace workspace--tool">
          <GeometryTool
            s={gs}
            onSendToGraph={(sources) => {
              insertLines(sources, gs.objects);
              setNotice({ text: gs.sent(sources.length), action: { label: gs.openGraph, run: () => setMode('graph') } });
            }}
          />
        </main>
      ) : mode === 'sheet' ? (
        <main className="workspace workspace--sheet">
          <StudyTool
            sheet={sheet}
            setSheet={setSheet}
            s={teach}
            learn={learn}
            lang={lang}
            settings={settings}
            resolver={resolver}
            onAnswer={onAnswer}
            askIntegral={askIntegral}
            keyboard={keyboard}
            fieldRef={(el) => {
              if (el) inputs.current.set(PRACTICE, el);
              else inputs.current.delete(PRACTICE);
            }}
            onFocusField={() => {
              lastFocused.current = PRACTICE;
            }}
            onNotice={(text) => setNotice({ text })}
            calculatorLines={() => linesRef.current.map((l) => l.source).filter((src) => src.trim())}
          />
        </main>
      ) : (
      <main className="workspace">
        <SidePanel
          tab={tab}
          onTab={setTab}
          t={t}
          lang={lang}
          definitions={ws.definitions()}
          history={history}
          onGoTo={(id) => {
            setTab('lines');
            focusLine(id);
          }}
          onInsert={(source) => {
            setTab('lines');
            insertAtEnd(source);
          }}
          onClearHistory={() => setHistory([])}
          formulas={
            <Suspense fallback={null}>
            <FormulasPanel
              s={fs}
              lang={lang}
              settings={settings}
              resolver={resolver}
              onAnswer={onAnswer}
              taken={() => new Set(ws.definitions().map((d) => d.name))}
              onInsert={insertLines}
            />
            </Suspense>
          }
          tutorial={
            <Suspense fallback={null}>
              <TutorialPanel lang={lang} onTry={insertLines} onOpenTool={setMode} />
            </Suspense>
          }
          footer={
            keypad && (
              <div className="keypad-dock">
                <Keypad t={t} onKey={onKeypad} />
              </div>
            )
          }
        >
          <div className="panel__bar">
            <button type="button" className="btn btn--small btn--add" onClick={() => insertLine(lines.length - 1)}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {t.newLine}
            </button>
            <Menu
              label={t.addMore}
              listLabel={t.addMoreLabel}
              align="left"
              items={[
                { key: 'table', label: t.newTable, note: t.newTableLabel, run: addTable },
                { key: 'note', label: t.newNote, run: () => appendKind({ source: '', note: '' }, '[data-note]') },
                { key: 'folder', label: t.newFolder, run: () => appendKind({ source: '', folder: { title: '' } }, '[data-folder]') },
              ]}
            />
            <div className="panel__history" role="group" aria-label={t.editHistory}>
              <button type="button" className="icon-btn" aria-label={t.undo} title={t.undoHint} disabled={!canStep.undo} onClick={() => stepHistory('undo')}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M6 4L3 7l3 3M3 7h6.5a3.5 3.5 0 010 7H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="icon-btn" aria-label={t.redo} title={t.redoHint} disabled={!canStep.redo} onClick={() => stepHistory('redo')}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M10 4l3 3-3 3M13 7H6.5a3.5 3.5 0 000 7H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="panel__settings" role="group" aria-label={t.settings}>
              <Segmented
                label={t.angle}
                value={settings.angle}
                options={[
                  { value: 'rad', label: t.rad },
                  { value: 'deg', label: t.deg },
                ]}
                onChange={(angle) => changeSettings({ angle })}
              />
              <Segmented
                label={t.numbers}
                value={settings.complex ? 'complex' : 'real'}
                options={[
                  { value: 'real', label: t.real },
                  { value: 'complex', label: t.complex },
                ]}
                onChange={(v) => changeSettings({ complex: v === 'complex' })}
              />
            </div>
          </div>
          <ol className="lines">
            {lines.map((line, index) =>
              folderOf.get(line.id)?.folder?.collapsed ? null : (
              <LineRow
                key={line.id}
                index={index}
                source={line.source}
                result={ws.result(line.id)}
                t={t}
                keyboard={keyboard}
                fieldRef={(el) => {
                  if (el) inputs.current.set(line.id, el);
                  else inputs.current.delete(line.id);
                }}
                onChange={(v) => updateLine(line.id, v)}
                onEnter={() => commitLine(index)}
                onBackspaceEmpty={() => lines.length > 1 && deleteLine(index)}
                onMoveOut={(dir) => moveOut(index, dir)}
                onFocus={() => {
                  lastFocused.current = line.id;
                  // focusing a graphed line selects its curve
                  if (curveIds.has(line.id)) setSelected(line.id);
                }}
                onDelete={() => deleteLine(index)}
                onDefine={(name) => defineName(index, name)}
                onSwitch={(to) => switchForm(line.id, to)}
                pendingNote={pendingNote(line.id)}
                swatch={curveIds.has(line.id) ? seriesOf(line.id) : pointIds.has(line.id) ? 'point' : undefined}
                graphIssue={ws.graphIssue(line.id)}
                onSlide={(name, value) => slide(line.id, name, value)}
                curveRange={curveRange(line.id)}
                steps={stepsFor(line.id)}
                look={line.look}
                swatchColor={
                  curveIds.has(line.id)
                    ? swatchColor(line.look, seriesOf(line.id), dark)
                    : // a point is ink until given a colour
                      pointIds.has(line.id) && line.look?.color
                      ? swatchColor(line.look, 0, dark)
                      : undefined
                }
                onLook={(look) => setLook(line.id, look)}
                sliderSettings={line.slider}
                onSliderSettings={(st) => setSliderSettings(line.id, st)}
                onMoveLine={(to) => {
                  moveLine(index, to);
                  // keep typing in the line that moved
                  requestAnimationFrame(() => focusLine(line.id));
                }}
                onMoveFrom={moveLine}
                table={line.table}
                onTable={(tb) => setTable(line.id, tb)}
                onFit={(m) => fitTable(index, m)}
                note={line.note}
                onNote={(text) => patchLine(line.id, { note: text })}
                folder={line.folder}
                folderCount={folderSizes.get(line.id) ?? 0}
                onFolder={(f) => patchLine(line.id, { folder: f })}
                inFolder={folderOf.has(line.id)}
                folderHidden={!!folderOf.get(line.id)?.folder?.hidden}
                lang={lang}
                fillable={fillableIds.has(line.id)}
              />
              ),
            )}
          </ol>
          <WordsInput s={fs} onAdd={insertAtEnd} />
          <div className="ink-toggle">
            <button type="button" className="btn btn--small btn--link" aria-expanded={inkOpen} onClick={() => setInkOpen((v) => !v)}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 13l1.2-3.6L11 2.6a1.4 1.4 0 0 1 2 2L6.2 11.4z M9.8 3.8l2 2" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
              </svg>
              {inkOpen ? ink.close : ink.open}
            </button>
          </div>
          {inkOpen && (
            <Suspense fallback={<p className="ink__loading">{ink.reading}</p>}>
              <InkPanel s={ink} keyboard={keyboard} onAdd={insertAtEnd} />
            </Suspense>
          )}
          <p className="panel__hint">{t.mathHint}</p>

          {onlyEmptyLine && (
            <div className="examples">
              <h2 className="examples__title">{t.tryTitle}</h2>
              <ul className="examples__list">
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button type="button" className="example" aria-label={t.insert(ex)} onClick={() => insertAtEnd(ex)}>
                      <MathText text={ex} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SidePanel>

        <section className="stage-area" aria-label={t.graph}>
          <GraphPanel
            graphables={graphables}
            seriesOf={seriesOf}
            look={lookOf}
            swatchOf={(id) => swatchColor(looks.get(id), seriesOf(id), dark)}
            t={t}
            figure={figure}
            onFigure={setFigure}
            onInsert={insertAtEnd}
            selected={selected && curveIds.has(selected) ? selected : null}
            onSelect={setSelected}
            lineNumber={(id) => lines.findIndex((l) => l.id === id) + 1}
            onMovePoint={movePoint}
            sliders={sliders}
            sweep={sweep}
            onAddSeed={addSeed}
            learn={learn}
            teach={teach}
            lang={lang}
            onTemplate={startTemplate}
            onAddFigure={addFigure}
            fit={fit}
          />
        </section>
      </main>
      )}
      </Suspense>

      <SettingsDialog
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        s={fls}
        t={t}
        lang={lang}
        onLang={setLang}
        theme={theme}
        onTheme={setTheme}
        settings={settings}
        onSettings={changeSettings}
        keypad={keypad}
        onKeypad={setKeypad}
      />
      <FilesDialog
        open={dialog === 'files'}
        onClose={() => setDialog(null)}
        s={fls}
        name={docName}
        onRename={setDocName}
        current={() => linesRef.current.filter(hasContent).map(lineData)}
        onOpen={(doc, note) => {
          replaceAll(doc.lines);
          setDocName(doc.name);
          setMode('graph');
          setNotice({ text: note });
        }}
        onNotice={(text) => setNotice({ text })}
      />
    </div>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light')
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  if (theme === 'dark')
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
    </svg>
  );
}
