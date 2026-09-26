import { z } from "zod";

export const articleSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  title: z.string().optional(),
  paragraphs: z.array(z.string().min(1)).min(1),
});

export const lawFixtureSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  type: z.string().min(1),
  number: z.string().min(1),
  title: z.string().min(1),
  shortTitle: z.string().min(1),
  status: z.enum(["Vigente", "Modificada"]),
  published: z.string().min(1),
  updated: z.string().min(1),
  description: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1),
  articles: z.array(articleSchema).min(1),
});

export const legislationFixtureSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    name: z.string().min(1),
    url: z.string().url().optional(),
    capturedAt: z.string().datetime(),
  }),
  laws: z.array(lawFixtureSchema).min(1),
});

export type LegislationFixture = z.infer<typeof legislationFixtureSchema>;
