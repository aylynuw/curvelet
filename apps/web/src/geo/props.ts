/**
 * How a figure's numbers and marks are shown. The document has a full set of
 * these; an object may override any of them for itself only (a key it doesn't
 * set follows the document, which the Properties panel calls "Default").
 * Sizes are in coordinate units, like everything else in the figure.
 */
export type ValueFormat = 'auto' | 'decimal' | 'radical' | 'fraction' | 'pi';
export type LabelMode = 'hidden' | 'value' | 'custom';

export interface GeoProps {
  /** how a number is written: exact when there is an exact form (auto), 9.07, 3√2, 7/3, 4π */
  format: ValueFormat;
  /** decimal places, 0–4 */
  decimals: number;
  /** after lengths (and squared after areas): '', 'cm', 'm' or any text */
  unit: string;
  /** a segment drawn by itself */
  segLabel: LabelMode;
  /** the sides of a polygon */
  sideLabel: LabelMode;
  /** a length beside its side, or on a dimension line with arrows */
  sideStyle: 'beside' | 'dimension';
  /** how far a dimension line stands off its side */
  dimOffset: number;
  /** angle objects */
  angleLabel: LabelMode;
  /** the corners of a polygon */
  cornerLabel: LabelMode;
  /** single or double arc */
  angleArcs: number;
  /** the arc's radius */
  arcSize: number;
  /** the square mark for a right angle: when the angle is 90° (auto), always, or never */
  rightMark: 'auto' | 'always' | 'off';
  /** a circle's radius or diameter drawn as a line */
  circleLine: 'none' | 'radius' | 'diameter';
  /** the number shown with a circle */
  circleValue: 'hidden' | 'radius' | 'diameter' | 'area' | 'circumference';
  /** a dot at a circle's centre */
  centerMark: boolean;
  /** the area inside a polygon or an ellipse */
  areaLabel: LabelMode;
  /** equal-length ticks: 0 (none), 1 (|), 2 (||), 3 (|||) */
  ticks: number;
  /** parallel arrows: 0 (none), 1 (>), 2 (>>) */
  arrows: number;
  /** point names shown */
  pointLabel: boolean;
  /** a picture keeps its proportions when its size is typed */
  imageRatio: boolean;
  /** an angle with no whole number of degrees: as a decimal, or exactly with an inverse trig function (tan⁻¹2) */
  angleForm: 'degree' | 'trig';
  /** label size */
  fontSize: number;
  /** variables (single letters) in italic */
  italic: boolean;
  /** equal sides get matching ticks by themselves */
  autoTicks: boolean;
}

export const BASE_PROPS: GeoProps = {
  format: 'auto',
  decimals: 2,
  unit: '',
  segLabel: 'value',
  sideLabel: 'hidden',
  sideStyle: 'beside',
  dimOffset: 0.6,
  angleLabel: 'value',
  cornerLabel: 'hidden',
  angleArcs: 1,
  arcSize: 0.5,
  rightMark: 'auto',
  circleLine: 'none',
  circleValue: 'hidden',
  centerMark: true,
  areaLabel: 'hidden',
  ticks: 0,
  arrows: 0,
  pointLabel: true,
  imageRatio: true,
  angleForm: 'degree',
  fontSize: 0.36,
  italic: true,
  autoTicks: false,
};

export const PROP_KEYS = Object.keys(BASE_PROPS) as (keyof GeoProps)[];

export interface Preset {
  id: string;
  /** built-in presets are named by the strings file; saved ones carry their own name */
  name?: string;
  props: Partial<GeoProps>;
}

export const BUILT_IN_PRESETS: Preset[] = [
  { id: 'exam-exact', props: { format: 'radical', unit: '', autoTicks: true, areaLabel: 'hidden', segLabel: 'value', italic: true } },
  { id: 'exam-decimal', props: { format: 'decimal', decimals: 1, unit: '', autoTicks: true, areaLabel: 'hidden', segLabel: 'value', italic: true } },
  { id: 'classroom', props: { format: 'decimal', decimals: 1, unit: 'cm', autoTicks: false, areaLabel: 'value', segLabel: 'value' } },
];

const PRESET_KEY = 'curvelet.geometry.presets';
export function loadPresets(): Preset[] {
  try {
    const v = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((p) => p && typeof p.id === 'string' && p.props) : [];
  } catch {
    return [];
  }
}
export function savePresets(list: Preset[]) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  } catch {
    // kept for this visit
  }
}

/** an object's settings: its own overrides on top of the document's */
export function propsOf(defaults: GeoProps, own?: Partial<GeoProps>): GeoProps {
  return own ? { ...defaults, ...own } : defaults;
}
