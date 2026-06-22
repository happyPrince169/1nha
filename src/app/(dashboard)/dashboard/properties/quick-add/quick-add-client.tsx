"use client";

import { startTransition, useActionState, useRef, useState } from "react";

import {
  extractPropertyFromTextAction,
  extractPropertyFromImageAction,
  type QuickAddState,
  type ImageExtractState,
} from "./actions";
import {
  processImageForOcr,
  ERR_OCR_NOT_IMAGE,
} from "@/lib/images/client-image-processing";
import { createProperty } from "../new/actions";
import { PropertyForm } from "../property-form";
import type { PropertyFormDefaults } from "../property-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatVND } from "@/utils";

const textInitialState: QuickAddState = { draft: null, rawText: null, error: null };
const imageInitialState: ImageExtractState = { draft: null, rawText: null, error: null };

// ---------------------------------------------------------------------------
// Mode tab
// ---------------------------------------------------------------------------
type Mode = "text" | "image";

function ModeTabs({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      role="tablist"
      className="grid grid-cols-2 rounded-lg border border-border bg-muted/50 p-1"
    >
      {(["text", "image"] as Mode[]).map((m) => (
        <button
          key={m}
          role="tab"
          type="button"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          className={[
            "rounded-md px-3 py-2 text-sm font-medium transition-all outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            mode === m
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          {m === "text" ? "📝 Dán văn bản" : "🖼️ Tải ảnh lên"}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1a — raw text input
// ---------------------------------------------------------------------------
function TextInputStep({
  isPending,
  error,
}: {
  isPending: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}

      <Card>
        <CardHeader>
          <CardTitle>Dán văn bản bất động sản</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="raw_text">
              Văn bản thô (tin nhắn, mô tả, ghi chú…)
            </Label>
            <Textarea
              id="raw_text"
              name="raw_text"
              rows={10}
              placeholder={TEXT_PLACEHOLDER}
              disabled={isPending}
              className="font-mono text-sm leading-relaxed"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Tối đa 4000 ký tự. AI sẽ tự động nhận diện loại nhà, vị trí, giá,
            diện tích và các thông tin khác.
          </p>
        </CardContent>
      </Card>

      <Button
        type="submit"
        className="h-12 w-full text-base"
        disabled={isPending}
      >
        {isPending ? "Đang trích xuất…" : "✨ Trích xuất bằng AI"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1b — image upload input
//
// Phone-camera photos are large (often 3–12 MB) and frequently HEIC, which the
// Server Action body limit / vision API would reject as a raw server error.
// We optimize each image to a small JPEG on the client BEFORE submitting, then
// dispatch the processed file to the OCR action. HEIC/oversized cases surface
// as friendly Vietnamese guidance instead of a server crash.
// ---------------------------------------------------------------------------
// "image/*" so phone cameras/galleries (incl. HEIC) can be selected; the client
// preprocessor validates and converts, with the server repeating the checks.
const ACCEPTED = "image/*";

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ImageInputStep({
  isPending,
  formAction,
  serverError,
}: {
  isPending: boolean;
  formAction: (formData: FormData) => void;
  serverError: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedNote, setProcessedNote] = useState<string | null>(null);

  const busy = isPending || isProcessing;

  function resetPreview(next: string | null) {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    setProcessedNote(null);
    const selected = e.target.files?.[0] ?? null;

    if (!selected) {
      setFile(null);
      resetPreview(null);
      return;
    }

    // Accept anything that plausibly is an image; preprocessing does the real
    // validation/conversion. Empty MIME types are common for camera files.
    const plausible =
      selected.type.startsWith("image/") ||
      /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(selected.name);
    if (!plausible) {
      setClientError(ERR_OCR_NOT_IMAGE);
      setFile(null);
      resetPreview(null);
      e.target.value = "";
      return;
    }

    setFile(selected);
    // Preview may not render for HEIC on some browsers — that's fine, the
    // filename chip below still confirms the selection.
    try {
      resetPreview(URL.createObjectURL(selected));
    } catch {
      resetPreview(null);
    }
  }

  function clearSelection() {
    setFile(null);
    resetPreview(null);
    setClientError(null);
    setProcessedNote(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || busy) return;

    setClientError(null);
    setProcessedNote(null);
    setIsProcessing(true);

    try {
      const result = await processImageForOcr(file);
      setProcessedNote(
        result.optimized
          ? `Đã tối ưu: ${result.file.name} · ${formatMB(result.sizeBytes)}`
          : `Đọc ảnh gốc (không cần tối ưu) · ${formatMB(result.sizeBytes)}`
      );

      const formData = new FormData();
      formData.append("image", result.file);
      // Dispatch the optimized (or raw-fallback) image to the Server Action.
      startTransition(() => formAction(formData));
    } catch (err) {
      setClientError(
        err instanceof Error ? err.message : "Không xử lý được ảnh này."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  const displayError = clientError ?? serverError;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {displayError && <FormError>{displayError}</FormError>}

      <Card>
        <CardHeader>
          <CardTitle>Tải ảnh bất động sản</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Drop zone / file picker */}
          <div
            onClick={() => !busy && inputRef.current?.click()}
            onKeyDown={(ev) => {
              if ((ev.key === "Enter" || ev.key === " ") && !busy)
                inputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="Chọn ảnh để tải lên"
            className={[
              "flex min-h-[160px] cursor-pointer flex-col items-center justify-center",
              "rounded-lg border-2 border-dashed transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              busy
                ? "cursor-not-allowed border-border opacity-50"
                : "border-border hover:border-primary/60 hover:bg-muted/40",
            ].join(" ")}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Xem trước ảnh đã chọn"
                className="max-h-64 w-full rounded-md object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
                <span className="text-4xl leading-none" aria-hidden>
                  🖼️
                </span>
                <p className="text-sm font-medium">
                  Nhấn để chọn ảnh hoặc kéo thả vào đây
                </p>
                <p className="text-xs">
                  Ảnh chụp từ điện thoại, ảnh chụp màn hình, JPG · PNG · WebP
                </p>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            id="image"
            name="image"
            type="file"
            accept={ACCEPTED}
            disabled={busy}
            onChange={handleFileChange}
            className="sr-only"
          />

          {/* Selected-file chip + processing status */}
          {file && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <p className="truncate">
                📎 {file.name} · {formatMB(file.size)}
              </p>
              {isProcessing && <p>⚙️ Đang tối ưu ảnh…</p>}
              {isPending && <p>🔍 Đang đọc ảnh…</p>}
              {!busy && processedNote && (
                <p className="text-emerald-600 dark:text-emerald-400">
                  ✓ Đã tối ưu: {processedNote}
                </p>
              )}
            </div>
          )}

          {file && !busy && (
            <button
              type="button"
              onClick={clearSelection}
              className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Xoá ảnh đã chọn
            </button>
          )}

          <p className="text-xs text-muted-foreground">
            AI sẽ đọc toàn bộ văn bản trong ảnh, sau đó tự động nhận diện thông
            tin bất động sản.
          </p>
        </CardContent>
      </Card>

      <Button
        type="submit"
        className="h-12 w-full text-base"
        disabled={busy || !file}
      >
        {isProcessing
          ? "Đang tối ưu ảnh…"
          : isPending
            ? "Đang đọc ảnh…"
            : "✨ Trích xuất từ ảnh"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// RawTextPreview — collapsible block shown above the prefilled form
// ---------------------------------------------------------------------------
function RawTextPreview({ rawText }: { rawText: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex w-full items-center justify-between gap-2 px-4 py-3",
          "text-sm font-medium text-muted-foreground",
          "hover:text-foreground transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-lg",
        ].join(" ")}
        aria-expanded={open}
      >
        <span>📄 Văn bản trích xuất từ ảnh</span>
        <span
          className="text-xs transition-transform duration-200"
          aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
            {rawText}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraftHighlights — surfaces the four fields most likely to have errors
// ---------------------------------------------------------------------------
const LEGAL_LABELS: Record<string, string> = {
  red_book: "Sổ đỏ",
  pink_book: "Sổ hồng",
  sale_contract: "HĐ mua bán",
  hand_written: "Giấy tay",
  other: "Khác",
};

function DraftHighlights({ draft }: { draft: PropertyFormDefaults }) {
  const rows: { label: string; value: string; warn?: boolean }[] = [
    {
      label: "Giá",
      value: draft.price ? formatVND(Number(draft.price)) : "Không rõ",
      warn: !draft.price,
    },
    {
      label: "Diện tích",
      value: draft.area ? `${draft.area} m²` : "Không rõ",
      warn: !draft.area,
    },
    {
      label: "Quận/Huyện",
      value: draft.district ?? "Không rõ",
      warn: !draft.district,
    },
    {
      label: "Pháp lý",
      value: draft.legal_status ? (LEGAL_LABELS[draft.legal_status] ?? draft.legal_status) : "Không rõ",
      warn: !draft.legal_status,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(({ label, value, warn }) => (
        <div
          key={label}
          className={[
            "rounded-lg border px-3 py-2",
            warn
              ? "border-amber-400/40 bg-amber-50 dark:bg-amber-950/40"
              : "border-border bg-muted/40",
          ].join(" ")}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p
            className={[
              "mt-0.5 text-sm font-semibold",
              warn ? "text-amber-700 dark:text-amber-400" : "",
            ].join(" ")}
          >
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — review & save (shared by both modes)
// ---------------------------------------------------------------------------
function ReviewStep({
  draft,
  rawText,
  sourceMode,
}: {
  draft: NonNullable<QuickAddState["draft"]>;
  rawText: string | null;
  sourceMode: Mode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Source label */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        {sourceMode === "image" ? "🖼️" : "✨"} AI đã tự điền thông tin
        {sourceMode === "image" ? " từ ảnh" : ""}. Vui lòng kiểm tra lại{" "}
        <strong>giá, diện tích và pháp lý</strong> trước khi lưu.
      </div>

      {/* Key-field highlights */}
      <DraftHighlights draft={draft} />

      {/* Collapsible raw-text preview (image mode only) */}
      {sourceMode === "image" && rawText && (
        <RawTextPreview rawText={rawText} />
      )}

      <PropertyForm
        action={createProperty}
        defaultValues={draft}
        submitLabel="Lưu bất động sản"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextQuickAdd — manages the text extraction sub-flow
// ---------------------------------------------------------------------------
function TextQuickAdd() {
  const [state, formAction, isPending] = useActionState(
    extractPropertyFromTextAction,
    textInitialState
  );

  if (state.draft) {
    return (
      <ReviewStep
        draft={state.draft}
        rawText={state.rawText}
        sourceMode="text"
      />
    );
  }

  return (
    <form action={formAction}>
      <TextInputStep isPending={isPending} error={state.error} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// ImageQuickAdd — manages the image extraction sub-flow
// ---------------------------------------------------------------------------
function ImageQuickAdd() {
  const [state, formAction, isPending] = useActionState(
    extractPropertyFromImageAction,
    imageInitialState
  );

  if (state.draft) {
    return (
      <ReviewStep
        draft={state.draft}
        rawText={state.rawText}
        sourceMode="image"
      />
    );
  }

  return (
    <ImageInputStep
      isPending={isPending}
      formAction={formAction}
      serverError={state.error}
    />
  );
}

// ---------------------------------------------------------------------------
// QuickAddClient — top-level orchestrator with mode switcher
// ---------------------------------------------------------------------------
export function QuickAddClient() {
  const [mode, setMode] = useState<Mode>("text");

  return (
    <div className="flex flex-col gap-4">
      <ModeTabs mode={mode} onChange={setMode} />

      {mode === "text" ? <TextQuickAdd /> : <ImageQuickAdd />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder text
// ---------------------------------------------------------------------------
const TEXT_PLACEHOLDER = `VD:
Bán nhà phố Quận 2, đường Thảo Điền, DT 72m2, 4 tầng, 4PN 4WC
Hướng Đông Nam, MT 5m, đường trước nhà 8m
Giá 12 tỷ thương lượng, sổ hồng chính chủ
Nội thất đầy đủ, gần trường quốc tế, siêu thị
LH: 0909 xxx xxx`;
