"use client";

import { useMemo, useState, type ReactNode } from "react";

export function Table({ children, caption, className = "" }: { children: ReactNode; caption?: string; className?: string }) {
  return <div className={`ui-table-scroll ${className}`.trim()}><table className="ui-table">{caption ? <caption>{caption}</caption> : null}{children}</table></div>;
}

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  sortValue?: (row: T) => string | number;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  empty,
  selectedKeys,
  onSelect,
  className = "",
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
  selectedKeys?: Set<string>;
  onSelect?: (key: string, checked: boolean) => void;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: string; direction: "ascending" | "descending" } | null>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return rows;
    const direction = sort.direction === "ascending" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [columns, rows, sort]);

  const toggleSort = (key: string) => {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
      : { key, direction: "ascending" });
  };

  return (
    <div className={`ui-table-scroll ${className}`.trim()}>
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>
          {onSelect ? <th className="ui-table-select" scope="col"><span className="sr-only">Select</span></th> : null}
          {columns.map((column) => {
            const activeSort = sort?.key === column.key ? sort.direction : undefined;
            return <th key={column.key} scope="col" data-align={column.align || "left"} aria-sort={activeSort || "none"}>
              {column.sortValue ? <button type="button" className="ui-table-sort" onClick={() => toggleSort(column.key)}>{column.header}<span aria-hidden="true">{activeSort === "ascending" ? "↑" : activeSort === "descending" ? "↓" : "↕"}</span></button> : column.header}
            </th>;
          })}
        </tr></thead>
        <tbody>{sortedRows.length ? sortedRows.map((row) => {
          const key = rowKey(row);
          return <tr key={key} data-selected={selectedKeys?.has(key) || undefined}>
            {onSelect ? <td className="ui-table-select"><input type="checkbox" aria-label={`Select row ${key}`} checked={selectedKeys?.has(key) || false} onChange={(e) => onSelect(key, e.target.checked)} /></td> : null}
            {columns.map((column) => <td key={column.key} data-align={column.align || "left"}>{column.render(row)}</td>)}
          </tr>;
        }) : <tr><td colSpan={columns.length + (onSelect ? 1 : 0)} className="ui-table-empty">{empty || "No data"}</td></tr>}</tbody>
      </table>
    </div>
  );
}
