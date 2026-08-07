"use client";
import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Row = { id: string; key: string; title: string; statusCategory: string };
type Saved = { id: string; name: string; wql: string };

export default function AdvancedSearchPage() {
  const toast = useToast();
  const [wql, setWql] = useState('status = "todo" AND priority = "high"');
  const [rows, setRows] = useState<Row[]>([]); const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);

  const loadSaved = useCallback(async () => setSaved(await api<Saved[]>("/wql/saved", { org: true }).catch(() => [])), []);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function run() {
    setError(null);
    try { const r = await api<{ results: Row[]; capped: boolean }>("/wql/run", { method: "POST", org: true, body: JSON.stringify({ wql }) }); setRows(r.results); setCapped(r.capped); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Query failed"); setRows([]); }
  }
  async function save() { const name = prompt("Name this query"); if (!name) return; try { await api("/wql/saved", { method: "POST", org: true, body: JSON.stringify({ name, wql }) }); toast({ message: "Saved" }); loadSaved(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }

  return (
    <>
      <h1 className="page-title">Advanced search</h1>
      <p className="page-sub">Query with WQL — fields: status, priority, title, owner, project, parent, key, created, updated. Functions: currentUser(). Operators: = != &gt; &lt; ~ IN, with AND/OR/NOT.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input className="input mono" value={wql} onChange={(e) => setWql(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={run}>Run</button>
        <button className="btn" onClick={save}>Save</button>
      </div>
      {saved.length > 0 && <div style={{ marginBottom: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>{saved.map((s) => <button key={s.id} className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setWql(s.wql)}>{s.name}</button>)}</div>}
      {error && <div className="fieldcard" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div>}
      {!error && (
        <table className="exec-table">
          <thead><tr><th>Key</th><th>Title</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="muted">No results (run a query).</td></tr>}
            {rows.map((r) => <tr key={r.id}><td className="mono">{r.key}</td><td>{r.title}</td><td><span className="pill open">{r.statusCategory}</span></td></tr>)}
          </tbody>
        </table>
      )}
      {capped && <p className="muted" style={{ fontSize: 12 }}>Results capped — narrow your query for more.</p>}
    </>
  );
}
