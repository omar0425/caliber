import Anthropic from "@anthropic-ai/sdk";
import { WatchSpec, WatchSpecSchema, VetResult, VetResultSchema } from "./types";
import { getApiKey } from "./settings";
import { recordUsage } from "./usage";

const MODEL = "claude-opus-4-8";

// Turn a raw SDK/API error into a clear, actionable message for the UI.
export function interpretAiError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("credit balance") || msg.includes("billing")) {
      return "Your Anthropic credit balance is too low. Add credits at console.anthropic.com → Plans & Billing, then try again.";
    }
    if (err.status === 401) return "Your API key was rejected. Re-enter it on the Settings page.";
    if (err.status === 429) return "Anthropic is rate-limiting requests — wait a moment and try again.";
    if (err.status === 529) return "Anthropic is temporarily overloaded — please try again shortly.";
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

// Build a client from the currently-configured key (Settings page or env).
// Returns null when no key is set — callers fall back to demo mode.
async function getClient(): Promise<Anthropic | null> {
  const apiKey = await getApiKey();
  return apiKey ? new Anthropic({ apiKey }) : null;
}

// Whether real AI is available right now (a key is configured).
export async function aiEnabled(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

// Anthropic server-side web search tool — grounds specs & values in real sources.
const webSearchTool: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 6,
};

type ImageInput = { base64: string; mediaType: string };

function imageBlock(image: ImageInput): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: image.base64,
    },
  };
}

// Pull the last JSON object out of the model's text, tolerating fences/tags.
function extractJson<T>(text: string): T {
  const between = text.match(/<result>([\s\S]*?)<\/result>/i);
  const raw = between ? between[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in model response");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

function joinText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ---- Recognition -----------------------------------------------------------

const IDENTIFY_SYSTEM = `You are Caliber, an expert horologist and watch authentication assistant.
You analyze photographs of wristwatches and produce precise, trustworthy spec sheets.

Rules:
- Use the web_search tool to CONFIRM the reference number, movement caliber, and current
  secondary-market value. Never invent a reference number or caliber — if you cannot confirm
  it, set the field to null and lower your confidence.
- confidence reflects how sure you are of the identification (brand + model + reference).
- estValueLow/estValueHigh are USD secondary-market estimates for the piece in good condition.
- Research the model's HISTORY and background: when it launched, how it evolved across
  generations, its place in the brand's lineup, and why collectors care. Capture 3-6 specific
  "notable facts" (design quirks, records, famous wearers, sought-after variants).
- Research SCARCITY: whether it's in production, discontinued, vintage, or a limited edition
  (with the run size if so), rough production numbers if known, and how easy it is to find on
  the secondary market today.
- Prefer being honest about uncertainty over sounding authoritative.

After researching, respond with ONLY a JSON object wrapped in <result></result> tags matching:
{
  "brand": string, "model": string, "referenceNumber": string|null, "nickname": string|null,
  "movement": string|null, "caliber": string|null, "caseMaterial": string|null,
  "caseDiameterMm": number|null, "lugToLugMm": number|null, "thicknessMm": number|null,
  "dialColor": string|null, "bezel": string|null, "crystal": string|null,
  "braceletType": string|null, "waterResistM": number|null, "powerReserveH": number|null,
  "complications": string|null, "yearProduced": string|null,
  "designer": string|null, "originCountry": string|null, "msrp": number|null,
  "productionStatus": string|null, "limitedEdition": string|null, "scarcity": string|null,
  "estValueLow": number|null, "estValueHigh": number|null,
  "confidence": number (0-100), "summary": string,
  "history": string, "notableFacts": string[], "sources": string[]
}`;

export async function identifyWatch(image: ImageInput): Promise<WatchSpec> {
  const client = await getClient();
  if (!client) return mockIdentify();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: IDENTIFY_SYSTEM,
    tools: [webSearchTool],
    messages: [
      {
        role: "user",
        content: [
          imageBlock(image),
          {
            type: "text",
            text: "Identify this watch and produce its full spec sheet. Research to confirm the reference and value.",
          },
        ],
      },
    ],
  });

  await recordUsage("identify", MODEL, message);
  const spec = extractJson<unknown>(joinText(message));
  return WatchSpecSchema.parse(spec);
}

// ---- Vetting / authentication ---------------------------------------------

const VET_SYSTEM = `You are Caliber's authentication engine. A collector is considering BUYING this
watch (often from an online listing) and wants to avoid fakes, "franken" watches (mismatched
genuine + aftermarket parts), redials, and bad deals.

Analyze the photo (and any listing text provided) for authenticity signals:
- Dial text font/spacing/printing, logo shape, date wheel font & alignment
- Crown, bezel, handset, lume plots consistency with the claimed reference
- Case finishing, engravings, serial/reference plausibility
- Whether the asking price is sane vs. real market data (use web_search)

Be measured. Photos alone cannot certify authenticity — say so. Flag concerns by severity:
red = strong warning, yellow = verify further, green = looks consistent.

After researching, respond with ONLY a JSON object wrapped in <result></result> tags matching:
{
  "brand": string|null, "model": string|null, "referenceNumber": string|null,
  "verdict": "likely-authentic"|"caution"|"likely-problematic"|"inconclusive",
  "confidence": number (0-100),
  "flags": [{ "severity": "red"|"yellow"|"green", "title": string, "detail": string }],
  "estValueLow": number|null, "estValueHigh": number|null,
  "fairPriceNote": string|null, "summary": string, "sources": string[]
}`;

