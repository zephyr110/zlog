import path from "node:path"
import type { NextConfig } from "next"

const isExport = process.env.NEXT_EXPORT === "true"
const isDesktop = process.env.NEXT_DESKTOP === "true"

const nextConfig: NextConfig = {
  ...(isExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
      }
    : isDesktop
      ? {
          // Desktop only — self-contained server for the Electron shell.
          output: "standalone" as const,
        }
      : {
        // Server/Vercel only — static export cannot emit redirects, so
        // apps/web/src/app/category/[name]/page.tsx handles that path.
        async redirects() {
          return [
            {
              source: "/category/:name",
              destination: "/topics/:name",
              permanent: true,
            },
          ]
        },
      }),
  // Monorepo hardening: pnpm links the @zlog/* workspace packages into
  // node_modules as symlinks. transpilePackages makes Turbopack compile
  // and watch their REAL paths (previously the watcher could silently
  // detach from them — changes to packages/database went unnoticed until
  // the dev server was restarted).
  // next-mdx-remote: needed for Turbopack when the admin preview runs
  // serialize() + MDXRemote on the client (see HashiCorp docs).
  transpilePackages: [
    "@zlog/database",
    "@zlog/core",
    "@zlog/auth",
    "next-mdx-remote",
  ],
  // sharp ships a native .node binary — keep it as a runtime require in
  // serverless (Vercel) builds instead of bundling it into the server
  // chunks, where the platform binary can fail to load and every
  // request to a sharp-importing route 500s (e.g. /api/upload).
  serverExternalPackages: ["sharp", "undici"],
  // Pin the Turbopack root to the pnpm workspace root. The auto-detector
  // walks up for a lockfile and can pick a stray one above the repo
  // (e.g. ~/package-lock.json), setting a root that excludes
  // packages/* — which is what breaks @zlog/* resolution. An explicit
  // root must cover the workspace root (parent of apps/ and packages/),
  // NOT apps/web itself.
  turbopack: {
    // __dirname is apps/web; the workspace root is two levels up.
    root: __dirname,
  },
  // If deploying to a project page (username.github.io/repo-name),
  // uncomment and set this to the repo name:
  // basePath: "/blog",
}

export default nextConfig
