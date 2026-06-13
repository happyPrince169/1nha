"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import {
  markContentPosted,
  type MarkPostedState,
} from "./actions";

// ---------------------------------------------------------------------------
// MarkPostedForm
//
// Collapsible form — only expands when the broker taps "Đánh dấu đã đăng".
// Submits channel_name, post_url, posted_at then collapses on success.
// ---------------------------------------------------------------------------

type Props = {
  contentId: string;
  /** Pass current posted_at if already posted, to pre-fill the date field */
  postedAt: string | null;
  channelName: string | null;
  postUrl: string | null;
  alreadyPosted: boolean;
};

const initialState: MarkPostedState = { error: null };

export function MarkPostedForm({
  contentId,
  postedAt,
  channelName,
  postUrl,
  alreadyPosted,
}: Props) {
  const boundAction = markContentPosted.bind(null, contentId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const [open, setOpen] = useState(alreadyPosted);

  // Format ISO date to datetime-local value (YYYY-MM-DDTHH:mm)
  function toDatetimeLocal(iso: string | null): string {
    if (!iso) return "";
    try {
      return new Date(iso).toISOString().slice(0, 16);
    } catch {
      return "";
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        📌 Đánh dấu đã đăng
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">Xác nhận đã đăng bài</p>

      {state.error && <FormError>{state.error}</FormError>}

      <form action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="channel_name">Kênh đăng (tên trang / nhóm)</Label>
          <Input
            id="channel_name"
            name="channel_name"
            placeholder="VD: Nhà đẹp Hà Nội, Zalo cá nhân…"
            defaultValue={channelName ?? ""}
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post_url">Link bài đăng (tuỳ chọn)</Label>
          <Input
            id="post_url"
            name="post_url"
            type="url"
            placeholder="https://www.facebook.com/…"
            defaultValue={postUrl ?? ""}
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="posted_at">Thời điểm đăng</Label>
          <Input
            id="posted_at"
            name="posted_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(postedAt)}
            disabled={isPending}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={isPending}>
            {isPending ? "Đang lưu…" : "✓ Xác nhận đã đăng"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            Huỷ
          </Button>
        </div>
      </form>
    </div>
  );
}
