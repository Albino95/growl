import { describe, expect, it } from 'vitest';
import { isManipulatorJpeg, planGeometry } from './geometry';

const NONE = { straighten: 0, crop: 'free' as const, offsetX: 0, offsetY: 0 };

describe('planGeometry', () => {
  it('no edits and small source → no actions', () => {
    expect(planGeometry({ width: 1000, height: 800 }, NONE, 1280).actions).toEqual([]);
  });

  it('only downscales when the long edge exceeds maxEdge', () => {
    const p = planGeometry({ width: 4032, height: 3024 }, NONE, 1280);
    expect(p.actions).toEqual([{ resize: { width: 1280, height: 960 } }]);
  });

  it('crop + resize in one action list, crop inside the source', () => {
    const p = planGeometry({ width: 4032, height: 3024 }, { ...NONE, crop: '4:5', offsetX: 1 }, 1280);
    expect(p.actions).toHaveLength(2);
    const crop = (p.actions[0] as { crop: { originX: number; width: number; height: number } }).crop;
    expect(crop.originX + crop.width).toBeLessThanOrEqual(4032);
    expect(crop.width / crop.height).toBeCloseTo(0.8, 2);
    expect(p.actions[1]).toEqual({ resize: { width: 1024, height: 1280 } });
  });

  it('straighten + crop compose into rotate → single crop within the rotated canvas', () => {
    const w = 1280;
    const h = 960;
    const p = planGeometry({ width: w, height: h }, { straighten: 5, crop: '1:1', offsetX: -1, offsetY: 1 }, 1280);
    expect(p.actions[0]).toEqual({ rotate: 5 });
    const crop = (p.actions[1] as { crop: { originX: number; originY: number; width: number; height: number } }).crop;
    const rad = (5 * Math.PI) / 180;
    const rw = Math.floor(w * Math.cos(rad) + h * Math.sin(rad));
    const rh = Math.floor(w * Math.sin(rad) + h * Math.cos(rad));
    expect(crop.width).toBe(crop.height);
    expect(crop.originX).toBeGreaterThanOrEqual(0);
    expect(crop.originY).toBeGreaterThanOrEqual(0);
    expect(crop.originX + crop.width).toBeLessThanOrEqual(rw);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(rh);
    expect(p.actions).toHaveLength(2);
  });
});

describe('isManipulatorJpeg', () => {
  it('matches ImageManipulator cache output only', () => {
    expect(isManipulatorJpeg('file:///var/.../Caches/ImageManipulator/AB-12.jpg')).toBe(true);
    expect(isManipulatorJpeg('file:///data/cache/ImageManipulator/x.jpeg')).toBe(true);
    expect(isManipulatorJpeg('file:///var/.../ImagePicker/IMG_1.heic')).toBe(false);
    expect(isManipulatorJpeg('file:///cache/grow-edit-1.jpg')).toBe(false);
  });
});
