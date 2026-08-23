import { describe, it, expect } from "vitest";
import { downsampleAnnotations } from "./annotation-downsampler.js";
import type { AnnotationPoint, LineMarkerAnnotation } from "../../strategy/index.js";

describe("annotation downsampler", () => {
  it("keeps short series intact", () => {
    const points: AnnotationPoint[] = Array.from({ length: 500 }, (_, i) => ({ time: i, value: i }));
    const annotation: LineAnnotation = { type: "line", id: "l1", label: "L1", points };
    const result = downsampleAnnotations([annotation]);
    expect((result[0] as LineAnnotation).points.length).toBe(500);
  });

  it("downsamples long series to fit within the cap", () => {
    const points: AnnotationPoint[] = Array.from({ length: 2500 }, (_, i) => ({ time: i, value: i }));
    const annotation: LineAnnotation = { type: "line", id: "l1", label: "L1", points };
    const result = downsampleAnnotations([annotation]);
    const downsampled = (result[0] as LineAnnotation).points;
    expect(downsampled.length).toBeLessThanOrEqual(1000);
    expect(downsampled[0]?.time).toBe(0);
    expect(downsampled[1]?.time).toBe(3); // Math.ceil(2500 / 1000) = 3
  });

  it("limits the total number of markers", () => {
    const markers: MarkerAnnotation[] = Array.from({ length: 1500 }, (_, i) => ({
      type: "marker", id: `m${i}`, label: `M${i}`, time: i, direction: "up"
    }));
    const result = downsampleAnnotations(markers);
    expect(result.length).toBe(1000);
  });
});
