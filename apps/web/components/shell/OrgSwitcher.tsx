"use client";
import { useEffect, useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { api, getCurrentOrg, setCurrentOrg } from "../../lib/api";

type Org = { id: string; name: string; slug: string };

export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [current, setCurrent] = useState<Org | null>(null);

  useEffect(() => {
    api<Org[]>("/organizations/mine").then((list) => {
      setOrgs(list);
      const saved = getCurrentOrg();
      const pick = list.find((o) => o.id === saved) ?? list[0] ?? null;
      if (pick) { setCurrent(pick); setCurrentOrg(pick.id); }
    }).catch(() => {});
  }, []);

  function choose(o: Org) { setCurrent(o); setCurrentOrg(o.id); location.reload(); }
  const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="orgsw" aria-label="Switch organization">
          <span className="org-avatar">{current ? initials(current.name) : "—"}</span>
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden" }}>
            <span style={{ display: "block", fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{current?.name ?? "Loading…"}</span>
            <span className="mono" style={{ display: "block", fontSize: 12, color: "var(--ink-3)" }}>{current?.slug}</span>
          </span>
          <span aria-hidden style={{ color: "var(--ink-3)" }}>⌄</span>
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu" sideOffset={6} align="start">
          {orgs.map((o) => (
            <Dropdown.Item key={o.id} className="menu-item" onSelect={() => choose(o)}>
              <span className="org-avatar" style={{ width: 22, height: 22, fontSize: 11 }}>{initials(o.name)}</span>
              <span style={{ flex: 1 }}>{o.name}</span>
              {current?.id === o.id && <span style={{ color: "var(--primary)" }}>✓</span>}
            </Dropdown.Item>
          ))}
          {orgs.length === 0 && <div className="menu-item" style={{ color: "var(--ink-3)" }}>No organizations</div>}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
