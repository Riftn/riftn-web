import { describe, expect, it } from 'vitest';
import { faceFrame, isFaceFilterId, LM, smoothFrame, type FaceFrame } from './face-filters';

function face(eyeLeftX: number, eyeRightX: number, eyeY: number, tilt = 0) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  points[LM.rightEyeOuter] = { x: eyeLeftX - 0.02, y: eyeY - tilt };
  points[LM.rightEyeInner] = { x: eyeLeftX + 0.02, y: eyeY - tilt };
  points[LM.leftEyeInner] = { x: eyeRightX - 0.02, y: eyeY + tilt };
  points[LM.leftEyeOuter] = { x: eyeRightX + 0.02, y: eyeY + tilt };
  points[LM.foreheadTop] = { x: (eyeLeftX + eyeRightX) / 2, y: eyeY - 0.15 };
  points[LM.noseTip] = { x: (eyeLeftX + eyeRightX) / 2, y: eyeY + 0.1 };
  return points;
}

describe('faceFrame', () => {
  it('centres between the eyes and sizes by their distance', () => {
    const frame = faceFrame(face(0.4, 0.6, 0.4), 1000, 1000)!;
    expect(frame.cx).toBeCloseTo(500);
    expect(frame.cy).toBeCloseTo(400);
    expect(frame.unit).toBeCloseTo(200);
    expect(frame.angle).toBeCloseTo(0);
    expect(frame.top).toBeCloseTo(-150);
    expect(frame.noseY).toBeCloseTo(100);
  });

  it('turns with the eye line', () => {
    const frame = faceFrame(face(0.4, 0.6, 0.4, 0.1), 1000, 1000)!;
    expect(frame.angle).toBeCloseTo(Math.atan2(200, 200));
  });

  it('gives up on a face with no width', () => {
    expect(faceFrame(face(0.5, 0.5, 0.4), 1000, 1000)).toBeNull();
    expect(faceFrame([], 1000, 1000)).toBeNull();
  });
});

describe('smoothFrame', () => {
  const base: FaceFrame = { cx: 100, cy: 100, angle: 0, unit: 50, top: -40, noseX: 0, noseY: 30 };
  it('eases toward the new frame', () => {
    const next = smoothFrame(base, { ...base, cx: 120 }, 0.5);
    expect(next.cx).toBe(110);
  });
  it('snaps on a jump bigger than the face', () => {
    const far = { ...base, cx: 1000 };
    expect(smoothFrame(base, far)).toEqual(far);
  });
  it('takes the short way round for angles', () => {
    const next = smoothFrame({ ...base, angle: Math.PI - 0.1 }, { ...base, angle: -Math.PI + 0.1 }, 0.5);
    expect(Math.abs(Math.abs(next.angle) - Math.PI)).toBeLessThan(0.01);
  });
});

describe('isFaceFilterId', () => {
  it('knows the filters', () => {
    expect(isFaceFilterId('cat')).toBe(true);
    expect(isFaceFilterId('dog')).toBe(false);
  });
});
