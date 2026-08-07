import { redirect } from "next/navigation";

async function setupCompleted(): Promise<boolean> {
  const base = (process.env.API_URL ?? "http://localhost:4000") + "/api/v1";
  try {
    const res = await fetch(`${base}/auth/setup/status`, { cache: "no-store" });
    const data = await res.json();
    return !!data.completed;
  } catch { return false; }
}

export default async function Index() {
  redirect((await setupCompleted()) ? "/login" : "/setup");
}
