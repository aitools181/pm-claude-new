"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../../lib/api";

type Node = { id: string; key: string; title: string; statusCategory: string | null; blocked?: boolean; external?: boolean; redacted?: boolean };
type Edge = { id: string; from: string; to: string; type: string };
type Conflict = { dependencyId: string; predecessorId: string; successorId: string; kind: string; predecessorDue: string; successorStart: string };

export default function DependencyGraphPage() {
  const id = useParams().id as string;
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  useEffect(() => {
    api<{ nodes: Node[]; edges: Edge[] }>(`/projects/${id}/dependency-graph`, { org: true }).then((g) => { setNodes(g.nodes); setEdges(g.edges); }).catch(() => {});
    api<Conflict[]>(`/projects/${id}/dependency-conflicts`, { org: true }).then(setConflicts).catch(() => {});
  }, [id]);

  const conflictEdges = useMemo(() => new Set(conflicts.map((c) => c.dependencyId)), [conflicts]);

  // Simple layered layout (Kahn): layer = max(predecessor layer)+1.
  const layout = useMemo(() => {
    const layer = new Map<string, number>();
    const indeg = new Map<string, number>();
    nodes.forEach((n) => indeg.set(n.id, 0));
    edges.forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1));
    let frontier = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
    frontier.forEach((n) => layer.set(n, 0));
    const remaining = new Map(indeg);
    let guard = 0;
    while (frontier.length && guard++ < 1000) {
      const next: string[] = [];
      for (const u of frontier) for (const e of edges.filter((x) => x.from === u)) {
        layer.set(e.to, Math.max(layer.get(e.to) ?? 0, (layer.get(u) ?? 0) + 1));
        remaining.set(e.to, (remaining.get(e.to) ?? 1) - 1);
        if ((remaining.get(e.to) ?? 0) <= 0) next.push(e.to);
      }
      frontier = next;
    }
    const cols = new Map<number, string[]>();
    nodes.forEach((n) => { const l = layer.get(n.id) ?? 0; cols.set(l, [...(cols.get(l) ?? []), n.id]); });
    const pos = new Map<string, { x: number; y: number }>();
    for (const [l, ids] of cols) ids.forEach((nid, i) => pos.set(nid, { x: 30 + l * 220, y: 30 + i * 78 }));
    const width = 30 + (Math.max(0, ...[...cols.keys()]) + 1) * 220 + 160;
    const height = 30 + Math.max(1, ...[...cols.values()].map((v) => v.length)) * 78 + 20;
    return { pos, width, height };
  }, [nodes, edges]);

  const W = 168, H = 52;
  const nodeById = (nid: string) => nodes.find((n) => n.id === nid);

  return (
    <>
      <div className="ui-static-aba76af3">
        <h1 className="page-title ui-static-ef0b7a11" >Dependencies</h1>
        <a className="btn" href={`/projects/${id}`}>← Project</a>
      </div>

      {conflicts.length > 0 && (
        <div className="callout callout-danger ui-static-87c136df" >
          <strong>{conflicts.length} dependency conflict(s)</strong> — shown as warnings only; V1 never reschedules automatically.
          {conflicts.map((c) => {
            const p = nodeById(c.predecessorId), s = nodeById(c.successorId);
            return <div key={c.dependencyId} className="ui-static-5661dcc8">{s?.key ?? "?"} starts {c.successorStart} but {p?.key ?? "?"} is due {c.predecessorDue}.</div>;
          })}
        </div>
      )}

      <div className="dep-wrap">
        <svg width={Math.max(layout.width, 400)} height={Math.max(layout.height, 200)} className="ui-static-2a1b75c9">
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--ink-3)" /></marker></defs>
          {edges.map((e) => {
            const a = layout.pos.get(e.from), b = layout.pos.get(e.to); if (!a || !b) return null;
            const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
            const mx = (x1 + x2) / 2;
            return <path key={e.id} className={`dep-edge ${conflictEdges.has(e.id) ? "conflict" : ""}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} data-conflict={conflictEdges.has(e.id) || undefined} />;
          })}
          {nodes.map((n) => {
            const p = layout.pos.get(n.id); if (!p) return null;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`}>
                <rect className={`dep-node ${n.blocked ? "blocked" : ""} ${n.redacted ? "redacted" : ""}`} width={W} height={H} rx={8} />
                <text className="dep-node-key" x={10} y={18}>{n.redacted ? "🔒" : n.key}</text>
                <text className="dep-node-title" x={10} y={36}>{(n.title ?? "").slice(0, 22)}</text>
                {n.blocked && <text x={W - 12} y={18} textAnchor="end" fontSize="10" fill="var(--danger)">● blocked</text>}
                {n.external && !n.redacted && <text x={W - 12} y={36} textAnchor="end" fontSize="10" fill="var(--primary)">ext</text>}
              </g>
            );
          })}
          {nodes.length === 0 && <text x={20} y={40} fill="var(--ink-3)">No dependencies in this project yet.</text>}
        </svg>
      </div>
    </>
  );
}
