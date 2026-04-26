"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { matchesSearch } from "@lib/search";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Search as IconSearch, ShieldCheck as IconShieldCheck, TriangleAlert as IconAlertTriangle, Flame as IconFlame } from "lucide-react";
import { TrustScoreBadge } from "@/inventory/_components/trust-score-badge";
import type { TrustScoreRow } from "@/inventory/trust-actions";

interface BranchOption {
  id: number;
  name: string;
}

interface Props {
  branchId: number;
  branches: BranchOption[];
  rows: TrustScoreRow[];
  includeComputed: boolean;
}

/**
 * Admin trust-score leaderboard (S15-min).
 *
 * Ranks users by `user_trust_score.score` within the selected branch,
 * with optional live-compute pass (`?computed=1`) that refreshes the top
 * 25 rows via `compute_user_trust_score` RPC.
 *
 * Only visible to users with `reports:view_branch` per the page gate —
 * branch manager + QLV + admin roles.
 */
export function TrustLeaderboardClient({
  branchId,
  branches,
  rows,
  includeComputed,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => matchesSearch([r.fullName], q));
  }, [rows, query]);

  const tierCounts = useMemo(() => {
    const counts = { elite: 0, trusted: 0, bootstrap: 0, at_risk: 0 };
    for (const r of rows) {
      const s = typeof r.computedScore === "number" ? r.computedScore : r.score;
      if (s >= 85) counts.elite += 1;
      else if (s >= 70) counts.trusted += 1;
      else if (s >= 50) counts.bootstrap += 1;
      else counts.at_risk += 1;
    }
    return counts;
  }, [rows]);

  const selectBranchId = String(branchId);

  return (
    <div className="container mx-auto max-w-6xl space-y-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <IconShieldCheck className="size-6 text-tier-elite" />
            Trust leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Điểm tin cậy per (user × chi nhánh). Cổng c8 auto-approve GRN ≥ 70.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={includeComputed ? "default" : "outline"}
            size="sm"
            asChild
          >
            <Link
              href={`/admin/inventory/trust?branchId=${branchId}${
                includeComputed ? "" : "&computed=1"
              }`}
            >
              {includeComputed ? "Live compute: ON" : "Live compute: OFF"}
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <TierCard
          label="Elite (≥ 85)"
          count={tierCounts.elite}
          tone="border-tier-elite/40 bg-tier-elite/10 text-tier-elite"
          icon={<IconShieldCheck className="size-4" />}
        />
        <TierCard
          label="Trusted (≥ 70)"
          count={tierCounts.trusted}
          tone="border-success/40 bg-success/10 text-success"
          icon={<IconShieldCheck className="size-4" />}
        />
        <TierCard
          label="Bootstrap (50-69)"
          count={tierCounts.bootstrap}
          tone="border-info/40 bg-info/10 text-info"
          icon={<IconFlame className="size-4" />}
        />
        <TierCard
          label="At risk (< 50)"
          count={tierCounts.at_risk}
          tone="border-destructive/40 bg-destructive/10 text-destructive"
          icon={<IconAlertTriangle className="size-4" />}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <CardTitle className="text-base">
            Bảng xếp hạng · {rows.length} user
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="space-y-1.5">
              <Label className="sr-only">Chi nhánh</Label>
              <Select
                value={selectBranchId}
                onValueChange={(v) => {
                  const params = new URLSearchParams();
                  params.set("branchId", v);
                  if (includeComputed) params.set("computed", "1");
                  window.location.href = `/admin/inventory/trust?${params.toString()}`;
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative min-w-56">
              <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên…"
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Chi nhánh này chưa có bản ghi trust score."
                : "Không user nào khớp bộ lọc."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Nhân viên</th>
                  <th className="px-3 py-2 text-left font-medium">Tier</th>
                  <th className="px-3 py-2 text-right font-medium">Score (lưu)</th>
                  {includeComputed ? (
                    <th className="px-3 py-2 text-right font-medium">
                      Score (live)
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-right font-medium">GRN 30d</th>
                  <th className="px-3 py-2 text-right font-medium">Incident</th>
                  <th className="px-3 py-2 text-left font-medium">Incident gần nhất</th>
                  <th className="px-3 py-2 text-left font-medium">Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.userId} className="border-t align-middle">
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {r.fullName || "(Chưa cập nhật)"}
                      <div className="text-xs text-muted-foreground">
                        {r.userId.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <TrustScoreBadge
                        score={r.score}
                        computedScore={r.computedScore}
                        compact
                        withTooltip
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Math.round(r.score)}
                    </td>
                    {includeComputed ? (
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums font-medium",
                          typeof r.computedScore === "number" &&
                            Math.abs(r.computedScore - r.score) > 2
                            ? "text-warning-foreground"
                            : "",
                        )}
                      >
                        {typeof r.computedScore === "number"
                          ? Math.round(r.computedScore)
                          : "—"}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.grnCount30d}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.varianceIncidents30d > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 text-destructive"
                        >
                          {r.varianceIncidents30d}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.lastIncidentAt ? formatDate(r.lastIncidentAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(r.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TierCard({
  label,
  count,
  tone,
  icon,
}: {
  label: string;
  count: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
        tone,
      )}
    >
      {icon}
      <div className="flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{count}</div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
