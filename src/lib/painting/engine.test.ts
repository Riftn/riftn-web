import { describe, expect, it } from 'vitest';
import {
  PaintHistory,
  endStroke,
  floodFill,
  hexToHsv,
  hsvToHex,
  isPaintingFile,
  moveStroke,
  paintingFileName,
  shade,
  shapeOp,
  startStroke,
  type PaintTool,
} from './engine';

function paper(w: number, h: number) {
  const px = new Uint8ClampedArray(w * h * 4);
  px.fill(255);
  return px;
}

describe('painting engine', () => {
  it('fills an enclosed area and stops at a line', () => {
    const w = 10;
    const h = 10;
    const px = paper(w, h);
    // A black wall down column 5.
    for (let y = 0; y < h; y++) px.set([0, 0, 0, 255], (y * w + 5) * 4);
    expect(floodFill(px, w, h, 1, 1, '#ff0000')).toBe(true);
    expect([...px.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...px.slice((4 * w + 4) * 4, (4 * w + 4) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    // The wall and the far side are untouched.
    expect([...px.slice(5 * 4, 5 * 4 + 4)]).toEqual([0, 0, 0, 255]);
    expect([...px.slice(9 * 4, 9 * 4 + 4)]).toEqual([255, 255, 255, 255]);
    // Same colour again changes nothing.
    expect(floodFill(px, w, h, 1, 1, '#ff0000')).toBe(false);
  });

  it('ignores a fill outside the canvas', () => {
    expect(floodFill(paper(4, 4), 4, 4, -1, 2, '#000000')).toBe(false);
    expect(floodFill(paper(4, 4), 4, 4, 2, 9, '#000000')).toBe(false);
  });

  it('draws the same texture for the same seed', () => {
    const tools: PaintTool[] = ['oil', 'pastel', 'watercolor', 'charcoal'];
    for (const tool of tools) {
      const run = () => {
        const { stroke, ops } = startStroke(tool, '#3366cc', 24, 50, 50, 1, 42);
        return [...ops, ...moveStroke(stroke, 80, 60), ...moveStroke(stroke, 120, 90)];
      };
      const a = run();
      expect(a.length).toBeGreaterThan(0);
      expect(run()).toEqual(a);
    }
  });

  it('keeps the classic tools solid and the eraser white', () => {
    const { stroke } = startStroke('brush', '#123456', 10, 0, 0);
    const [seg] = moveStroke(stroke, 20, 0);
    expect(seg).toMatchObject({ k: 'seg', w: 10, color: '#123456', a: 1 });
    const eraser = startStroke('eraser', '#123456', 10, 0, 0);
    expect(moveStroke(eraser.stroke, 20, 0)[0]).toMatchObject({ color: '#ffffff' });
  });

  it('leaves a blob when the oil brush only taps', () => {
    const tap = startStroke('oil', '#3366cc', 20, 5, 5);
    expect(tap.ops).toEqual([]);
    expect(endStroke(tap.stroke)).toMatchObject([{ k: 'dot', r: 10 }]);
    const drag = startStroke('oil', '#3366cc', 20, 5, 5);
    moveStroke(drag.stroke, 40, 5);
    expect(endStroke(drag.stroke)).toEqual([]);
  });

  it('waits for real movement before drawing', () => {
    const { stroke } = startStroke('brush', '#000000', 20, 10, 10);
    expect(moveStroke(stroke, 10.2, 10.1)).toEqual([]);
  });

  it('makes squares, circles and 45 degree lines with even on', () => {
    expect(shapeOp('rect', 0, 0, 30, 10, 4, '#000000', false, true)).toMatchObject({ k: 'rect', w: 30, h: 30 });
    expect(shapeOp('ellipse', 0, 0, 10, 40, 4, '#000000', true, true)).toMatchObject({ k: 'ellipse', rx: 20, ry: 20, fill: true });
    const line = shapeOp('line', 0, 0, 100, 5, 4, '#000000', false, true);
    expect(line).toMatchObject({ k: 'seg', y2: 0 });
    expect(shapeOp('rect', 5, 5, 5.2, 5.2, 4, '#000000', false)).toBeNull();
  });

  it('converts colours', () => {
    expect(shade('#000000', 0.5)).toBe('#808080');
    expect(shade('#ffffff', -1)).toBe('#000000');
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000');
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00');
    const hsv = hexToHsv('#00a2e8');
    expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe('#00a2e8');
  });

  it('undoes and redoes within its limit', () => {
    const h = new PaintHistory('a', 3);
    h.push('b');
    h.push('c');
    h.push('d');
    expect(h.undo()).toBe('c');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('c');
    h.push('e');
    expect(h.canRedo).toBe(false);
    expect(h.current).toBe('e');
  });

  it('names painting files so the composer can tell them apart', () => {
    expect(isPaintingFile(paintingFileName('png', 123))).toBe(true);
    expect(isPaintingFile('painting-123.jpg')).toBe(true);
    expect(isPaintingFile('photo.png')).toBe(false);
    expect(isPaintingFile(null)).toBe(false);
  });
});
