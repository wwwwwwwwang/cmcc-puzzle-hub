import { PostFeed } from "@/features/posts/components/post-feed";
import { PostFilters } from "@/features/posts/components/post-filters";
import type { Discount, PostType } from "@/features/posts/domain/types";

export default async function Home({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const type = parseType(query.type);
  const discount = parseDiscount(query.discount);

  return (
    <section className="space-y-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          周三充值日拼图互助
        </h1>
        <p className="mt-1 text-sm text-slate-500">找到需要的拼图，确认后再领取</p>
      </header>
      <PostFilters />
      <PostFeed type={type} discount={discount} />
    </section>
  );
}

function parseType(value: string | string[] | undefined): PostType | undefined {
  return value === "GIVE" || value === "REQUEST" ? value : undefined;
}

function parseDiscount(value: string | string[] | undefined): Discount | undefined {
  return value === "95" ? 95 : value === "90" ? 90 : value === "80" ? 80 : undefined;
}
