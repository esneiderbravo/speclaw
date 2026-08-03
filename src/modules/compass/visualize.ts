import fs from "node:fs";
import path from "node:path";
import { openDb, indexExists } from "./db.js";

/** A definition rendered as a graph vertex, with its location and degree. */
export interface GraphNode {
  /** Node id from the Compass index. */
  id: number;
  name: string;
  /** Symbol kind (function, class, method, …) — drives the node color. */
  kind: string;
  file: string;
  line: number;
  /** Number of incident call edges — drives the node radius. */
  deg: number;
}

/** A directed call edge between two nodes, referenced by their ids. */
export interface GraphLink {
  /** Caller node id. */
  s: number;
  /** Callee node id. */
  t: number;
}

/** The renderable graph plus the totals shown in the visualization's HUD. */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Total node count in the index (nodes may be a capped subset). */
  total: number;
  /** The focus node name if the graph is a neighborhood, else null. */
  focus: string | null;
}

/** Controls which slice of the graph the visualization renders. */
export interface VisualizeOptions {
  /** Center on this node's neighborhood instead of the whole graph. */
  focus?: string;
  /** BFS depth around the focus node (default 2). */
  depth?: number;
  /** Max nodes when rendering the whole graph (most-connected first, default 300). */
  limit?: number;
}

/**
 * Build the graph payload from the Compass index: nodes (definitions) and the
 * resolved call links between them. With a focus node, returns its neighborhood
 * (BFS both directions); otherwise the most-connected nodes up to `limit`.
 *
 * @throws If no index exists yet (run `compass_index` first).
 */
export function graphData(projectPath: string, opts: VisualizeOptions = {}): GraphData {
  if (!indexExists(projectPath)) {
    throw new Error("No index found. Run the compass_index tool (or `speclaw index`) first.");
  }
  const { focus, depth = 2, limit = 300 } = opts;
  const db = openDb(projectPath);
  try {
    const allNodes = db
      .prepare(
        `SELECT n.id, n.name, n.kind, f.path AS file, n.start_line AS line
         FROM nodes n JOIN files f ON f.id = n.file_id`
      )
      .all() as Array<{ id: number; name: string; kind: string; file: string; line: number }>;
    const allEdges = db
      .prepare(
        `SELECT src_node_id AS s, dst_node_id AS t FROM edges
         WHERE kind = 'call' AND dst_node_id IS NOT NULL AND src_node_id IS NOT NULL`
      )
      .all() as Array<{ s: number; t: number }>;

    // adjacency (undirected) + degree
    const adj = new Map<number, Set<number>>();
    const deg = new Map<number, number>();
    for (const e of allEdges) {
      if (e.s === e.t) continue;
      (adj.get(e.s) ?? adj.set(e.s, new Set()).get(e.s)!).add(e.t);
      (adj.get(e.t) ?? adj.set(e.t, new Set()).get(e.t)!).add(e.s);
      deg.set(e.s, (deg.get(e.s) ?? 0) + 1);
      deg.set(e.t, (deg.get(e.t) ?? 0) + 1);
    }

    let included: Set<number>;
    if (focus) {
      const starts = allNodes.filter((n) => n.name === focus).map((n) => n.id);
      included = new Set(starts);
      let frontier = starts;
      for (let d = 0; d < depth && frontier.length; d++) {
        const next: number[] = [];
        for (const id of frontier) {
          for (const nb of adj.get(id) ?? []) {
            if (!included.has(nb)) {
              included.add(nb);
              next.push(nb);
            }
          }
        }
        frontier = next;
      }
    } else {
      included = new Set(
        [...allNodes]
          .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
          .slice(0, limit)
          .map((n) => n.id)
      );
    }

    const nodes: GraphNode[] = allNodes
      .filter((n) => included.has(n.id))
      .map((n) => ({ ...n, deg: deg.get(n.id) ?? 0 }));
    const links: GraphLink[] = allEdges.filter((e) => included.has(e.s) && included.has(e.t));
    return { nodes, links, total: allNodes.length, focus: focus ?? null };
  } finally {
    db.close();
  }
}

/**
 * Build the graph and write it as an interactive HTML page to
 * `<projectPath>/.speclaw/graph.html` (the gitignored index directory).
 *
 * @param projectPath - Absolute path to the project root.
 * @param opts - Focus/depth/limit controlling which nodes are included.
 * @returns The output path plus the shown/link/total counts for reporting.
 * @throws If no Compass index exists yet.
 */
