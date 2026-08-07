import { z } from "zod";

const selectionSchema = z
  .object({
    discount: z.union([z.literal(95), z.literal(90), z.literal(80)]),
    pieceNumber: z.number().int().positive(),
  })
  .superRefine(({ discount, pieceNumber }, ctx) => {
    const maxPieceNumber = discount === 95 ? 4 : discount === 90 ? 6 : 9;

    if (pieceNumber > maxPieceNumber) {
      ctx.addIssue({
        code: "custom",
        message: "拼图编号超出折扣范围",
        path: ["pieceNumber"],
      });
    }
  });

const sourcesSchema = z
  .object({
    url: z.string().trim().min(1).max(4096),
  })
  .strict();

export const createPostInputSchema = z.object({
  type: z.enum(["GIVE", "REQUEST"]),
  selection: selectionSchema,
  sources: sourcesSchema,
});

export type CreatePostInput = z.infer<typeof createPostInputSchema>;
