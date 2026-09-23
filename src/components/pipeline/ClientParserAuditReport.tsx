import { Badge } from "@/components/ui/badge";
import type { ClientParserProgress } from "@/lib/client-parser/clientParser.service";
import type { ClientParserEnvelope } from "@/lib/client-parser/clientParser.types";

type Verification = {
  accepted: boolean;
  canonicalAdmission: "BLOCKED";
  persisted: false;
  reasonCode?: string;
};

type AuditStatus = "PASS" | "FAIL" | "NOT RUN" | "UNAVAILABLE" | "BLOCKED" | "UNKNOWN";

interface AuditSection {
  label: string;
  status: AuditStatus;
  evidence: string;
}

function statusClass(status: AuditStatus) {
  if (status === "PASS") return "border-success/30 bg-success/10 text-success";
  if (status === "FAIL") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (status === "BLOCKED") return "border-warning/30 bg-warning/10 text-warning";
  if (status === "UNAVAILABLE") return "border-info/30 bg-info/10 text-info";
  return "border-border bg-muted text-muted-foreground";
}

function eventEvidence(result: ClientParserEnvelope["result"], names: string[]) {
  const events = result.parsedEventInventory.filter((item) => names.includes(item.name));
  const parsed = events.filter((item) => item.status === "PRESENT_AND_PARSED");
  const failed = events.filter((item) => item.status === "PRESENT_BUT_FAILED");
  const count = parsed.reduce((total, item) => total + (item.count ?? 0), 0);
  if (failed.length) return { status: "FAIL" as const, evidence: `${failed.length} query failed` };
  if (parsed.length) return { status: "PASS" as const, evidence: `${count} observed` };
  return { status: "UNAVAILABLE" as const, evidence: "Not present in this DEM" };
}

function sectionsFor(
  result: ClientParserEnvelope | null,
  verification: Verification | null,
): AuditSection[] {
  if (!result) {
    return [
      "Metadata",
      "Fields",
      "Players",
      "Teams",
      "Rounds",
      "Events",
      "Ticks",
      "Bombs",
      "Deaths",
      "Damage",
      "Parity",
      "Determinism",
      "Validation",
    ].map((label) => ({ label, status: "NOT RUN", evidence: "No local DEM execution" }));
  }

  const parsed = result.result;
  const metadata = parsed.header["values"];
  const metadataFields =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? Object.keys(metadata).length
      : 0;
  const fieldCount = new Set(parsed.parsedEventInventory.flatMap((item) => item.fields)).size;
  const teamFields = parsed.parsedEventInventory.filter((item) =>
    item.fields.some((field) => field.includes("team") || field.includes("side")),
  ).length;
  const eventsFailed = parsed.parsedEventInventory.filter(
    (item) => item.status === "PRESENT_BUT_FAILED",
  ).length;
  const bombs = eventEvidence(parsed, [
    "bomb_planted",
    "bomb_defused",
    "bomb_exploded",
    "bomb_beginplant",
    "bomb_begindefuse",
    "bomb_abortplant",
    "bomb_abortdefuse",
    "bomb_dropped",
    "bomb_pickup",
  ]);
  const deaths = eventEvidence(parsed, ["player_death"]);
  const damage = eventEvidence(parsed, ["player_hurt", "bullet_damage"]);

  return [
    {
      label: "Metadata",
      status: metadataFields > 0 ? "PASS" : "UNAVAILABLE",
      evidence: `${metadataFields} observed fields`,
    },
    {
      label: "Fields",
      status: fieldCount > 0 ? "PASS" : "UNAVAILABLE",
      evidence: `${fieldCount} unique event fields`,
    },
    {
      label: "Players",
      status: parsed.playerInventory.status === "AVAILABLE" ? "PASS" : "UNAVAILABLE",
      evidence:
        parsed.playerInventory.status === "AVAILABLE"
          ? `${parsed.playerInventory.count ?? 0} observed`
          : "parsePlayerInfo unavailable",
    },
    {
      label: "Teams",
      status: teamFields > 0 ? "PASS" : "UNAVAILABLE",
      evidence:
        teamFields > 0 ? `${teamFields} event schemas expose team/side` : "No direct team proof",
    },
    {
      label: "Rounds",
      status: parsed.roundEvidence.length > 0 ? "PASS" : "UNAVAILABLE",
      evidence: `${parsed.roundEvidence.length} bounded references`,
    },
    {
      label: "Events",
      status: eventsFailed > 0 ? "FAIL" : "PASS",
      evidence: `${parsed.eventDiscovery.discoveredEventCount} discovered · ${eventsFailed} failed`,
    },
    {
      label: "Ticks",
      status: parsed.tickProbe.status === "AVAILABLE" ? "PASS" : "UNAVAILABLE",
      evidence: `${parsed.tickProbe.returnedTickCount}/${parsed.tickProbe.requestedTickCount} sampled`,
    },
    { label: "Bombs", ...bombs },
    { label: "Deaths", ...deaths },
    { label: "Damage", ...damage },
    { label: "Parity", status: "NOT RUN", evidence: "Python reference required" },
    { label: "Determinism", status: "NOT RUN", evidence: "Two runs per runtime required" },
    {
      label: "Validation",
      status: verification ? (verification.accepted ? "PASS" : "FAIL") : "NOT RUN",
      evidence: verification
        ? verification.accepted
          ? "Untrusted result validated"
          : (verification.reasonCode ?? "Rejected")
        : "Server validation not requested",
    },
  ];
}

