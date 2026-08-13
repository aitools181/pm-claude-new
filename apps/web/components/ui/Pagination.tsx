"use client";

import { Icon } from "./Icon";

export function Pagination({ page, pageCount, onPageChange, ariaLabel = "Pagination", siblingCount = 1 }: { page: number; pageCount: number; onPageChange: (page: number) => void; ariaLabel?: string; siblingCount?: number }) {
  const safePage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
  const start = Math.max(1, safePage - siblingCount);
  const end = Math.min(pageCount, safePage + siblingCount);
  const pages = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
  return (
    <nav className="ui-pagination" aria-label={ariaLabel}>
      <button type="button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}><Icon name="arrowLeft" size={18} /></button>
      {start > 1 ? <><button type="button" onClick={() => onPageChange(1)} aria-current={safePage === 1 ? "page" : undefined}>1</button>{start > 2 ? <span aria-hidden="true">…</span> : null}</> : null}
      {pages.map((item) => <button key={item} type="button" onClick={() => onPageChange(item)} aria-current={safePage === item ? "page" : undefined} data-active={safePage === item || undefined}>{item}</button>)}
      {end < pageCount ? <>{end < pageCount - 1 ? <span aria-hidden="true">…</span> : null}<button type="button" onClick={() => onPageChange(pageCount)} aria-current={safePage === pageCount ? "page" : undefined}>{pageCount}</button></> : null}
      <button type="button" aria-label="Next page" disabled={safePage >= pageCount} onClick={() => onPageChange(safePage + 1)}><Icon name="chevronRight" size={18} /></button>
    </nav>
  );
}
