import { FileCheck2, FileWarning, UploadCloud, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { cn } from "@/lib/utils";

export type UploadStatus = "idle" | "selected" | "invalid";

/** Both intake paths feed the same future normalization pipeline. */
export type UploadKind = "demo" | "report";

export interface SelectedUpload {
  name: string;
  sizeMb: string;
}

const REPORT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".csv", ".json", ".pdf"];

const COPY: Record<
  UploadKind,
  { accept: string; dropTitle: TranslationKey; dropHint: TranslationKey; invalid: TranslationKey }
> = {
  demo: {
    accept: ".dem",
    dropTitle: "analyze.demo.dropTitle",
    dropHint: "analyze.demo.dropHint",
    invalid: "analyze.demo.invalid",
  },
  report: {
    accept: REPORT_EXTENSIONS.join(","),
    dropTitle: "analyze.report.dropTitle",
    dropHint: "analyze.report.dropHint",
    invalid: "analyze.report.invalid",
  },
};

function isValid(kind: UploadKind, name: string) {
  const lower = name.toLowerCase();
  if (kind === "demo") return lower.endsWith(".dem");
  return REPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Visual-only intake surface. No storage, no parsing, no network request:
 * it validates the extension and exposes the selected file so a future
 * storage/processing integration can consume it.
 */
export function UploadBox({
  kind = "demo",
  onFileSelected,
}: {
  kind?: UploadKind | undefined;
  onFileSelected?: ((file: File, kind: UploadKind) => void) | undefined;
}) {
  const t = useT();
  const copy = COPY[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [selected, setSelected] = useState<SelectedUpload | null>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!isValid(kind, file.name)) {
      setStatus("invalid");
      setSelected(null);
      return;
    }
    setStatus("selected");
    setSelected({ name: file.name, sizeMb: (file.size / (1024 * 1024)).toFixed(1) });
    onFileSelected?.(file, kind);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const reset = () => {
    setStatus("idle");
    setSelected(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-w-0 flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors sm:px-6 sm:py-12",
          dragging ? "border-primary bg-primary/5" : "border-border bg-card/40",
        )}
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
          <UploadCloud className="size-5 text-primary" aria-hidden />
        </div>
        <p className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
          <span className="sm:hidden">
            {kind === "demo" ? t("analyze.demo.mobileTitle") : t(copy.dropTitle)}
          </span>
          <span className="hidden sm:inline">{t(copy.dropTitle)}</span>
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t(copy.dropHint)} {t("analyze.notSent")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={copy.accept}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          className="mt-6 min-h-11 w-full sm:w-auto"
          onClick={() => inputRef.current?.click()}
        >
          {t("analyze.selectFile")}
        </Button>
      </div>

      {status === "invalid" ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm text-foreground"
        >
          <FileWarning className="size-4 shrink-0 text-destructive" aria-hidden />
          {t(copy.invalid)}
        </div>
      ) : null}

      {status === "selected" && selected ? (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-success/30 bg-success/8 px-4 py-3">
          <FileCheck2 className="size-4 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-foreground">{selected.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {selected.sizeMb} MB · {t("analyze.ready")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={reset}
            aria-label={t("common.remove")}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
