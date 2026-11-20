import React from "react";
import { createCutIcon } from "./create-cut-icon";

// "Distribute" share glyph: a person in a ring with six arrows pointing out.
// Optional look for the post Share button (Settings > Appearance > Share icon).
const CX = 16;
const CY = 16;
const RING = 6.6;
const SPOKES = [-90, -30, 30, 90, 150, 210];

function spoke(deg: number) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const f = (n: number) => n.toFixed(2);
  const r0 = RING + 0.6;
  const rb = 11; // triangle base
  const rt = 14.4; // triangle tip
  const hw = 2; // half the base width
  const bx = CX + rb * c;
  const by = CY + rb * s;
  return {
    line: `M${f(CX + r0 * c)} ${f(CY + r0 * s)}L${f(bx)} ${f(by)}`,
    head: `M${f(bx - hw * s)} ${f(by + hw * c)}L${f(CX + rt * c)} ${f(CY + rt * s)}L${f(bx + hw * s)} ${f(by - hw * c)}Z`,
  };
}

const PATHS = SPOKES.map(spoke);

export default createCutIcon("CutFeedDistribute", ({ weight }) => {
  const w = weight * 0.85;
  const common = { fill: "none", stroke: "currentColor", strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return <>
    <circle cx={CX} cy={CY} r={RING} {...common} />
    <circle cx={CX} cy={CY - 2.1} r={1.9} {...common} />
    <path d={`M${CX - 3.3} ${CY + 3.9}V${CY + 2.6}Q${CX - 3.3} ${CY + 0.9} ${CX - 1.6} ${CY + 0.9}H${CX + 1.6}Q${CX + 3.3} ${CY + 0.9} ${CX + 3.3} ${CY + 2.6}V${CY + 3.9}`} {...common} />
    {PATHS.map((p, i) => <React.Fragment key={i}><path d={p.line} {...common} /><path d={p.head} {...common} /></React.Fragment>)}
  </>;
});
