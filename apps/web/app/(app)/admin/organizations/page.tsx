"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
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
          <label>Name<UiInput className="input ui-static-4e420aff" value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }}  /></label>
          <label>Slug<UiInput className="input mono ui-static-fdf33f23" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-inc"  /></label>
          <UiButton variant="primary" className="ui-static-0466783d" onClick={create} disabled={!name || busy} >{busy ? "Creating…" : "Create organization"}</UiButton>
        </div>
        <div>
          <table className="exec-table">
            <thead><tr><th>Organization</th><th>Slug</th><th></th></tr></thead>
            <tbody>
              {orgs.length === 0 && <tr><td colSpan={3} className="muted">No organizations.</td></tr>}
              {orgs.map((o) => <tr key={o.id}>
                <td><strong>{o.name}</strong>{current === o.id && <span className="pill open ui-static-5dd2a678" >current</span>}</td>
                <td className="mono ui-static-6cb285c6" >{o.slug}</td>
                <td className="ui-static-54c2afb7">{current === o.id ? <span className="muted">active</span> : <UiButton variant="tertiary"  onClick={() => switchTo(o.id)}>Switch</UiButton>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
