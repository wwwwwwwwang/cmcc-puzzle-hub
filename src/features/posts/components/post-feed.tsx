"use client";

import { Puzzle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  Discount,
  HallPostDto,
  HallPostPage,
  PostType,
} from "@/features/posts/domain/types";
import { PostCard } from "./post-card";

type PostFeedProps = {
  type?: PostType;
  discount?: Discount;
  pieceNumber?: number;
  initialPage?: HallPostPage;
};

export function PostFeed({
  type,
  discount,
  pieceNumber,
  initialPage,
}: PostFeedProps) {
  const [items, setItems] = useState<HallPostDto[]>(
    initialPage?.items ?? [],
  );
  const [cursor, setCursor] = useState<string | null>(
    initialPage?.nextCursor ?? null,
  );
  const [loading, setLoading] = useState(!initialPage);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const cursorRef = useRef<string | null>(null);
  const initialPageLoadedRef = useRef(false);

  const load = useCallback(async (more = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (more) setLoadingMore(true);
    else {
      setLoading(true);
      setItems([]);
      setCursor(null);
    }
    setError(false);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (type) params.set("type", type);
      if (discount) params.set("discount", String(discount));
      if (pieceNumber !== undefined) {
        params.set("pieceNumber", String(pieceNumber));
      }
      if (more && cursorRef.current) params.set("cursor", cursorRef.current);
      const response = await fetch(`/api/posts?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error("request failed");
      const page = (await response.json()) as { items: HallPostDto[]; nextCursor: string | null };
      if (controllerRef.current !== controller) return;
      setItems((previous) => (more ? [...previous, ...page.items] : page.items));
      setCursor(page.nextCursor);
      cursorRef.current = page.nextCursor;
    } catch (cause) {
      if (controllerRef.current !== controller) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(true);
    } finally {
      if (controllerRef.current !== controller) return;
      if (more) setLoadingMore(false);
      else setLoading(false);
    }
  }, [discount, pieceNumber, type]);

  useEffect(() => {
    cursorRef.current = null;

    if (!initialPageLoadedRef.current && initialPage) {
      initialPageLoadedRef.current = true;
      setItems(initialPage.items);
      setCursor(initialPage.nextCursor);
      cursorRef.current = initialPage.nextCursor;
      setLoading(false);
      return;
    }

    void load();
    return () => controllerRef.current?.abort();
  }, [initialPage, load]);

  return (
    <section aria-label="最新发布">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-slate-700">最新发布</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || loadingMore}
            onClick={() => void load()}
            className="h-7 rounded-full bg-blue-50 px-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 hover:text-blue-700"
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            刷新
          </Button>
        </div>
        <span className="text-[13px] text-slate-400">共 {items.length} 条</span>
      </div>

      {loading ? (
        <div
          className="space-y-3"
          aria-label="加载中"
        >
          <span className="sr-only">正在寻找最新的拼图...</span>
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="rounded-lg border border-slate-100 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="space-y-3 py-10 text-center">
          <p className="text-sm text-slate-600">加载失败，请重试</p>
          <Button type="button" onClick={() => void load()}>
            重试
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-14 text-center text-slate-400">
          <Puzzle className="mx-auto mb-3 size-10 opacity-50" />
          <p className="text-sm">当前条件下暂无数据，试试其他拼图吧</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onRemoved={(id) =>
                setItems((current) =>
                  current.filter((item) => item.id !== id),
                )
              }
            />
          ))}
          {cursor ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loadingMore}
              onClick={() => void load(true)}
            >
              {loadingMore ? "加载中…" : "加载更多"}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
