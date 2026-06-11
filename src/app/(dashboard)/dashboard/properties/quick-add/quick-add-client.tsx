"use client";

import { useActionState, useRef, useState } from "react";

import {
  extractPropertyFromTextAction,
  extractPropertyFromImageAction,
  type QuickAddState,
  type ImageExtractState,
} from "./actions";
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
// ---------------------------------------------------------------------------
const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function ImageInputStep({
  isPending,
  error,
}: {
  isPending: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }

    // Client-side guard (server repeats the check)
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setClientError("Định dạng không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP.");
      e.target.value = "";
      setPreview(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setClientError(
        `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Giới hạn ${MAX_MB} MB.`
      );
      e.target.value = "";
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  const displayError = clientError ?? error;

  return (
    <div className="flex flex-col gap-4">
      {displayError && <FormError>{displayError}</FormError>}

      <Card>
        <CardHeader>
          <CardTitle>Tải ảnh bất động sản</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Drop zone / file picker */}
          <div
            onClick={() => !isPending && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isPending)
                inputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="Chọn ảnh để tải lên"
            className={[
              "flex min-h-[160px] cursor-pointer flex-col items-center justify-center",
              "rounded-lg border-2 border-dashed transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isPending
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
                <p className="text-xs">JPEG · PNG · WebP · tối đa {MAX_MB} MB</p>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            id="image"
            name="image"
            type="file"
            accept={ACCEPTED}
            disabled={isPending}
            onChange={handleFileChange}
            className="sr-only"
          />

          {preview && !isPending && (
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setClientError(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
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
        disabled={isPending || !!clientError}
      >
        {isPending ? "Đang đọc ảnh…" : "✨ Trích xuất từ ảnh"}
      </Button>
    </div>
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
    <form action={formAction}>
      <ImageInputStep isPending={isPending} error={state.error} />
    </form>
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
