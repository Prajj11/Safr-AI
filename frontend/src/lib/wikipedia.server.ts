import { z } from "zod";
import { fetchJson } from "./places.server";
import { getCached, setCached } from "./place-cache.server";
import {
  titleMatchScore,
  trimExtract,
  WIKIPEDIA_MATCH_THRESHOLD,
} from "./wikipedia-match";

const webUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//.test(value));
const articleSchema = z.object({
  title: z.string(),
  extract: z.string(),
  imageUrl: webUrl.optional(),
  pageUrl: webUrl,
  license: z.literal("CC BY-SA 4.0"),
});
export type WikipediaArticle = z.infer<typeof articleSchema>;
const searchSchema = z.object({
  query: z.object({
    geosearch: z.array(
      z.object({
        title: z.string(),
        lat: z.number(),
        lon: z.number(),
        dist: z.number(),
      }),
    ),
  }),
});
const summarySchema = z.object({
  title: z.string(),
  extract: z.string(),
  thumbnail: z.object({ source: webUrl }).optional(),
  content_urls: z.object({ desktop: z.object({ page: webUrl }) }),
});

export async function lookupWikipedia({
  name,
  lat,
  lng,
}: {
  name: string;
  lat: number;
  lng: number;
}): Promise<WikipediaArticle | null> {
  const key = `wikipedia:${name.toLowerCase()}:${lat.toFixed(3)},${lng.toFixed(3)}`;
  try {
    const cached = articleSchema.safeParse(await getCached(key));
    if (cached.success) return cached.data;
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      list: "geosearch",
      gscoord: `${lat}|${lng}`,
      gsradius: "1500",
      gslimit: "8",
      format: "json",
      origin: "*",
    }).toString();
    const result = searchSchema.parse(
      await fetchJson(url.toString(), {}, 1500),
    );
    const candidate = result.query.geosearch
      .map((page) => ({ ...page, score: titleMatchScore(name, page.title) }))
      .filter((page) => page.score >= WIKIPEDIA_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score || a.dist - b.dist)[0];
    if (!candidate) return null;
    const summary = summarySchema.parse(
      await fetchJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate.title)}`,
        {},
        1500,
      ),
    );
    const article = articleSchema.parse({
      title: summary.title,
      extract: trimExtract(summary.extract),
      imageUrl: summary.thumbnail?.source,
      pageUrl: summary.content_urls.desktop.page,
      license: "CC BY-SA 4.0",
    });
    await setCached(key, article, 7 * 86400);
    return article;
  } catch {
    return null;
  }
}
