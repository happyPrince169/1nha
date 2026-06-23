// ---------------------------------------------------------------------------
// Shared client-side property image upload orchestrator
//
// CLIENT ONLY. Reuses the exact same direct-to-R2 architecture as the property
// images gallery upload:
//   1. process the photo on the client (createMainAndThumbnailImages)
//   2. ask the server for presigned R2 upload targets (main + thumbnail)
//   3. PUT both files straight to R2 (bytes never touch a Server Action)
//   4. finalize the metadata row
//
// Consumed by BOTH:
//   • /dashboard/properties/[id]/images   (image-upload-form, single file)
//   • /dashboard/properties/new           (create-with-images flow, many files)
//
// The R2 request/finalize Server Actions are injected so this module stays
// decoupled and each caller imports the actions from its natural location.
// ---------------------------------------------------------------------------
import { createMainAndThumbnailImages } from "./client-image-processing";
import type {
  RequestProcessedUploadInput,
  RequestProcessedUploadResult,
  FinalizeUploadResult,
} from "@/app/(dashboard)/dashboard/properties/[id]/images/actions";

export type RequestTargetsAction = (
  propertyId: string,
  input: RequestProcessedUploadInput
) => Promise<RequestProcessedUploadResult>;

export type FinalizeAction = (
  propertyId: string,
  imageId: string
) => Promise<FinalizeUploadResult>;

export type UploadActions = {
  requestTargets: RequestTargetsAction;
  finalize: FinalizeAction;
};

/** Two visible stages of a single image upload, for progress text. */
export type StatusPhase = "processing" | "uploading";

export type SingleUploadResult = { ok: true } | { ok: false; error: string };

// Friendly Vietnamese messages — never leak raw technical errors to the UI.
const CORS_ERROR =
  "Không tải được ảnh lên R2. Nhiều khả năng bucket chưa cho phép CORS từ địa chỉ hiện tại. " +
  "Hãy thêm origin này vào cấu hình CORS của bucket R2 rồi thử lại.";
const GENERIC_PROCESS_ERROR =
  "Không tối ưu được ảnh này. Vui lòng thử ảnh khác hoặc ảnh chụp màn hình.";

// ---------------------------------------------------------------------------
// uploadProcessedPropertyImage — process + upload + finalize ONE image
//
// Returns a structured friendly result instead of throwing, so callers can
// surface a clean message (single-image form) or keep going (batch flow).
// ---------------------------------------------------------------------------
export async function uploadProcessedPropertyImage(
  propertyId: string,
  file: File,
  actions: UploadActions,
  onStatus?: (phase: StatusPhase) => void
): Promise<SingleUploadResult> {
  // 1. Resize/compress on the client → social-ready main + small thumbnail.
  //    createMainAndThumbnailImages already returns friendly Vietnamese errors
  //    (non-image / HEIC unsupported / process failed / too large).
  onStatus?.("processing");
  let processed;
  try {
    processed = await createMainAndThumbnailImages(file);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : GENERIC_PROCESS_ERROR,
    };
  }
  const { main, thumbnail } = processed;

  // 2. Ask the server for presigned R2 upload targets for both files.
  const req = await actions.requestTargets(propertyId, {
    fileName: main.file.name,
    width: main.width,
    height: main.height,
    original: { mimeType: main.mimeType, sizeBytes: main.sizeBytes },
    thumbnail: { mimeType: thumbnail.mimeType, sizeBytes: thumbnail.sizeBytes },
  });
  if (!req.ok) return { ok: false, error: req.error };

  // 3. Upload the main image straight to R2. A thrown error here is almost
  //    always a CORS/network failure (the bucket must allow this origin).
  onStatus?.("uploading");
  let mainRes: Response;
  try {
    mainRes = await fetch(req.originalUploadUrl, {
      method: "PUT",
      body: main.file,
      headers: { "Content-Type": req.originalContentType },
    });
  } catch {
    return { ok: false, error: CORS_ERROR };
  }
  if (!mainRes.ok) {
    return {
      ok: false,
      error: `Tải ảnh lên R2 thất bại (mã ${mainRes.status}). Vui lòng thử lại.`,
    };
  }

  // 4. Upload the thumbnail. If this fails after the main upload, we leave the
  //    row pending (not finalized) so it stays hidden — no broken image shows.
  let thumbRes: Response;
  try {
    thumbRes = await fetch(req.thumbnailUploadUrl, {
      method: "PUT",
      body: thumbnail.file,
      headers: { "Content-Type": req.thumbnailContentType },
    });
  } catch {
    return { ok: false, error: CORS_ERROR };
  }
  if (!thumbRes.ok) {
    return {
      ok: false,
      error: `Tải ảnh thu nhỏ lên R2 thất bại (mã ${thumbRes.status}). Vui lòng thử lại.`,
    };
  }

  // 5. Mark the row ready.
  const fin = await actions.finalize(propertyId, req.imageId);
  if (!fin.ok) return { ok: false, error: fin.error };

  return { ok: true };
}

// ---------------------------------------------------------------------------
// uploadPropertyImagesToR2 — upload many images, tolerant of partial failure
//
// Each image is processed + uploaded independently. A single failure never
// aborts the batch (the property is already saved by the caller). The summary
// lets the caller decide how to redirect / what to tell the user.
// ---------------------------------------------------------------------------
export type BatchProgress = {
  /** 1-based index of the image currently being handled. */
  index: number;
  total: number;
  phase: StatusPhase;
};

export type BatchUploadResult = {
  total: number;
  uploaded: number;
  failed: number;
  /** First friendly error encountered, for an optional summary message. */
  firstError: string | null;
};

export async function uploadPropertyImagesToR2(
  propertyId: string,
  files: File[],
  actions: UploadActions,
  onProgress?: (p: BatchProgress) => void
): Promise<BatchUploadResult> {
  const total = files.length;
  let uploaded = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (let i = 0; i < files.length; i++) {
    const res = await uploadProcessedPropertyImage(
      propertyId,
      files[i],
      actions,
      (phase) => onProgress?.({ index: i + 1, total, phase })
    );
    if (res.ok) {
      uploaded++;
    } else {
      failed++;
      if (!firstError) firstError = res.error;
    }
  }

  return { total, uploaded, failed, firstError };
}
