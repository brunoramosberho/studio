"use client";

import { useMemo, useState } from "react";
import { Download, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatTableProps {
  /** Raw rows as parsed from markdown pipe tables. First row is the header. */
  rows: string[][];
  /** Optional title for the table (used as filename for the CSV). */
  title?: string;
}

/**
 * Renders a markdown table with a CSV download button.
 * Used inside Spark chat messages to surface structured data.
 */
export function ChatTable({ rows, title }: ChatTableProps) {
  const [copied, setCopied] = useState(false);

  const { header, body, isNumericCol } = useMemo(() => {
    if (rows.length === 0) {
      return { header: [], body: [], isNumericCol: [] as boolean[] };
    }
    const header = rows[0].map((c) => c.trim());
    const body = rows.slice(1).map((r) => r.map((c) => c.trim()));
    const isNumericCol = header.map((_, colIdx) => {
      if (body.length === 0) return false;
      return body.every((row) => {
        const cell = row[colIdx] ?? "";
        if (!cell) return false;
        // Allow numbers, currency, percentages, comma separators
        return /^-?[$€£¥]?\s*-?[\d,.\s]+%?\s*(MXN|USD|EUR)?$/i.test(cell);
      });
    });
    return { header, body, isNumericCol };
  }, [rows]);

  if (rows.length === 0) return null;

  function toCsv(): string {
    const escape = (v: string) => {
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const lines = [
      header.map(escape).join(","),
      ...body.map((row) => row.map(escape).join(",")),
    ];
    return lines.join("\n");
  }

  function handleDownload() {
    const csv = toCsv();
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const safeTitle = (title ?? "spark-data")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40) || "spark-data";
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 bg-surface/50 px-3.5 py-2.5">
        <span className="text-[12px] font-semibold text-foreground">
          {title ?? "Datos"}
        </span>
        <button
          onClick={handleDownload}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-all",
            "hover:bg-admin/10 hover:text-admin",
          )}
          title="Descargar como CSV"
          aria-label="Descargar como CSV"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-surface/30">
              {header.map((cell, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted",
                    isNumericCol[i] ? "text-right" : "text-left",
                  )}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-border/40 last:border-0 transition-colors hover:bg-surface/30"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "px-3.5 py-2.5 text-foreground",
                      isNumericCol[ci] ? "text-right font-mono tabular-nums" : "text-left",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
