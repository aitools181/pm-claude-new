export type ProviderProbe = { ok: boolean; detail: string; metadata?: Record<string, unknown> };

/** Network-facing adapter boundary. Tests can inject a deterministic probe. */
export async function probeIdentityProvider(input: { kind: "saml" | "oidc"; issuerUrl?: string; metadataUrl?: string }): Promise<ProviderProbe> {
  const url = input.kind === "oidc"
    ? `${(input.issuerUrl ?? "").replace(/\/$/, "")}/.well-known/openid-configuration`
    : input.metadataUrl;
  if (!url) return { ok: false, detail: "Provider URL is required" };
  try {
    const response = await fetch(url, { headers: { Accept: input.kind === "oidc" ? "application/json" : "application/xml,text/xml" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { ok: false, detail: `Provider returned HTTP ${response.status}` };
    if (input.kind === "oidc") {
      const metadata = await response.json() as Record<string, unknown>;
      const issuer = String(metadata.issuer ?? "");
      if (!issuer) return { ok: false, detail: "OIDC discovery document has no issuer" };
      return { ok: true, detail: "OIDC discovery document validated", metadata: { issuer, authorization_endpoint: metadata.authorization_endpoint, token_endpoint: metadata.token_endpoint, jwks_uri: metadata.jwks_uri } };
    }
    const xml = await response.text();
    if (!/EntityDescriptor|IDPSSODescriptor/i.test(xml)) return { ok: false, detail: "SAML metadata does not contain an IdP descriptor" };
    return { ok: true, detail: "SAML metadata endpoint validated", metadata: { bytes: xml.length } };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Identity provider probe failed" };
  }
}
