const ingredientGroups = [
  group("garlic", "Garlic, Knoblauch, Knoflook", [
    "garlic",
    "garlic clove",
    "garlic cloves",
    "clove of garlic",
    "cloves of garlic",
    "knoblauch",
    "knoblauchzehe",
    "knoblauchzehen",
    "knoflook",
    "knoflookteen",
    "knoflooktenen",
    "teentje knoflook",
    "teentjes knoflook"
  ]),
  group("onion", "Onion, Zwiebel, Ui", ["onion", "onions", "zwiebel", "zwiebeln", "ui", "uien"]),
  group("tomato", "Tomato, Tomate, Tomaat", ["tomato", "tomatoes", "tomate", "tomaten", "tomaat", "tomaten"]),
  group("potato", "Potato, Kartoffel, Aardappel", ["potato", "potatoes", "kartoffel", "kartoffeln", "aardappel", "aardappelen"]),
  group("carrot", "Carrot, Karotte, Wortel", ["carrot", "carrots", "karotte", "karotten", "mohre", "moehre", "wortel", "wortels"]),
  group("egg", "Egg, Ei, Ei", ["egg", "eggs", "ei", "eier"]),
  group("milk", "Milk, Milch, Melk", ["milk", "milch", "melk"]),
  group("cream", "Cream, Sahne, Room", ["cream", "double cream", "heavy cream", "sahne", "schlagsahne", "room", "slagroom"]),
  group("butter", "Butter, Butter, Boter", ["butter", "boter"]),
  group("flour", "Flour, Mehl, Bloem", ["flour", "all purpose flour", "all-purpose flour", "mehl", "bloem"]),
  group("sugar", "Sugar, Zucker, Suiker", ["sugar", "caster sugar", "brown sugar", "zucker", "suiker", "basterdsuiker"]),
  group("salt", "Salt, Salz, Zout", ["salt", "sea salt", "salz", "zout"]),
  group("pepper", "Pepper, Pfeffer, Peper", ["pepper", "black pepper", "white pepper", "pfeffer", "peper"]),
  group("olive-oil", "Olive oil, Oliven\u00f6l, Olijfolie", ["olive oil", "olivenol", "olivenoel", "olijfolie"]),
  group("oil", "Oil, \u00d6l, Olie", ["oil", "vegetable oil", "sunflower oil", "sunflower seed oil", "ol", "oel", "olie", "zonnebloemolie"]),
  group("lemon", "Lemon, Zitrone, Citroen", ["lemon", "lemons", "zitrone", "zitronen", "citroen", "citroenen"]),
  group("lime", "Lime, Limette, Limoen", ["lime", "limes", "limette", "limetten", "limoen", "limoenen"]),
  group("parsley", "Parsley, Petersilie, Peterselie", ["parsley", "flat leaf parsley", "petersilie", "peterselie"]),
  group("cilantro", "Cilantro, Koriander, Koriander", ["cilantro", "coriander", "fresh coriander", "koriander"]),
  group("basil", "Basil, Basilikum, Basilicum", ["basil", "basilikum", "basilicum"]),
  group("mint", "Mint, Minze, Munt", ["mint", "mint leaf", "mint leaves", "mint leav", "minze", "munt"]),
  group("thyme", "Thyme, Thymian, Tijm", ["thyme", "thymian", "tijm"]),
  group("rosemary", "Rosemary, Rosmarin, Rozemarijn", ["rosemary", "rosmarin", "rozemarijn"]),
  group("oregano", "Oregano, Oregano, Oregano", ["oregano"]),
  group("spinach", "Spinach, Spinat, Spinazie", ["spinach", "baby spinach", "spinat", "spinazie"]),
  group("mushroom", "Mushroom, Pilz, Champignon", ["mushroom", "mushrooms", "pilz", "pilze", "champignon", "champignons"]),
  group("parmesan", "Parmesan, Parmesan, Parmezaanse kaas", [
    "parmesan",
    "parmesan cheese",
    "parmigiano",
    "parmezaanse kaas",
    "parmezaanse kaa",
    "parmezaan"
  ]),
  group("cheese", "Cheese, K\u00e4se, Kaas", ["cheese", "cheddar", "kaese", "kase", "kaas"]),
  group("rice", "Rice, Reis, Rijst", ["rice", "basmati rice", "jasmine rice", "reis", "rijst"]),
  group("pasta", "Pasta, Pasta, Pasta", ["pasta", "spaghetti", "macaroni", "penne", "nudeln"]),
  group("noodles", "Noodles, Nudeln, Noedels", ["noodles", "rice noodles", "nudeln", "noedels"]),
  group("tofu", "Tofu, Tofu, Tofu", ["tofu"]),
  group("chicken", "Chicken, H\u00e4hnchen, Kip", ["chicken", "chicken breast", "hahnchen", "haehnchen", "huhn", "kip"]),
  group("beef", "Beef, Rindfleisch, Rundvlees", ["beef", "rindfleisch", "rundvlees"]),
  group("pork", "Pork, Schwein, Varkensvlees", ["pork", "schwein", "schweinefleisch", "varkensvlees"]),
  group("fish", "Fish, Fisch, Vis", ["fish", "fisch", "vis"]),
  group("shrimp", "Shrimp, Garnele, Garnaal", ["shrimp", "shrimps", "prawn", "prawns", "garnele", "garnelen", "garnaal", "garnalen"]),
  group("yogurt", "Yogurt, Joghurt, Yoghurt", ["yogurt", "yoghurt", "joghurt"]),
  group("honey", "Honey, Honig, Honing", ["honey", "honig", "honing"]),
  group("soy-sauce", "Soy sauce, Sojasauce, Sojasaus", ["soy sauce", "soya sauce", "sojasauce", "sojasaus"]),
  group("vinegar", "Vinegar, Essig, Azijn", ["vinegar", "apple cider vinegar", "red wine vinegar", "white wine vinegar", "essig", "azijn"]),
  group("apple", "Apple, Apfel, Appel", ["apple", "apples", "apfel", "apfel", "appel", "appels"]),
  group("banana", "Banana, Banane, Banaan", ["banana", "bananas", "banane", "bananen", "banaan", "bananen"])
];

