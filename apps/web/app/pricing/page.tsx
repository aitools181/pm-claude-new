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
    <div className="ui-static-3335a645">
      <h1 className="ui-static-b7ae515f">Plans &amp; pricing</h1>
      <p className="muted ui-static-d462248a" >Every plan includes the core work management experience. Higher tiers raise limits and unlock optional modules.</p>
      <div className="ui-static-97355caf">
        <button className={`btn ${!yearly ? "btn-primary" : ""}`} onClick={() => setYearly(false)}>Monthly</button>
        <button className={`btn ${yearly ? "btn-primary" : ""}`} onClick={() => setYearly(true)}>Yearly</button>
      </div>
      {loaded && plans.length === 0 && <div className="fieldcard"><p>Pricing has not been published yet. A platform administrator can install plans from the platform console.</p></div>}
      <div className="ui-static-97e5a4e4">
        {plans.map((p) => (
          <div className="fieldcard ui-static-a56c85e3" key={p.key} >
            <div>
              <h2 className="ui-static-b3740685">{p.name}</h2>
              <p className="muted ui-static-55cac5e0" >{p.description}</p>
            </div>
            <div className="ui-static-44e3110e">
              {money(yearly ? p.priceYearly : p.priceMonthly, p.currency)}
              <span className="muted ui-static-57a3141d" >{yearly ? "/year" : "/month"}</span>
            </div>
            <ul className="ui-static-9e267c89">
              <li>{p.limits?.maxMembers ?? "Unlimited"} members</li>
              <li>{p.limits?.maxProjects ?? "Unlimited"} projects</li>
              <li>{p.limits?.maxWorkItems ?? "Unlimited"} work items</li>
              <li>{p.modules.length ? `${p.modules.length} optional modules` : "Core modules"}</li>
            </ul>
            {p.modules.length > 0 && <p className="muted mono ui-static-1b014dc5" >{p.modules.join(" · ")}</p>}
            <a className="btn btn-primary ui-static-2e5cdd67" href="/setup" >Get started</a>
          </div>
        ))}
      </div>
    </div>
  );
}
