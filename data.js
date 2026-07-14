/**
 * data.js
 * ---------------------------------------------------------------------------
 * Mock "backend" for the assistant. In a real deployment this would live in
 * Firestore / DynamoDB and be swapped out behind the same function names
 * (getCatalog, getHistory, saveHistory, ...) so nothing else in the app
 * would need to change.
 * ---------------------------------------------------------------------------
 */

// ---- Category keyword map -> used to auto-categorize free-text items -------
const CATEGORY_RULES = [
  { category: "Dairy & Eggs", icon: "🥛", keywords: ["milk", "cheese", "yogurt", "yoghurt", "butter", "egg", "cream", "paneer"] },
  { category: "Produce", icon: "🥦", keywords: ["apple", "banana", "orange", "grape", "tomato", "onion", "potato", "spinach", "lettuce", "carrot", "cucumber", "mango", "berry", "berries", "avocado", "garlic", "pepper", "broccoli", "lemon"] },
  { category: "Bakery", icon: "🍞", keywords: ["bread", "bun", "bagel", "croissant", "roll", "cake"] },
  { category: "Meat & Seafood", icon: "🍗", keywords: ["chicken", "beef", "pork", "fish", "shrimp", "mutton", "bacon", "sausage", "salmon"] },
  { category: "Beverages", icon: "🥤", keywords: ["water", "juice", "soda", "coffee", "tea", "cola", "beer", "wine"] },
  { category: "Snacks", icon: "🍿", keywords: ["chips", "cookie", "cracker", "chocolate", "candy", "popcorn", "nuts"] },
  { category: "Pantry", icon: "🥫", keywords: ["rice", "pasta", "flour", "sugar", "salt", "oil", "sauce", "cereal", "beans", "soup", "spice"] },
  { category: "Household", icon: "🧻", keywords: ["toothpaste", "soap", "shampoo", "detergent", "tissue", "paper towel", "cleaner", "toilet paper"] },
];

function categorize(itemName) {
  const lower = itemName.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { category: rule.category, icon: rule.icon };
    }
  }
  return { category: "Other", icon: "🛒" };
}

// ---- Substitute suggestions --------------------------------------------
const SUBSTITUTES = {
  milk: ["almond milk", "oat milk", "soy milk"],
  bread: ["whole wheat bread", "sourdough", "gluten-free bread"],
  butter: ["margarine", "ghee", "plant-based butter"],
  sugar: ["honey", "stevia", "brown sugar"],
  chicken: ["tofu", "turkey", "paneer"],
  toothpaste: ["fluoride-free toothpaste", "whitening toothpaste"],
};

// ---- Seasonal / on-sale items (would come from a merchandising feed) ----
// Keyed by month (0 = Jan) to keep the demo lively regardless of when it runs.
const SEASONAL_BY_MONTH = {
  0: ["oranges", "grapefruit", "kale"],
  1: ["strawberries", "leeks"],
  2: ["asparagus", "peas", "spinach"],
  3: ["artichokes", "radishes"],
  4: ["cherries", "apricots"],
  5: ["watermelon", "corn", "zucchini"],
  6: ["blueberries", "peaches", "tomatoes"],
  7: ["plums", "bell peppers"],
  8: ["figs", "grapes", "pumpkin"],
  9: ["apples", "sweet potatoes", "pears"],
  10: ["cranberries", "brussels sprouts"],
  11: ["clementines", "pomegranate"],
};

function getSeasonalSuggestions() {
  const month = new Date().getMonth();
  return SEASONAL_BY_MONTH[month] || [];
}

// ---- Purchase history (simulated) — used for "running low" suggestions --
// daysSincePurchased / typicalCycleDays lets us estimate when a household
// is likely to be running low on a staple.
let PURCHASE_HISTORY = [
  { item: "milk", typicalCycleDays: 7, lastPurchased: daysAgo(7) },
  { item: "bread", typicalCycleDays: 5, lastPurchased: daysAgo(6) },
  { item: "eggs", typicalCycleDays: 10, lastPurchased: daysAgo(3) },
  { item: "bananas", typicalCycleDays: 6, lastPurchased: daysAgo(2) },
  { item: "coffee", typicalCycleDays: 14, lastPurchased: daysAgo(15) },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function getRunningLowSuggestions() {
  const now = new Date();
  return PURCHASE_HISTORY.filter((entry) => {
    const last = new Date(entry.lastPurchased);
    const diffDays = (now - last) / (1000 * 60 * 60 * 24);
    return diffDays >= entry.typicalCycleDays * 0.85; // "about due" threshold
  }).map((entry) => entry.item);
}

// ---- Mini product catalog for the "search" feature -----------------------
const CATALOG = [
  { name: "Organic Apples", brand: "Nature's Best", category: "Produce", price: 4.99, tags: ["organic", "apple"] },
  { name: "Regular Apples", brand: "FarmFresh", category: "Produce", price: 2.99, tags: ["apple"] },
  { name: "Organic Bananas", brand: "Nature's Best", category: "Produce", price: 1.99, tags: ["organic", "banana"] },
  { name: "Whitening Toothpaste", brand: "Colgate", category: "Household", price: 3.49, tags: ["toothpaste"] },
  { name: "Sensitive Toothpaste", brand: "Sensodyne", category: "Household", price: 6.99, tags: ["toothpaste"] },
  { name: "Kids Toothpaste", brand: "Crest", category: "Household", price: 2.49, tags: ["toothpaste"] },
  { name: "Whole Milk 1L", brand: "DairyPure", category: "Dairy & Eggs", price: 2.29, tags: ["milk"] },
  { name: "Almond Milk 1L", brand: "Silk", category: "Dairy & Eggs", price: 3.79, tags: ["milk", "almond"] },
  { name: "Sourdough Loaf", brand: "Artisan Bakehouse", category: "Bakery", price: 4.5, tags: ["bread"] },
  { name: "Whole Wheat Bread", brand: "Nature's Best", category: "Bakery", price: 3.2, tags: ["bread"] },
];

function searchCatalog({ term, brand, maxPrice, minPrice }) {
  return CATALOG.filter((p) => {
    const haystack = `${p.name} ${p.brand} ${p.tags.join(" ")}`.toLowerCase();
    if (term && !haystack.includes(term.toLowerCase())) return false;
    if (brand && !p.brand.toLowerCase().includes(brand.toLowerCase())) return false;
    if (typeof maxPrice === "number" && p.price > maxPrice) return false;
    if (typeof minPrice === "number" && p.price < minPrice) return false;
    return true;
  });
}

// Exposed as a global namespace since this is a plain-script, no-build app.
window.AssistantData = {
  categorize,
  SUBSTITUTES,
  getSeasonalSuggestions,
  getRunningLowSuggestions,
  searchCatalog,
  CATALOG,
};