export async function vetWatch(
  image: ImageInput | null,
  listingText: string
): Promise<VetResult> {
  const client = await getClient();
  if (!client) return mockVet();

  const content: Anthropic.ContentBlockParam[] = [];
  if (image) content.push(imageBlock(image));
  content.push({
    type: "text",
    text:
      `Assess this watch for authenticity and value.\n\nListing details from the seller:\n` +
      (listingText?.trim() || "(none provided)"),
  });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: VET_SYSTEM,
    tools: [webSearchTool],
    messages: [{ role: "user", content }],
  });

  await recordUsage("vet", MODEL, message);
  const result = extractJson<unknown>(joinText(message));
  return VetResultSchema.parse(result);
}

// ---- Per-watch chat --------------------------------------------------------

export type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_SYSTEM = (context: string) => `You are Caliber's expert horology assistant, chatting with a
serious collector about ONE specific watch. Here is what we know about it:

${context}

Help them with anything about this watch: scarcity and limited-edition status, production numbers,
which references/variants are most collectible, market trends and fair pricing, what to check when
buying, servicing, comparable alternatives, and history. Use the web_search tool to ground claims
about current availability, prices, and limited-edition details.

Style: concise, specific, and honest. Lead with the answer. When you're unsure or a fact is hard to
verify, say so plainly rather than guessing. For high-value buying decisions, remind them to confirm
critical details (papers, serials, condition) independently. Keep replies to a few short paragraphs.`;

export async function chatAboutWatch(context: string, messages: ChatMessage[]): Promise<string> {
  const client = await getClient();
  if (!client) {
    return "Chat runs on Claude — add your Anthropic API key on the Settings page to talk through this watch's scarcity, limited editions, and market. (Demo mode.)";
  }

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: CHAT_SYSTEM(context),
    tools: [webSearchTool],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  await recordUsage("chat", MODEL, message);
  const text = joinText(message).trim();
  return text || "I couldn't find a good answer to that — try rephrasing?";
}

// ---- Demo-mode mocks (no API key) ------------------------------------------

function mockIdentify(): WatchSpec {
  return WatchSpecSchema.parse({
    brand: "Omega",
    model: "Speedmaster Professional Moonwatch",
    referenceNumber: "310.30.42.50.01.001",
    nickname: "Moonwatch",
    movement: "Manual",
    caliber: "Co-Axial Master Chronometer 3861",
    caseMaterial: "Stainless Steel",
    caseDiameterMm: 42,
    lugToLugMm: 48,
    thicknessMm: 13.2,
    dialColor: "Black",
    bezel: "Black aluminium tachymeter",
    crystal: "Hesalite",
    braceletType: "Steel bracelet",
    waterResistM: 50,
    powerReserveH: 50,
    complications: "Chronograph, Tachymeter",
    yearProduced: "2021–present",
    designer: "Claude Baillod (original 1957 design)",
    originCountry: "Switzerland",
    msrp: 7000,
    productionStatus: "In production",
    limitedEdition: null,
    scarcity:
      "DEMO MODE: The standard Moonwatch is in current production and widely available new — not scarce. Certain vintage references (e.g. cal. 321 'Ed White', tropical dials) and special editions like the Speedy Tuesday are highly sought and command large premiums.",
    estValueLow: 5200,
    estValueHigh: 7000,
    confidence: 92,
    summary:
      "DEMO MODE: The Omega Speedmaster Professional 'Moonwatch' is the manual-wind chronograph worn on the Apollo missions. Add your Anthropic API key on the Settings page to analyze your real photos.",
    history:
      "DEMO MODE: Introduced in 1957 as a motorsport chronograph, the Speedmaster was flight-qualified by NASA in 1965 and worn on the Moon during Apollo 11 in 1969, earning the 'Moonwatch' name. It has remained in near-continuous production since, evolving through calibres 321, 861, 1861 and today's Master Chronometer 3861 while keeping its asymmetric case, tachymeter bezel, and hesalite crystal.",
    notableFacts: [
      "The only watch qualified by NASA for all manned space missions.",
      "Worn on the lunar surface during Apollo 11 (though Armstrong left his in the module).",
      "Still hand-wound — an intentional nod to the original.",
      "Hesalite crystal version is favored by purists for its historical accuracy.",
    ],
    sources: [],
  });
}

function mockVet(): VetResult {
  return VetResultSchema.parse({
    brand: "Rolex",
    model: "Submariner Date",
    referenceNumber: "116610LN",
    verdict: "caution",
    confidence: 70,
    flags: [
      { severity: "green", title: "Dial text alignment", detail: "DEMO: Coronet and text spacing look consistent with a genuine 116610LN." },
      { severity: "yellow", title: "Date wheel font", detail: "DEMO: Verify the cyclops magnification (2.5x) and date font in a sharper macro shot." },
      { severity: "red", title: "Asking price too low", detail: "DEMO: Listed well below market — a classic red flag. Add an API key for real analysis." },
    ],
    estValueLow: 11000,
    estValueHigh: 14000,
    fairPriceNote: "DEMO MODE: Add ANTHROPIC_API_KEY to .env for real vetting.",
    summary:
      "DEMO MODE placeholder result. Photos alone can't certify authenticity — always confirm with papers, service history, and an in-person inspection for high-value pieces.",
    sources: [],
  });
}
