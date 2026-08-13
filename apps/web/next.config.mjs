/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "" },
  async rewrites() {
    // Browser traffic stays same-origin by default. In Docker INTERNAL_API_URL
    // points at the api service; during local `next dev`, API_URL/localhost works.
    const api = process.env.INTERNAL_API_URL ?? process.env.API_URL ?? "http://localhost:4000";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      // Socket.IO uses HTTP polling for negotiation and then upgrades to WS.
      // Keeping the public path same-origin preserves the authenticated cookie.
      { source: "/socket.io/:path*", destination: `${api}/socket.io/:path*` },
    ];
  },
};
export default nextConfig;
