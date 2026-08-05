import { PostFeed } from "@/features/posts/components/post-feed";
import { PostFilters } from "@/features/posts/components/post-filters";
import type { Discount, PostType } from "@/features/posts/domain/types";

export default async function Home({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const type = parseType(query.type);
  const discount = parseDiscount(query.discount) ?? 80;
  const pieceNumber = parsePieceNumber(query.pieceNumber, discount);

  return (
    <section className="min-h-dvh bg-white">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50 px-5 pb-2 pt-5">
        <h1 className="mb-4 text-[22px] font-bold tracking-tight text-slate-900">
          周三充值日拼图互助
        </h1>
        <PostFilters
          discount={discount}
          type={type}
          pieceNumber={pieceNumber}
        />
      </header>
      <div className="px-5 py-4">
        <PostFeed
          discount={discount}
          type={type}
          pieceNumber={pieceNumber ?? undefined}
        />
      </div>
    </section>
  );
}

function parseType(value: string | string[] | undefined): PostType | undefined {
  return value === "GIVE" || value === "REQUEST" ? value : undefined;
}

function parseDiscount(value: string | string[] | undefined): Discount | undefined {
  return value === "95" ? 95 : value === "90" ? 90 : value === "80" ? 80 : undefined;
}

function parsePieceNumber(
  value: string | string[] | undefined,
  discount: Discount,
) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const pieceNumber = Number(value);
  const max = discount === 95 ? 4 : discount === 90 ? 6 : 9;
  return pieceNumber <= max ? pieceNumber : null;
}
