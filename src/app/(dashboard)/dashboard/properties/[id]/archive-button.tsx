"use client";

import { useTransition } from "react";
import { archiveProperty } from "./edit/actions";
import { Button } from "@/components/ui/button";

export function ArchiveButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Lưu trữ bất động sản này? Bạn vẫn có thể khôi phục sau.")) {
      return;
    }
    startTransition(async () => {
      await archiveProperty(id);
    });
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
    >
      {isPending ? "Đang lưu trữ…" : "Lưu trữ"}
    </Button>
  );
}
