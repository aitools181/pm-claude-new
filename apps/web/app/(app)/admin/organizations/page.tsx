"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError, getCurrentOrg, setCurrentOrg } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Org = { id: string; name: string; slug: string };

export default function OrganizationsPage() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setOrgs(await api<Org[]>("/organizations/mine").catch(() => [])); setCurrent(getCurrentOrg()); }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    try {
      const org = await api<Org>("/organizations", { method: "POST", body: JSON.stringify({ name, slug: slug || name }) });
      toast({ message: "Organization created" });
      setName(""); setSlug(""); await load();
      switchTo(org.id);
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not create organization" }); }
    finally { setBusy(false); }
  }
  function switchTo(id: string) { setCurrentOrg(id); setCurrent(id); toast({ message: "Switched organization" }); setTimeout(() => location.assign("/home"), 400); }

  return (
    <>
      <h1 className="page-title">Organizations</h1>
      <p className="page-sub">Create and switch between organizations. Each organization is fully isolated with its own workspaces, projects, members and roles.</p>
      <div className="builder-grid">
        <div className="gpanel">
          <h3>New organization</h3>
          <label>Name<input className="input" value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} style={{ marginBottom: 6 }} /></label>
          <label>Slug<input className="input mono" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-inc" style={{ marginBottom: 8 }} /></label>
          <button className="btn btn-primary" onClick={create} disabled={!name || busy} style={{ width: "100%" }}>{busy ? "Creating…" : "Create organization"}</button>
        </div>
        <div>
          <table className="exec-table">
            <thead><tr><th>Organization</th><th>Slug</th><th></th></tr></thead>
            <tbody>
              {orgs.length === 0 && <tr><td colSpan={3} className="muted">No organizations.</td></tr>}
              {orgs.map((o) => <tr key={o.id}>
                <td><strong>{o.name}</strong>{current === o.id && <span className="pill open" style={{ marginLeft: 8 }}>current</span>}</td>
                <td className="mono" style={{ fontSize: 12 }}>{o.slug}</td>
                <td style={{ textAlign: "right" }}>{current === o.id ? <span className="muted">active</span> : <button className="btn btn-ghost" onClick={() => switchTo(o.id)}>Switch</button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
