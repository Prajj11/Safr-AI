import { coordinateSchema } from "./travel-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const searchPlaces = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ query: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { searchGoaPlaces } = await import("./maps.server");
    return searchGoaPlaces(data.query);
  });

export const getRoutes = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        origin: coordinateSchema,
        destination: coordinateSchema,
        isNight: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { computeSafeRoutes } = await import("./maps.server");
    return computeSafeRoutes(data.origin, data.destination, data.isNight);
  });