export function visualize(projectPath: string, opts: VisualizeOptions = {}): {
  path: string;
  shown: number;
  links: number;
  total: number;
} {
  const data = graphData(projectPath, opts);
  const dir = path.join(projectPath, ".speclaw");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "graph.html");
  fs.writeFileSync(out, renderHtml(data));
  return { path: out, shown: data.nodes.length, links: data.links.length, total: data.total };
}

/**
 * Render the graph as a self-contained, offline HTML page: the data is embedded
 * as JSON and drawn by an inline canvas force-directed renderer (no CDN, no
 * dependencies).
 *
 * @param data - The nodes/links/totals to embed.
 * @returns A complete HTML document as a string.
 */
export function renderHtml(data: GraphData): string {
  const payload = JSON.stringify(data);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>speclaw · Compass graph</title>
<style>
  :root { --cy:#17C1C1; --cr:#F4F1EA; --mu:#6E7B80; --bg:#0B0F10; }
  * { box-sizing:border-box; }
  html,body { margin:0; height:100%; background:var(--bg); color:var(--cr);
    font-family:'SF Mono','JetBrains Mono',Menlo,Consolas,monospace; overflow:hidden; }
  canvas { display:block; cursor:grab; }
  canvas:active { cursor:grabbing; }
  .panel { position:fixed; top:16px; left:16px; padding:12px 14px; border-radius:10px;
    background:rgba(12,17,19,.82); border:1px solid #232A2D; font-size:12px; line-height:1.5; }
  .panel b { color:var(--cr); } .panel .sub { color:var(--mu); }
  .legend { position:fixed; bottom:16px; left:16px; font-size:11px; color:var(--mu);
    background:rgba(12,17,19,.82); border:1px solid #232A2D; border-radius:10px; padding:10px 12px; }
  .legend span { display:inline-flex; align-items:center; margin-right:12px; }
  .legend i { width:9px; height:9px; border-radius:50%; display:inline-block; margin-right:5px; }
  .tip { position:fixed; padding:6px 9px; border-radius:7px; background:#0E1517; border:1px solid #17C1C1;
    color:var(--cr); font-size:12px; pointer-events:none; opacity:0; transition:opacity .1s; white-space:nowrap; }
  .brand { color:var(--cy); font-weight:700; }
</style></head><body>
<canvas id="c"></canvas>
<div class="panel">
  <div><span class="brand">speclaw</span> · Compass graph</div>
  <div class="sub" id="meta"></div>
  <div class="sub">drag to pan · wheel to zoom · drag a node · hover to inspect</div>
</div>
<div class="legend" id="legend"></div>
<div class="tip" id="tip"></div>
<script>
const DATA = ${payload};
const KIND_COLORS = { function:'#17C1C1', method:'#3FB950', class:'#E3B341',
  interface:'#8B989E', type:'#8B989E', enum:'#8B989E' };
const colorOf = k => KIND_COLORS[k] || '#6E7B80';

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const tip = document.getElementById('tip');
document.getElementById('meta').textContent =
  DATA.nodes.length + ' nodes · ' + DATA.links.length + ' edges' +
  (DATA.focus ? ' · focus: ' + DATA.focus : ' · top ' + DATA.nodes.length + ' of ' + DATA.total);
{
  const kinds = [...new Set(DATA.nodes.map(n=>n.kind))];
  document.getElementById('legend').innerHTML = kinds.map(k =>
    '<span><i style="background:'+colorOf(k)+'"></i>'+k+'</span>').join('');
}

const idx = new Map(DATA.nodes.map((n,i)=>[n.id,i]));
const N = DATA.nodes.map(n => ({...n, x:(Math.random()-.5)*800, y:(Math.random()-.5)*600, vx:0, vy:0,
  r: 4 + Math.min(10, Math.sqrt(n.deg||0)*2) }));
const L = DATA.links.map(l => ({s:idx.get(l.s), t:idx.get(l.t)})).filter(l=>l.s!=null&&l.t!=null);
const neigh = N.map(()=>new Set());
L.forEach(l => { neigh[l.s].add(l.t); neigh[l.t].add(l.s); });

let scale=1, ox=0, oy=0, W=0, H=0, DPR=Math.min(2,devicePixelRatio||1);
function resize(){ W=innerWidth; H=innerHeight; cv.width=W*DPR; cv.height=H*DPR; cv.style.width=W+'px'; cv.style.height=H+'px'; ctx.setTransform(DPR,0,0,DPR,0,0); }
addEventListener('resize', resize); resize(); ox=W/2; oy=H/2;

// force simulation
function tick(){
  for(let i=0;i<N.length;i++){ const a=N[i];
    for(let j=i+1;j<N.length;j++){ const b=N[j];
      let dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy||0.01, d=Math.sqrt(d2);
      const f=Math.min(2200/d2, 40); const ux=dx/d, uy=dy/d;
      a.vx+=ux*f; a.vy+=uy*f; b.vx-=ux*f; b.vy-=uy*f;
    }
    a.vx += -a.x*0.0016; a.vy += -a.y*0.0016; // gravity to center
  }
  for(const l of L){ const a=N[l.s], b=N[l.t];
    let dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy)||0.01;
    const f=(d-90)*0.02, ux=dx/d, uy=dy/d;
    a.vx+=ux*f; a.vy+=uy*f; b.vx-=ux*f; b.vy-=uy*f;
  }
  for(const n of N){ if(n===dragging) continue; n.vx*=0.82; n.vy*=0.82; n.x+=n.vx; n.y+=n.vy; }
}
function toScreen(n){ return { x: n.x*scale+ox, y: n.y*scale+oy }; }

let hover=-1;
function draw(){
  ctx.clearRect(0,0,W,H);
  const hoverSet = hover>=0 ? neigh[hover] : null;
  ctx.lineWidth = 1;
  for(const l of L){ const a=toScreen(N[l.s]), b=toScreen(N[l.t]);
    const on = hover>=0 && (l.s===hover||l.t===hover);
    ctx.strokeStyle = on ? 'rgba(23,193,193,.7)' : 'rgba(110,123,128,.16)';
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  }
  for(let i=0;i<N.length;i++){ const n=N[i], p=toScreen(n);
    const dim = hover>=0 && i!==hover && !(hoverSet&&hoverSet.has(i));
    ctx.globalAlpha = dim ? 0.28 : 1;
    ctx.beginPath(); ctx.arc(p.x,p.y,n.r*Math.sqrt(scale),0,7); ctx.fillStyle=colorOf(n.kind); ctx.fill();
    if((n.r>7 || i===hover || (hoverSet&&hoverSet.has(i))) && scale>0.5){
      ctx.globalAlpha = dim?0.4:0.9; ctx.fillStyle='#F4F1EA'; ctx.font='11px monospace';
      ctx.fillText(n.name, p.x+n.r+3, p.y+3);
    }
  }
  ctx.globalAlpha=1;
}
function loop(){ tick(); draw(); requestAnimationFrame(loop); }

// interaction
let dragging=null, panning=false, lastX=0, lastY=0;
function pick(mx,my){ let best=-1, bd=1e9;
  for(let i=0;i<N.length;i++){ const p=toScreen(N[i]); const d=Math.hypot(p.x-mx,p.y-my);
    if(d < N[i].r*Math.sqrt(scale)+6 && d<bd){ bd=d; best=i; } } return best; }
cv.addEventListener('mousedown', e=>{ const i=pick(e.clientX,e.clientY);
  if(i>=0) dragging=N[i]; else { panning=true; } lastX=e.clientX; lastY=e.clientY; });
addEventListener('mousemove', e=>{
  if(dragging){ dragging.x += (e.clientX-lastX)/scale; dragging.y += (e.clientY-lastY)/scale; dragging.vx=dragging.vy=0; }
  else if(panning){ ox+=e.clientX-lastX; oy+=e.clientY-lastY; }
  lastX=e.clientX; lastY=e.clientY;
  const i=pick(e.clientX,e.clientY); hover=i;
  if(i>=0){ const n=N[i]; tip.style.opacity=1; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY+12)+'px';
    tip.innerHTML='<b>'+n.name+'</b> <span style="color:#6E7B80">'+n.kind+' · '+n.file+':'+n.line+'</span>'; }
  else tip.style.opacity=0;
});
addEventListener('mouseup', ()=>{ dragging=null; panning=false; });
cv.addEventListener('wheel', e=>{ e.preventDefault(); const f=e.deltaY<0?1.1:0.9;
  const mx=e.clientX, my=e.clientY; ox=mx-(mx-ox)*f; oy=my-(my-oy)*f; scale*=f; }, {passive:false});

loop(); // start once every declaration above is initialized (avoids the TDZ on 'dragging')
</script></body></html>`;
}
