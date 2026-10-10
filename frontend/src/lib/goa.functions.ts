import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { coordinateSchema, itineraryInputSchema } from "./travel-schemas";

export const getPlaceInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        place: z.string().trim().min(2).max(120),
        localTime: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { checkExploreAccess } = await import("./explore-access.server");
    checkExploreAccess(context.userId);
    const { loadPlaceInsights } = await import("./travel.server");
    return loadPlaceInsights(data.place);
  });

export const generateItinerary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => itineraryInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { buildItinerary } = await import("./travel.server");
    return buildItinerary(data);
  });

export const getCurrentArea = createServerFn({ method: "POST" })
  .validator((input: unknown) => coordinateSchema.parse(input))
  .handler(async ({ data }) => {
    const { reverseLocation } = await import("./places.server");
    return reverseLocation(data);
  });

export const getFeaturedMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { checkExploreAccess } = await import("./explore-access.server");
    checkExploreAccess(context.userId);
    const { lookupWikipedia } = await import("./wikipedia.server");
    const { ALL_FEATURED } = await import("./explore-featured");
    return Object.fromEntries(
      await Promise.all(
        ALL_FEATURED.map(async (place) => {
          const article = await lookupWikipedia(place);
          return [
            place.name,
            article?.imageUrl
              ? {
                  imageUrl: article.imageUrl,
                  credit: {
                    label: "Wikipedia / Wikimedia — view image attribution",
                    url: article.pageUrl,
                  },
                }
              : null,
          ];
        }),
      ),
    );
  });
