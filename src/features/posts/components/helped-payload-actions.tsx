"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { parseUrl } from "@/features/posts/domain/parse-url";
import type { PostSources } from "@/features/posts/domain/types";

type HelpedPayloadActionsProps = {
  payloads: PostSources;
  navigate?: (url: string) => void;
};

export function HelpedPayloadActions({
  payloads,
  navigate = defaultNavigate,
}: HelpedPayloadActionsProps) {
  const [error, setError] = useState<string | null>(null);

  function handleUrl() {
    setError(null);
    if (!payloads.url) {
      setError("链接无效，无法打开");
      return;
    }

    try {
      parseUrl(payloads.url);
      navigate(payloads.url);
    } catch {
      setError("链接无效，无法打开");
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" onClick={handleUrl}>
        <ExternalLink data-icon="inline-start" />
        打开二维码
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function defaultNavigate(url: string) {
  window.location.href = url;
}
