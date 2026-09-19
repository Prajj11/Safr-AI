import { z } from "zod";

export const crowdBand = z.enum(["quiet", "moderate", "busy", "packed", "unknown"]);

export const alternativeSchema = z.object({
  name: z.string(),
  why: z.string(),
  travel_time: z.string(),
});

export const recommendationSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  sourceUrl: z.string().url().optional(),
  name: z.string(),
  description: z.string(),
  tip: z.string(),
});

export const transportAdviceSchema = z.object({
  best_mode: z.enum(["scooter", "car", "taxi", "bus", "ferry", "walk"]),
  title: z.string(),
  description: z.string(),
  estimated_cost: z.string(),
  parking_ease: z.enum(["easy", "moderate", "difficult", "paid"]),
  parking_tip: z.string(),
  road_condition: z.string(),
  safety_tips: z.array(z.string()),
  public_transit: z.string().optional(),
});

export type TransportAdvice = z.infer<typeof transportAdviceSchema>;

export const placeInsightsSchema = z.object({
  place: z.string(),
  summary: z.string(),
  eat: z.array(recommendationSchema).max(6),
  activities: z.array(recommendationSchema).max(6),
  sights: z.array(recommendationSchema).max(6),
  transport_advice: transportAdviceSchema.optional(),
  crowd: z.object({
    percent: z.number().min(0).max(100).nullable(),
    band: crowdBand,
    reason: z.string(),
    best_time_today: z.string(),
    alternatives: z.array(alternativeSchema).max(4),
  }),
  rules: z.object({
    allowed: z.array(z.string()).max(8),
    not_allowed: z.array(z.string()).max(8),
  }),
  warnings: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        severity: z.enum(["low", "medium", "high"]),
      }),
    )
    .min(1)
    .max(6),
});

export type PlaceInsights = z.infer<typeof placeInsightsSchema>;

export const itinerarySchema = z.object({
  totalMinutes: z.number().optional(),
  unusedMinutes: z.number().optional(),
  returnMinutes: z.number().optional(),
  budgetMinutes: z.number().optional(),
  endTime: z.string().optional(),
  aiStatus: z.enum(["used", "unavailable", "not_configured"]).optional(),
  routingSource: z.string().optional(),
  origin: z.object({ lat: z.number(), lng: z.number() }).optional(),
  title: z.string(),
  overview: z.string(),
  date: z.string().optional(),
  stops: z
    .array(
      z.object({
        durationMin: z.number().optional(),
        arrivalMinute: z.number().optional(),
        departureMinute: z.number().optional(),
        sourceUrl: z.string().url().optional(),
        time: z.string(),
        title: z.string(),
        type: z.enum(["food", "sight", "activity", "beach", "rest", "travel"]),
        duration: z.string(),
        description: z.string(),
        travel_note: z.string(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        crowdLevel: z.enum(["low", "moderate", "high"]).optional(),
        distanceKm: z.number().optional(),
        transitMin: z.number().optional(),
      }),
    )
    .min(1)
    .max(12),
  tips: z.array(z.string()).min(2).max(6),
  liveWeather: z.string().optional(),
  liveSwell: z.string().optional(),
});

export type Itinerary = z.infer<typeof itinerarySchema>;

export const routeStepSchema = z.object({
  instruction: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  maneuverType: z.string(),
  maneuverModifier: z.string().optional(),
  name: z.string(),
  location: z.tuple([z.number(), z.number()]).optional(), // [lat, lng]
});

export type RouteStep = z.infer<typeof routeStepSchema>;

export const routeOptionSchema = z.object({
  label: z.string(),
  kind: z.enum(["fastest", "safer", "alt"]),
  distance_km: z.number(),
  duration_min: z.number(),
  safety_score: z.number(),
  reasons: z.array(z.string()),
  polyline: z.string(),
  summary: z.string(),
  steps: z.array(routeStepSchema).optional(),
  googleMapsUrl: z.string().optional(),
});

export type RouteOption = z.infer<typeof routeOptionSchema>;

export const GOA_PLACES = [
  "Panjim",
  "Baga Beach",
  "Calangute Beach",
  "Anjuna Beach",
  "Vagator Beach",
  "Candolim Beach",
  "Palolem Beach",
  "Agonda Beach",
  "Colva Beach",
  "Old Goa",
  "Dudhsagar Falls",
  "Fort Aguada",
  "Chapora Fort",
  "Margao",
  "Arambol Beach",
  "Morjim Beach",
] as const;
