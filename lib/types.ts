import { z } from "zod";

// Structured spec sheet returned by the AI recognition layer.
export const WatchSpecSchema = z.object({
  brand: z.string().describe("Manufacturer, e.g. Rolex"),
  model: z.string().describe("Model line, e.g. Submariner Date"),
  referenceNumber: z.string().nullable(),
  nickname: z.string().nullable().describe("Collector nickname, e.g. Hulk"),
  movement: z.string().nullable().describe("Automatic / Manual / Quartz"),
  caliber: z.string().nullable(),
  caseMaterial: z.string().nullable(),
  caseDiameterMm: z.number().nullable(),
  lugToLugMm: z.number().nullable(),
  thicknessMm: z.number().nullable(),
  dialColor: z.string().nullable(),
  bezel: z.string().nullable(),
  crystal: z.string().nullable(),
  braceletType: z.string().nullable(),
  waterResistM: z.number().nullable(),
  powerReserveH: z.number().nullable(),
  complications: z.string().nullable().describe("Comma-separated complications"),
  yearProduced: z.string().nullable(),
  designer: z.string().nullable().describe("Notable designer, if known"),
  originCountry: z.string().nullable(),
  msrp: z.number().nullable().describe("Original retail price in USD, if known"),
  productionStatus: z
    .string()
    .nullable()
    .describe("One of: In production, Discontinued, Limited edition, Vintage"),
  limitedEdition: z
    .string()
    .nullable()
    .describe("If a limited edition, the run size/details (e.g. 'Limited to 500 pieces'); null otherwise"),
  scarcity: z
    .string()
    .nullable()
    .describe("A note on how rare/hard to find this reference is, production numbers if known, and current availability on the secondary market"),
  estValueLow: z.number().nullable().describe("Low end of market value in USD"),
  estValueHigh: z.number().nullable().describe("High end of market value in USD"),
  confidence: z.number().min(0).max(100).describe("Recognition confidence 0-100"),
  summary: z.string().describe("One-paragraph overview of the watch and its significance"),
  history: z
    .string()
    .nullable()
    .describe("Several sentences on the model's history: when it launched, how it evolved, its place in the brand's lineup, and why collectors care"),
  notableFacts: z
    .array(z.string())
    .describe("3-6 interesting, specific facts about this model (design quirks, records, famous wearers, variants)"),
  sources: z.array(z.string()).describe("URLs used to ground the specs"),
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
  referenceNumber: z.string().nullable(),
  verdict: z.enum(["likely-authentic", "caution", "likely-problematic", "inconclusive"]),
  confidence: z.number().min(0).max(100),
  flags: z.array(VetFlagSchema),
  estValueLow: z.number().nullable(),
  estValueHigh: z.number().nullable(),
  fairPriceNote: z.string().nullable(),
  summary: z.string(),
  sources: z.array(z.string()),
});
export type VetResult = z.infer<typeof VetResultSchema>;
