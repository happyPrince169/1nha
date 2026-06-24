"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { acceptInviteAction, type AcceptInviteState } from "./actions";

const INITIAL: AcceptInviteState = { error: null };

export function AcceptInviteButton({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    acceptInviteAction,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <FormError>{state.error}</FormError>}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={isPending} className="h-11 w-full">
        {isPending ? "Đang tham gia…" : "Tham gia workspace"}
      </Button>
    </form>
  );
}
