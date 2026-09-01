import { FileCheck2, FileWarning, UploadCloud, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UploadStatus = "idle" | "selected" | "invalid";

export interface SelectedDemo {
  name: string;
  sizeMb: string;
}

/**
 * Visual-only upload surface. No storage, no parsing, no network request:
 * the component just validates the `.dem` extension and exposes the selected
 * file so a future storage/processing integration can consume it.
 */
export function UploadBox({
  onFileSelected,
}: {
  onFileSelected?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [selected, setSelected] = useState<SelectedDemo | null>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".dem")) {
      setStatus("invalid");
      setSelected(null);
      return;
    }
    setStatus("selected");
    setSelected({ name: file.name, sizeMb: (file.size / (1024 * 1024)).toFixed(1) });
    onFileSelected?.(file);
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
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-card/40",
        )}
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
          <UploadCloud className="size-5 text-primary" aria-hidden />
        </div>
        <p className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
          Arraste sua demo .dem aqui
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Somente arquivos <span className="font-mono text-foreground">.dem</span> são aceitos. Nesta
          etapa o arquivo não é enviado nem processado.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".dem"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button className="mt-6" onClick={() => inputRef.current?.click()}>
          Selecionar arquivo
        </Button>
      </div>

      {status === "invalid" ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm text-foreground"
        >
          <FileWarning className="size-4 shrink-0 text-destructive" aria-hidden />
          Formato inválido. Selecione um arquivo com extensão .dem.
        </div>
      ) : null}

      {status === "selected" && selected ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/8 px-4 py-3">
          <FileCheck2 className="size-4 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{selected.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {selected.sizeMb} MB · pronto para envio (processamento indisponível nesta etapa)
            </p>
          </div>
          <button
            onClick={reset}
            aria-label="Remover arquivo"
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
