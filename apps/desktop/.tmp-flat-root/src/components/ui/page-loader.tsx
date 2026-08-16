"use client"

import { useT } from "@/components/layout/trans"

export function PageLoader() {
  const { t } = useT()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <style>{`
        .page-loader-text {
          width: fit-content;
          font-weight: bold;
          font-family: monospace;
          font-size: 30px;
          background: radial-gradient(circle closest-side, hsl(var(--foreground)) 94%, transparent) right/calc(200% - 1em) 100%;
          animation: page-loader-shimmer 1s infinite alternate linear;
        }
        .page-loader-text::before {
          content: "${t("site.loading")}";
          line-height: 1em;
          color: transparent;
          background: inherit;
          background-image: radial-gradient(circle closest-side, hsl(var(--background)) 94%, hsl(var(--foreground)));
          -webkit-background-clip: text;
          background-clip: text;
        }
        @keyframes page-loader-shimmer {
          100% { background-position: left; }
        }
      `}</style>
      <div className="page-loader-text" />
    </div>
  )
}
