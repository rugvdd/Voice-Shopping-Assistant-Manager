/**
 * nlp.js
 * ---------------------------------------------------------------------------
 * Lightweight, dependency-free intent parser.
 *
 * This is a rule-based NLU layer (patterns + number-word parsing) rather than
 * a full ML model, which keeps the whole app runnable offline in the browser
 * with zero API keys. The pattern list is intentionally broad so that varied
 * phrasing ("I need apples", "add apples", "put apples on the list", "buy
 * some apples") all resolve to the same intent. See README for how to swap
 * this out for a cloud NLU service (Dialogflow / Amazon Lex / an LLM call)
 * without touching the rest of the app — parseCommand() is the only contract.
 * ---------------------------------------------------------------------------
 */

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12,
  couple: 2, few: 3,
};

// Words that should be stripped once quantity/unit have been extracted.
const UNITS = ["bottles of", "bottle of", "bags of", "bag of", "cans of", "can of",
  "boxes of", "box of", "packs of", "pack of", "liters of", "liter of", "kg of", "kilos of"];

function extractQuantity(text) {
  let qty = 1;
  let remainder = text;

  // Numeric digit, e.g. "2 bottles of water"
  const digitMatch = remainder.match(/\b(\d+)\b/);
  if (digitMatch) {
    qty = parseInt(digitMatch[1], 10);
    remainder = remainder.replace(digitMatch[0], "").trim();
  } else {
    // Word numbers, e.g. "two apples", "a dozen eggs".
    // Check longer/more specific words (e.g. "dozen") before generic
    // articles ("a", "an") so "a dozen eggs" resolves to 12, not 1.
    const orderedWords = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length);
    for (const word of orderedWords) {
      const re = new RegExp(`\\b${word}\\b`, "i");
      if (re.test(remainder)) {
        qty = NUMBER_WORDS[word];
        remainder = remainder.replace(re, "").trim();
        break;
      }
    }
  }

  // Strip unit phrases like "bottles of"
  for (const unit of UNITS) {
    const re = new RegExp(unit, "i");
    if (re.test(remainder)) {
      remainder = remainder.replace(re, "").trim();
      break;
    }
  }

  return { qty, remainder: remainder.trim() };
}

function cleanItemName(text) {
  return text
    .replace(/\b(to|on|from) (my|the) list\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Strips leading articles/prepositions left behind once a quantity word
// (e.g. "a couple of onions" -> "couple" removed -> "a of onions") has
// been extracted, and collapses stray whitespace.
function normalizeLeftovers(text) {
  return text
    .replace(/^(some|a|an|the|of)\s+/i, "")
    .replace(/^(some|a|an|the|of)\s+/i, "") // run twice for "a of onions" -> "onions"
    .replace(/\s+/g, " ")
    .trim();
}

// Ordered pattern table. First match wins, so more specific intents
// (search, price filter) are listed before the generic add/remove ones.
const PATTERNS = [
  {
    intent: "SEARCH_PRICE",
    // "find toothpaste under $5" / "search for apples between $2 and $6" / "toothpaste under 5 dollars"
    regex: /\b(?:find|search(?: for)?|look for)\s+(.+?)\s+(under|below|less than)\s+\$?(\d+(?:\.\d+)?)/i,
    build: (m) => ({ intent: "SEARCH", term: cleanItemName(m[1]), maxPrice: parseFloat(m[3]) }),
  },
  {
    intent: "SEARCH_BRAND",
    // "find organic apples" / "search for Colgate toothpaste"
    regex: /\b(?:find|search(?: for)?|look for)\s+me?\s*(.+)/i,
    build: (m) => ({ intent: "SEARCH", term: cleanItemName(m[1]) }),
  },
  {
    intent: "REMOVE",
    // "remove milk from my list" / "delete apples" / "take eggs off the list"
    regex: /\b(?:remove|delete|take off|cross off)\s+(.+)/i,
    build: (m) => {
      const { qty, remainder } = extractQuantity(cleanItemName(m[1]));
      return { intent: "REMOVE", item: remainder, qty };
    },
  },
  {
    intent: "MODIFY_QTY",
    // "change milk to 3" / "make it 4 apples" / "update quantity of eggs to 6"
    regex: /\b(?:change|update|set)\s+(?:quantity of\s+)?(.+?)\s+to\s+(\d+)/i,
    build: (m) => ({ intent: "MODIFY_QTY", item: cleanItemName(m[1]), qty: parseInt(m[2], 10) }),
  },
  {
    intent: "ADD",
    // "add milk", "I need apples", "I want to buy bananas", "get some bread",
    // "put rice on the list", "buy 2 oranges", "we're out of butter"
    regex: /\b(?:add|i need|i want(?: to buy)?|buy|get|put|pick up|grab|we(?:'re| are) out of)\s+(.+)/i,
    build: (m) => {
      const { qty, remainder } = extractQuantity(cleanItemName(m[1]));
      return { intent: "ADD", item: remainder, qty };
    },
  },
];

/**
 * parseCommand(rawText) -> structured intent object
 * This is the single contract the rest of the app depends on.
 */
function parseCommand(rawText) {
  const text = rawText.trim().replace(/[.!?]+$/, "");
  if (!text) return { intent: "UNKNOWN", raw: rawText };

  for (const pattern of PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const parsed = pattern.build(match);
      parsed.raw = rawText;
      if (parsed.item !== undefined) parsed.item = normalizeLeftovers(parsed.item);
      if (parsed.term !== undefined) parsed.term = normalizeLeftovers(parsed.term);
      return parsed;
    }
  }

  // Fallback: treat a bare noun phrase as an ADD ("bananas")
  const { qty, remainder } = extractQuantity(cleanItemName(text));
  const finalItem = normalizeLeftovers(remainder);
  if (finalItem) return { intent: "ADD", item: finalItem, qty, raw: rawText, guessed: true };

  return { intent: "UNKNOWN", raw: rawText };
}

window.AssistantNLP = { parseCommand, extractQuantity };
