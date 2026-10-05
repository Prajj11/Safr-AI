import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { coordinateSchema, itineraryInputSchema } from "./travel-schemas";

export const getPlaceInsights = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        place: z.string().trim().min(2).max(120),
        localTime: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
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
