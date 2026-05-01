import { checkProviderBudget } from "./provider-budget";

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
}

const EBAY_QUERY_PROMPT = `You are an eBay search query optimizer. Your output will be used directly as an eBay sold listings search query. Given a raw product name (and, when provided, up to 5 real seller listing titles for the same item), produce the best possible eBay search query to find this exact item's sold listings.

Rules:
- Keep: brand name, model name/number, product type/category. When seller listing titles are provided, prefer the brand/model wording sellers actually use over noisy retail copy.
- Aim for 3-5 keywords. Hard cap: 8 words.
- Keep model numbers and hyphenated names exactly as they appear (e.g. "WH-1000XM5", "Air Max 90", "High-Rise").
- If a strong brand + model number is present, you may drop the generic product-type word (e.g. "Sony WH-1000XM5" already implies headphones).
- For media titles (DVDs, Blu-rays, books, video games), keep the franchise/title plus the format ("DVD", "Blu-ray") and phrases like "Complete Series" or "Box Set" if present. Drop disc counts, season ranges, ratings, and edition fluff.
- Remove: colors, sizes, conditions (NWT, NWOT, NIB, etc.), retailer names (Amazon, Walmart, Target, Mercari, Costco), marketing words (premium, authentic, genuine, exclusive, limited, professional), measurements, quantities, "free shipping", URLs, social handles.
- Return ONLY the search query, nothing else. No quotes, no explanation, no commentary.
- Do NOT add words that weren't in the original product name or the seller listing titles.
- Think about what an eBay seller would title this listing as.

Examples:
Input: "Nike Air Max 90 Men's Running Shoes Size 10.5 Black/White - Brand New NWT Free Shipping"
Output: Nike Air Max 90 Running Shoes

Input: "Sony WH-1000XM5 Wireless Noise Canceling Over-Ear Headphones - Silver - Authentic"
Output: Sony WH-1000XM5

Input: "Supernatural The Complete Series 86-DVD Box Set Seasons 1-15 Sealed New"
Output: Supernatural Complete Series DVD Box Set

Input: "Homedics Shiatsu Massager with Heat - Professional Back Neck Foot Therapy"
Listing titles:
- HoMedics Shiatsu Pro Plus Massager with Heat — back & neck
- HoMedics SBM-179H Shiatsu Massage Cushion with Heat
Output: Homedics Shiatsu Massager Heat

Input: "Vintage Pyrex 404 Large Mixing Bowl Yellow 4 Quart"
Output: Vintage Pyrex 404 Mixing Bowl

Input: "Stanley 40oz Adventure Quencher Travel Tumbler - Pool Blue"
Output: Stanley Adventure Quencher Tumbler

Input: "Crocs Classic Clog - White - Men's Size 10"
Output: Crocs Classic Clog`;

export async function cleanQueryWithAI(
  rawQuery: string,
  listingTitles?: string[],
  customerKey?: string,
  isPro?: boolean,
): Promise<string | null> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!baseUrl || !apiKey) {
    console.log("AI query cleaning skipped: env vars not set");
    return null;
  }

  // P0-8: per-Pro-customer monthly budget cap.
  // customerKey + isPro are optional for backward compatibility (callers
  // that don't provide them get cap-checked as if they were a free user,
  // which means the call always proceeds — same as before this change).
  if (customerKey && isPro) {
    const budgetOk = await checkProviderBudget("gemini", customerKey, isPro);
    if (!budgetOk) {
      console.log("AI query cleaning skipped: monthly cap reached");
      return null;
    }
  }

  const sanitizedTitles = Array.isArray(listingTitles)
    ? listingTitles
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 0 && t.length <= 200)
        .slice(0, 5)
    : [];

  const userMessage =
    sanitizedTitles.length > 0
      ? `Product name: ${rawQuery}\nListing titles:\n${sanitizedTitles.map((t) => `- ${t}`).join("\n")}`
      : rawQuery;

  try {
    const url = `${baseUrl}/models/gemini-2.5-flash:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: EBAY_QUERY_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(
        `AI query cleaning HTTP ${response.status}: ${errText.slice(0, 200)}`,
      );
      return null;
    }

    const data: GeminiResponse = await response.json();
    const cleaned = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!cleaned || cleaned.length < 3 || cleaned.length > 100) {
      console.log(`AI query cleaning returned unusable result: "${cleaned}"`);
      return null;
    }

    const wordCount = cleaned.split(/\s+/).length;
    if (wordCount < 2) {
      console.log(
        `AI query cleaning too broad (single word): "${cleaned}" — falling back to regex`,
      );
      return null;
    }

    console.log(
      `AI query cleaning: "${rawQuery.slice(0, 60)}"${sanitizedTitles.length > 0 ? ` (+${sanitizedTitles.length} titles)` : ""} → "${cleaned}"`,
    );
    return cleaned;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`AI query cleaning failed (falling back to regex): ${message}`);
    return null;
  }
}
