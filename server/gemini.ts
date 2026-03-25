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

const EBAY_QUERY_PROMPT = `You are an eBay search query optimizer. Your output will be used directly as an eBay sold listings search query. Given a raw product name or description, produce the best possible eBay search query to find this exact item's sold listings.

Rules:
- Keep: brand name, model name/number, product type/category
- Keep model numbers and hyphenated names exactly as they appear (e.g. "WH-1000XM5", "Air Max 90", "High-Rise")
- Remove: colors, sizes, conditions (NWT, NWOT, etc.), retailer names (Amazon, Walmart, Target), marketing words (premium, authentic, genuine, exclusive), measurements, quantities, "free shipping", URLs, social handles
- If there's a clear brand + model (e.g. "Nike Air Max 90", "Sony WH-1000XM5"), return just that with the product type
- If there's no clear model number, keep brand + the most specific product descriptor
- Return ONLY the search query, nothing else. No quotes, no explanation, no commentary.
- Keep it under 8 words
- Do NOT add words that weren't in the original query
- Think about what an eBay seller would title this listing as

Examples:
Input: "Nike Air Max 90 Men's Running Shoes Size 10.5 Black/White - Brand New NWT Free Shipping"
Output: Nike Air Max 90 Running Shoes

Input: "Lululemon Align High-Rise Pant 25" Women's Yoga Leggings Dark Olive Size 6 NWT"
Output: Lululemon Align High-Rise Pant Leggings

Input: "Sony WH-1000XM5 Wireless Noise Canceling Over-Ear Headphones - Silver - Authentic"
Output: Sony WH-1000XM5 Headphones

Input: "Vintage Pyrex 404 Large Mixing Bowl Yellow 4 Quart"
Output: Vintage Pyrex 404 Mixing Bowl

Input: "Stanley 40oz Adventure Quencher Travel Tumbler - Pool Blue"
Output: Stanley Adventure Quencher Tumbler

Input: "Crocs Classic Clog - White - Men's Size 10"
Output: Crocs Classic Clog`;

export async function cleanQueryWithAI(rawQuery: string): Promise<string | null> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!baseUrl || !apiKey) {
    console.log("AI query cleaning skipped: env vars not set");
    return null;
  }

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
        contents: [{ role: "user", parts: [{ text: rawQuery }] }],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`AI query cleaning HTTP ${response.status}: ${errText.slice(0, 200)}`);
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
      console.log(`AI query cleaning too broad (single word): "${cleaned}" — falling back to regex`);
      return null;
    }

    console.log(`AI query cleaning: "${rawQuery.slice(0, 60)}" → "${cleaned}"`);
    return cleaned;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`AI query cleaning failed (falling back to regex): ${message}`);
    return null;
  }
}
