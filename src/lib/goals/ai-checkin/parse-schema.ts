import { z } from "zod";

export const AiParseResponseSchema = z.object({
  payments: z.array(
    z.object({
      goal_name: z.string().min(1),
      amount: z.coerce.number().gt(0),
    }),
  ),
});

export type AiParseResponse = z.infer<typeof AiParseResponseSchema>;

export function parseAiResponse(raw: unknown): { ok: true; data: AiParseResponse } | { ok: false } {
  const result = AiParseResponseSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false };
  }
  return { ok: true, data: result.data };
}
