import type { PaintOp } from './engine';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draw painting ops on a 2D canvas. */
export function drawOps(ctx: Ctx, ops: PaintOp[]) {
  ctx.save();
  ctx.lineJoin = 'round';
  for (const op of ops) {
    switch (op.k) {
      case 'seg':
        ctx.globalAlpha = op.a;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.w;
        ctx.lineCap = op.cap;
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
        break;
      case 'dot':
        ctx.globalAlpha = op.a;
        ctx.fillStyle = op.color;
        ctx.beginPath();
        ctx.arc(op.x, op.y, Math.max(0.5, op.r), 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'speck':
        ctx.globalAlpha = op.a;
        ctx.fillStyle = op.color;
        ctx.fillRect(op.x - op.s / 2, op.y - op.s / 2, op.s, op.s);
        break;
      case 'ring':
        ctx.globalAlpha = op.a;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.w;
        ctx.beginPath();
        ctx.arc(op.x, op.y, Math.max(0.5, op.r), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'rect':
        ctx.globalAlpha = 1;
        if (op.fill) {
          ctx.fillStyle = op.color;
          ctx.fillRect(op.x, op.y, op.w, op.h);
        } else {
          ctx.strokeStyle = op.color;
          ctx.lineWidth = op.lw;
          ctx.lineJoin = 'miter';
          ctx.strokeRect(op.x, op.y, op.w, op.h);
          ctx.lineJoin = 'round';
        }
        break;
      case 'ellipse':
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.ellipse(op.cx, op.cy, Math.max(0.5, op.rx), Math.max(0.5, op.ry), 0, 0, Math.PI * 2);
        if (op.fill) {
          ctx.fillStyle = op.color;
          ctx.fill();
        } else {
          ctx.strokeStyle = op.color;
          ctx.lineWidth = op.lw;
          ctx.stroke();
        }
        break;
    }
  }
  ctx.restore();
}
