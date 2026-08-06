"use client";

import { Copy, ExternalLink, Smartphone } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { parseUrl } from "@/features/posts/domain/parse-url";
import type { PostSources } from "@/features/posts/domain/types";

type HelpedPayloadActionsProps = {
  payloads: PostSources;
  launchApp?: (url: string) => void;
  navigate?: (url: string) => void;
};

export function HelpedPayloadActions({
  payloads,
  launchApp = defaultLaunchApp,
  navigate = defaultNavigate,
}: HelpedPayloadActionsProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCommand() {
    if (!payloads.command) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(payloads.command);
      setCopied(true);
      launchApp("leadeon://");
    } catch {
      setCopied(false);
      setError("复制失败，请允许剪贴板权限后重试");
    }
  }

  function handleUrl() {
    if (!payloads.url) return;
    setError(null);
    try {
      parseUrl(payloads.url);
      navigate(payloads.url);
    } catch {
      setError("链接无效，无法打开");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {payloads.command ? (
          <Button type="button" size="sm" onClick={() => void handleCommand()}>
            <Copy data-icon="inline-start" />
            {error ? "重试复制" : "使用口令"}
          </Button>
        ) : null}
        {payloads.url ? (
          <Button
            type="button"
            size="sm"
            variant={payloads.command ? "outline" : "default"}
            onClick={handleUrl}
          >
            <ExternalLink data-icon="inline-start" />
            打开链接
          </Button>
        ) : null}
        {copied ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => launchApp("leadeon://")}
          >
            <Smartphone data-icon="inline-start" />
            再次唤起
          </Button>
        ) : null}
      </div>

      {copied ? (
        <p role="status" className="text-xs text-emerald-700">
          口令已复制
        </p>
      ) : null}
      {error ? (
        <div className="space-y-1">
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
          {payloads.command ? (
            <code className="block break-all rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {payloads.command}
            </code>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function defaultLaunchApp(url: string) {
  window.location.href = url;
}

function defaultNavigate(url: string) {
  window.location.href = url;
}
