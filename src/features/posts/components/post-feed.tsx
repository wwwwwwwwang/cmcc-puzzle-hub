"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HallPostDto, PostType, Discount } from "@/features/posts/domain/types";
import { PostCard } from "./post-card";

type PostFeedProps = {
  type?: PostType;
  discount?: Discount;
};

export function PostFeed({ type, discount }: PostFeedProps) {
  const [items, setItems] = useState<HallPostDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const cursorRef = useRef<string | null>(null);

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
  }, [discount, type]);

  useEffect(() => {
    cursorRef.current = null;
    // A filter change intentionally resets the visible page before the new request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  if (loading) return <div className="space-y-3" aria-label="加载中">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 w-full rounded-lg" />)}</div>;
  if (error) return <div className="space-y-3 py-8 text-center"><p className="text-sm text-slate-600">加载失败，请重试</p><Button type="button" onClick={() => void load()}>重试</Button></div>;
  if (items.length === 0) return <p className="py-12 text-center text-sm text-slate-500">暂无拼图内容</p>;

  return <div className="space-y-3">{items.map((post) => <PostCard key={post.id} post={post} onRemoved={(id) => setItems((current) => current.filter((item) => item.id !== id))} />)}{cursor ? <Button type="button" variant="outline" className="w-full" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? "加载中…" : "加载更多"}</Button> : null}</div>;
}