const aliasEntries = ingredientGroups
  .flatMap((item) => item.terms.map((term) => [term, item]))
  .sort((left, right) => right[0].length - left[0].length);

const groupByKey = new Map(ingredientGroups.map((item) => [item.key, item]));
const groupByAlias = new Map(aliasEntries);

export function ingredientFilterOption(ingredient) {
  const raw = ingredient?.name || ingredient?.originalText || "";
  const cleaned = ingredientFilterName(ingredient);
  const groupItem = findIngredientGroup(cleaned) || findIngredientGroup(raw);

  if (groupItem) {
    return {
      key: groupItem.key,
      label: groupItem.label,
      terms: groupItem.terms
    };
  }

  const label = titleCase(cleaned || raw);
  const normalized = normalizeIngredientAlias(label || raw);

  return {
    key: `custom:${normalized || "ingredient"}`,
    label,
    terms: uniqueTerms([raw, cleaned, label])
  };
}

export function ingredientFilterLabelForKey(key, options = []) {
  const option = options.find((item) => item.key === key);
  if (option) return option.label;

  const knownGroup = groupByKey.get(key);
  if (knownGroup) return knownGroup.label;

  return titleCase(String(key || "").replace(/^custom:/, "").replace(/-/g, " "));
}

export function ingredientSearchTerms(ingredient) {
  const option = ingredientFilterOption(ingredient);
  return uniqueTerms([
    ingredient?.name || "",
    ingredient?.originalText || "",
    ingredientFilterName(ingredient),
    option.label,
    ...option.terms
  ]);
}

export function ingredientMatchesFilter(ingredient, selectedKey) {
  return ingredientFilterOption(ingredient).key === selectedKey;
}

export function ingredientFilterName(ingredient) {
  const raw = ingredient?.name || ingredient?.originalText || "";
  let name = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[,;].*$/g, " ")
    .replace(
      /\b(?:whisked|beaten|roasted|coarsely chopped|finely chopped|roughly chopped|chopped|diced|minced|sliced|grated|peeled|crushed|melted|softened|baked|zested|juiced|cut into\b.*|in wedges\b.*|into wedges\b.*|grob gehackt|fein gehackt|grob gew\u00fcrfelt|geschnitten|gehobelt|zersto\u00dfen|trocken getupft|fijngehakt|grof gehakt|gesneden|in blokjes|geplet)\b.*$/i,
      " "
    )
    .replace(/\b(?:fresh|extra firm|firm|large|small|medium|ripe|whole|ground|black|white|red|yellow|green|verse|frische?|kleine?|gro\u00dfe?|middelgrote?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) name = raw.trim();
  name = repairIngredientName(name);
  name = singularIngredientName(name);
  return name ? titleCase(name) : "";
}

function group(key, label, aliases) {
  const terms = uniqueTerms([label, ...label.split(","), ...aliases]);
  return { key, label, terms };
}

function findIngredientGroup(value) {
  const normalized = normalizeIngredientAlias(value);
  if (!normalized) return null;

  const exact = groupByAlias.get(normalized);
  if (exact) return exact;

  return aliasEntries.find(([alias]) => alias.length >= 4 && hasTerm(normalized, alias))?.[1] || null;
}

function hasTerm(value, term) {
  return value === term || value.startsWith(`${term} `) || value.endsWith(` ${term}`) || value.includes(` ${term} `);
}

function repairIngredientName(name) {
  return String(name)
    .replace(/\bparmezaanse\s+kaa\b/gi, "parmezaanse kaas")
    .replace(/\bmint\s+leav\b/gi, "mint leaves")
    .replace(/\bclov\b/gi, "clove");
}

function singularIngredientName(name) {
  const words = String(name).split(/\s+/).filter(Boolean);
  if (!words.length) return "";

  const last = words.pop();
  words.push(singularIngredientWord(last));
  return words.join(" ");
}

function singularIngredientWord(word) {
  const lower = word.toLowerCase();
  const irregular = {
    eggs: "egg",
    tomatoes: "tomato",
    potatoes: "potato",
    leaves: "leaf",
    leav: "leaf",
    cloves: "clove",
    clov: "clove",
    loaves: "loaf"
  };

  if (irregular[lower]) return irregular[lower];
  if (lower.endsWith("ies") && lower.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/.test(lower) && lower.length > 4) return word.slice(0, -2);
  if (lower.endsWith("s") && lower.length > 3 && !/(ss|us|is|as)$/.test(lower)) return word.slice(0, -1);
  return word;
}

function titleCase(value) {
  return String(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function uniqueTerms(values) {
  return [...new Set(values.map(normalizeIngredientAlias).filter(Boolean))];
}

function normalizeIngredientAlias(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
