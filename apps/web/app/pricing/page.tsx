"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Plan = { key: string; name: string; description: string | null; currency: string; priceMonthly: number; priceYearly: number; limits: Record<string, number | null>; modules: string[] };
const money = (minor: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(minor / 100);

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [yearly, setYearly] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { api<Plan[]>("/pricing").then(setPlans).catch(() => setPlans([])).finally(() => setLoaded(true)); }, []);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 6 }}>Plans &amp; pricing</h1>
      <p className="muted" style={{ marginTop: 0 }}>Every plan includes the core work management experience. Higher tiers raise limits and unlock optional modules.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "20px 0 28px" }}>
        <button className={`btn ${!yearly ? "btn-primary" : ""}`} onClick={() => setYearly(false)}>Monthly</button>
        <button className={`btn ${yearly ? "btn-primary" : ""}`} onClick={() => setYearly(true)}>Yearly</button>
      </div>
      {loaded && plans.length === 0 && <div className="fieldcard"><p>Pricing has not been published yet. A platform administrator can install plans from the platform console.</p></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
        {plans.map((p) => (
          <div className="fieldcard" key={p.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>{p.name}</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13, minHeight: 38 }}>{p.description}</p>
            </div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              {money(yearly ? p.priceYearly : p.priceMonthly, p.currency)}
              <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{yearly ? "/year" : "/month"}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              <li>{p.limits?.maxMembers ?? "Unlimited"} members</li>
              <li>{p.limits?.maxProjects ?? "Unlimited"} projects</li>
              <li>{p.limits?.maxWorkItems ?? "Unlimited"} work items</li>
              <li>{p.modules.length ? `${p.modules.length} optional modules` : "Core modules"}</li>
            </ul>
            {p.modules.length > 0 && <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>{p.modules.join(" · ")}</p>}
            <a className="btn btn-primary" href="/setup" style={{ marginTop: "auto", textAlign: "center" }}>Get started</a>
          </div>
        ))}
      </div>
    </div>
  );
}
