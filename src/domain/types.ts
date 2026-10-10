/* Composition — shared domain types (client).
   Report section shapes mirror supabase/functions/ocr/types.ts. The report
   itself stays loosely typed (Record<string, any)) because the review/detail
   views walk arbitrary dotted paths; safety comes from Reading.metrics,
   Settings, and function signatures instead. */

export type ReadingSource = 'qr' | 'link' | 'file' | 'share' | 'manual';

/** Loose report: sections keyed by name, leaves are numbers/strings/objects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Report = Record<string, any>;

export type MetricKey = string;

export interface Reading {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
  measuredAt: string;
  source: ReadingSource | string;
  sourceType?: string | null;
  extractionMethod?: string | null;
  playerId?: string | null;
  language?: string | null;
  reportUrl?: string | null;
  note?: string;
  notes?: string;
  confidence?: number | null;
  raw?: string | null;
  report: Report | null;
  metrics: Partial<Record<string, number>>;
  sample?: boolean;
  sn?: string;
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark' | string;
  massUnit: 'kg' | 'lb' | string;
  reduceMotion: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  reportBase: string;
  mirror: boolean;
  mirrorSyncedAt: string | null;
}

export interface ChartPoint {
  t: number;
  v: number;
  id?: string;
  readings?: number;
}

export interface ChartOptions {
  points: ChartPoint[];
  height?: number;
  accent?: string;
  unit?: string;
  digits?: number;
  grid?: boolean;
  dots?: boolean;
  scrub?: boolean;
  padLeft?: number;
  padRight?: number;
  padTop?: number;
  padBottom?: number;
  metricKey?: string;
  yFormat?: ((v: number) => string) | null;
  pointLabel?: (p: ChartPoint) => string;
}

export type StartReadingJob =
  | { mode: 'manual' }
  | { mode: 'file'; file: File }
  | { mode: 'report-url'; url: string; playerId?: string | null; language?: string | null }
  | { mode: 'player-id'; playerId: string; language?: string | null };

export interface ReviewState {
  metrics: Record<string, number>;
  report: Report | null;
  measuredAt: string;
  confidence: number | null;
  raw: string | null;
  notes: string;
  note?: string;
  playerId: string | null;
  language: string | null;
  reportUrl: string | null;
  source: string;
  sourceType: string | null;
  extractionMethod: string | null;
  previewUrl: string | null;
  extras?: unknown[];
}

export type ParseReportUrlResult =
  | { ok: true; url: string; playerId: string | null; language: string; host: string }
  | { ok: false; reason: 'empty' | 'not-a-url' | 'no-base' };

/** Envelope returned by the OCR edge function (see supabase/functions/ocr). */
export interface OcrResult {
  metrics?: Record<string, unknown>;
  report?: Report | null;
  measuredAt?: string | null;
  measured_at?: string | null;
  confidence?: number | null;
  notes?: string;
  text?: string;
  raw?: string | null;
  sourceType?: string | null;
  failed?: boolean;
}

export interface MirrorResult {
  ok: boolean;
  count: number;
  uploaded?: number;
  downloaded?: number;
  error?: string;
}
