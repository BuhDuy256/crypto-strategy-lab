// Closed, strategy-neutral drawing primitives emitted by analysis and rendered generically.

export interface AnnotationPoint {
  readonly time: number;
  readonly value: number;
}

export interface LineAnnotation {
  readonly type: "line";
  readonly id: string;
  readonly componentId?: string;
  readonly label: string;
  readonly points: readonly AnnotationPoint[];
}

export interface BandAnnotation {
  readonly type: "band";
  readonly id: string;
  readonly componentId?: string;
  readonly label: string;
  readonly upper: readonly AnnotationPoint[];
  readonly lower: readonly AnnotationPoint[];
}

export interface ZoneAnnotation {
  readonly type: "zone";
  readonly id: string;
  readonly componentId?: string;
  readonly label: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly lower: number;
  readonly upper: number;
}

export interface LevelAnnotation {
  readonly type: "level";
  readonly id: string;
  readonly componentId?: string;
  readonly label: string;
  readonly value: number;
}

export interface MarkerAnnotation {
  readonly type: "marker";
  readonly id: string;
  readonly componentId?: string;
  readonly label: string;
  readonly time: number;
  readonly value?: number;
  readonly direction: "up" | "down" | "neutral";
}

export type Annotation =
  | LineAnnotation
  | BandAnnotation
  | ZoneAnnotation
  | LevelAnnotation
  | MarkerAnnotation;
