import { z } from "zod";

// Structured spec sheet returned by the AI recognition layer.
export const WatchSpecSchema = z.object({
  brand: z.string().describe("Manufacturer, e.g. Rolex"),
  model: z.string().describe("Model line, e.g. Submariner Date"),
  referenceNumber: z.string().nullable().optional(),
  nickname: z.string().nullable().optional().describe("Collector nickname, e.g. Hulk"),
  movement: z.string().nullable().optional().describe("Automatic / Manual / Quartz"),
  caliber: z.string().nullable().optional(),
  caseMaterial: z.string().nullable().optional(),
  caseDiameterMm: z.number().nullable().optional(),
  lugToLugMm: z.number().nullable().optional(),
  thicknessMm: z.number().nullable().optional(),
  dialColor: z.string().nullable().optional(),
  bezel: z.string().nullable().optional(),
  crystal: z.string().nullable().optional(),
  braceletType: z.string().nullable().optional(),
  waterResistM: z.number().nullable().optional(),
  powerReserveH: z.number().nullable().optional(),
  complications: z.string().nullable().optional().describe("Comma-separated complications"),
  yearProduced: z.string().nullable().optional(),
  designer: z.string().nullable().optional().describe("Notable designer, if known"),
  originCountry: z.string().nullable().optional(),
  msrp: z.number().nullable().optional().describe("Original retail price in USD, if known"),
  productionStatus: z
    .string()
    .nullable()
    .optional()
    .describe("One of: In production, Discontinued, Limited edition, Vintage"),
  limitedEdition: z
    .string()
    .nullable()
    .optional()
    .describe("If a limited edition, the run size/details (e.g. 'Limited to 500 pieces'); null otherwise"),
  scarcity: z
    .string()
    .nullable()
    .optional()
    .describe("A note on how rare/hard to find this reference is, production numbers if known, and current availability on the secondary market"),
  estValueLow: z.number().nullable().optional().describe("Low end of market value in USD"),
  estValueHigh: z.number().nullable().optional().describe("High end of market value in USD"),
  confidence: z.number().min(0).max(100).describe("Recognition confidence 0-100"),
  summary: z.string().describe("One-paragraph overview of the watch and its significance"),
  history: z
    .string()
    .nullable()
    .optional()
    .describe("Several sentences on the model's history: when it launched, how it evolved, its place in the brand's lineup, and why collectors care"),
  notableFacts: z
    .array(z.string())
    .optional()
    .describe("3-6 interesting, specific facts about this model (design quirks, records, famous wearers, variants)"),
  sources: z.array(z.string()).optional().describe("URLs used to ground the specs"),
});
export type WatchSpec = z.infer<typeof WatchSpecSchema>;

// Authenticity vetting result.
export const VetFlagSchema = z.object({
  severity: z.enum(["red", "yellow", "green"]),
  title: z.string(),
  detail: z.string(),
});
export type VetFlag = z.infer<typeof VetFlagSchema>;

export const VetResultSchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  referenceNumber: z.string().nullable().optional(),
  verdict: z.enum(["likely-authentic", "caution", "likely-problematic", "inconclusive"]),
  confidence: z.number().min(0).max(100),
  flags: z.array(VetFlagSchema),
  estValueLow: z.number().nullable().optional(),
  estValueHigh: z.number().nullable().optional(),
  fairPriceNote: z.string().nullable().optional(),
  summary: z.string(),
  sources: z.array(z.string()).optional(),
});
export type VetResult = z.infer<typeof VetResultSchema>;
