import type { Annotation, AnnotationPoint, LineAnnotation, BandAnnotation, MarkerAnnotation } from "../../strategy/index.js";

const MAX_POINTS_PER_SERIES = 1000;
const MAX_MARKERS = 1000;

function downsamplePoints(points: readonly AnnotationPoint[]): AnnotationPoint[] {
  if (points.length <= MAX_POINTS_PER_SERIES) return [...points];
  const step = Math.ceil(points.length / MAX_POINTS_PER_SERIES);
  return points.filter((_, index) => index % step === 0);
}

export function downsampleAnnotations(annotations: readonly Annotation[]): Annotation[] {
  const result: Annotation[] = [];
  let markerCount = 0;
  
  for (const annotation of annotations) {
    switch (annotation.type) {
      case "line":
        result.push({
          ...annotation,
          points: downsamplePoints(annotation.points)
        } as LineAnnotation);
        break;
      case "band":
        result.push({
          ...annotation,
          upper: downsamplePoints(annotation.upper),
          lower: downsamplePoints(annotation.lower)
        } as BandAnnotation);
        break;
      case "marker":
        if (markerCount < MAX_MARKERS) {
          result.push(annotation);
          markerCount++;
        }
        break;
      default:
        result.push(annotation);
    }
  }
  return result;
}
