import type { ReactNode } from "react";

// Cabeçalho das páginas internas, no mesmo tom do topo da home.
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="wrap">
        <h1>{title}</h1>
        {children ? <p className="page-sub">{children}</p> : null}
      </div>
    </header>
  );
}
