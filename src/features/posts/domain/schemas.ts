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
    command: z.string().trim().min(1).max(1000).optional(),
    url: z.string().trim().min(1).max(4096).optional(),
  })
  .refine(({ command, url }) => command !== undefined || url !== undefined, {
    message: "至少提供一种拼图来源",
  });

const visitorIdSchema = z.string().trim().min(8).max(256);

export const createPostInputSchema = z.object({
  type: z.enum(["GIVE", "REQUEST"]),
  selection: selectionSchema,
  sources: sourcesSchema,
  visitorId: visitorIdSchema,
});

export const claimPostInputSchema = z.object({
  visitorId: visitorIdSchema,
});

export type CreatePostInput = z.infer<typeof createPostInputSchema>;
