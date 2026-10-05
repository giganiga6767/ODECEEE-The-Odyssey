import { z } from "zod";

export const LocationUpdateSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().min(0).max(100_000),
    heading: z.number().finite().min(0).max(360).optional(),
    ts: z.number().int().positive(),
  })
  .strict();

export const ArrivePayloadSchema = z.object({}).strict();