export function ClientParserAuditReport({
  result,
  verification,
  progress,
}: {
  result: ClientParserEnvelope | null;
  verification: Verification | null;
  progress: ClientParserProgress | null;
}) {
  const sections = sectionsFor(result, verification);
  const parser = result?.result.parser;
  const performance = result?.result.performance;

  return (
    <section
      className="space-y-4 border-t border-border pt-5"
      aria-labelledby="forensic-audit-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Forensic manifest</p>
          <h2 id="forensic-audit-title" className="mt-1 font-display text-lg font-semibold">
            Evidência de execução
          </h2>
        </div>
        <Badge variant="outline" className={statusClass("BLOCKED")}>
          CANONICAL BLOCKED
        </Badge>
      </div>

      <dl className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Identity label="Version" value={parser?.version ?? "NOT RUN"} />
        <Identity label="Revision" value={parser?.artifact.sourceCommit ?? "NOT RUN"} mono />
        <Identity
          label="Browser contract"
          value={result ? String(result.manifest.contractVersion) : "NOT RUN"}
        />
        <Identity label="Runtime" value={parser?.runtime ?? "NOT RUN"} />
        <Identity label="Worker" value={progress?.stage ?? (result ? "COMPLETE" : "IDLE")} />
        <Identity
          label="Duration"
          value={performance ? `${performance.totalDurationMs.toFixed(1)} ms` : "NOT RUN"}
        />
        <Identity
          label="Memory"
          value={
            performance?.memory.status === "OBSERVED" && performance.memory.usedBytes !== null
              ? `${performance.memory.usedBytes} bytes`
              : "UNAVAILABLE"
          }
        />
        <Identity
          label="Coverage"
          value={result?.result.coverage.fullTickDomain ? "FULL" : result ? "SAMPLED" : "NOT RUN"}
        />
      </dl>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            key={section.label}
            className="flex min-h-20 items-start justify-between gap-3 border border-border bg-card/40 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{section.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{section.evidence}</p>
            </div>
            <Badge variant="outline" className={statusClass(section.status)}>
              {section.status}
            </Badge>
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between gap-4 border border-warning/30 bg-warning/8 p-4">
        <div>
          <p className="text-sm font-semibold text-warning">Canonical Admission</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Parity, determinism, provenance and server-owned evidence remain mandatory.
          </p>
        </div>
        <Badge variant="outline" className={statusClass("BLOCKED")}>
          BLOCKED
        </Badge>
      </div>
    </section>
  );
}

function Identity({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`${mono ? "font-mono text-xs" : "text-sm"} mt-1 break-all text-foreground`}>
        {value}
      </dd>
    </div>
  );
}
