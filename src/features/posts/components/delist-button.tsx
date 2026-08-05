"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  delistMyPost,
  type DelistState,
} from "@/features/posts/server/actions";

export function DelistButton({ postId }: { postId: string }) {
  const [state, formAction, pending] = useActionState<DelistState, FormData>(
    delistMyPost,
    {},
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="postId" value={postId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "下架中…" : "下架"}
      </Button>
      {state.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}
