import { z } from "zod";

export const publicSlugSchema = z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const stableKeySchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9._-]+$/);
export const publicIdSchema = z.string().uuid();

export type PublicSlug = z.infer<typeof publicSlugSchema>;
export type StableKey = z.infer<typeof stableKeySchema>;
