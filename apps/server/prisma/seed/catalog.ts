/**
 * Initial catalog, transcribed from the documents Organo Healers supplied:
 *
 *  [ASHOKA]  "Ashoka university .pdf"        Estimate, 17 Sep 2026, trees with bag size + height
 *  [OMAX]    "Sunil saroha (OMAX).pdf"       Estimate, 07 Sep 2026, pots / plants / materials / labour
 *  [TDI]     "TDI residential.pdf"           Estimate, 07 Sep 2026, subset of OMAX + payment details
 *  [GREENRI] "Greenri_Lush_Series May26.pdf" Supplier planter catalogue with MRPs
 *
 * Rules applied
 *  - Nothing is invented. Where a document gives no price, sellingPrice is 0 and
 *    attributes.priceOnRequest = true so the POS asks for a rate.
 *  - Greenri MRPs are catalogue prices. Organo's estimates price these planters at
 *    MRP less 30%, rounded up (2149 -> 1505, 3849 -> 2695, 3749 -> 2625). Where an
 *    estimate shows an actual rate we keep that (Flutex 18" -> 2309), otherwise we
 *    apply the same convention.
 *  - Every rate observed in a historical estimate is also written to price history.
 *  - Stock starts at 0: the documents don't state stock levels. Record opening
 *    stock from Inventory once counted.
 *  - Scientific names are filled only where the local name maps unambiguously.
 */

export type Kind = "PLANT" | "POT" | "MATERIAL" | "SERVICE" | "OTHER";

export interface SeedCategory {
  slug: string;
  name: string;
  kind: Kind;
  sortOrder: number;
}

export const CATEGORIES: SeedCategory[] = [
  { slug: "trees", name: "Trees", kind: "PLANT", sortOrder: 10 },
  { slug: "indoor-plants", name: "Indoor Plants", kind: "PLANT", sortOrder: 20 },
  { slug: "outdoor-plants", name: "Outdoor Plants", kind: "PLANT", sortOrder: 30 },
  { slug: "plants", name: "Plants", kind: "PLANT", sortOrder: 40 },
  { slug: "pots-planters", name: "Pots & Planters", kind: "POT", sortOrder: 50 },
  { slug: "fertilizers", name: "Fertilizers", kind: "MATERIAL", sortOrder: 60 },
  { slug: "soil-media", name: "Soil & Media", kind: "MATERIAL", sortOrder: 70 },
  { slug: "garden-materials", name: "Garden Materials", kind: "MATERIAL", sortOrder: 80 },
  { slug: "labour", name: "Labour", kind: "SERVICE", sortOrder: 90 },
  { slug: "transportation", name: "Transportation", kind: "SERVICE", sortOrder: 100 },
  { slug: "services", name: "Services", kind: "SERVICE", sortOrder: 110 },
  { slug: "other", name: "Other", kind: "OTHER", sortOrder: 120 },
];

export interface HistoricalPrice {
  doc: "ASHOKA" | "OMAX" | "TDI";
  mrp?: number;
  rate: number;
}

export interface SeedProduct {
  sku: string;
  name: string;
  kind: Kind;
  category: string; // slug
  unit?: string;
  mrp?: number;
  sellingPrice: number;
  description?: string;
  attributes?: Record<string, string | boolean | null>;
  history?: HistoricalPrice[];
  catalogue?: boolean; // MRP from the Greenri catalogue
  priceNote?: string;
}

// ─── Trees (Ashoka University estimate) ──────────────────────────────────────

const tree = (
  key: string,
  name: string,
  localName: string,
  bagSize: string,
  height: string,
  rate: number | null,
  scientificName: string | null,
): SeedProduct => ({
  sku: `TR-${key}`,
  name,
  kind: "PLANT",
  category: "trees",
  unit: "plant",
  sellingPrice: rate ?? 0,
  attributes: {
    localName,
    scientificName,
    bagSize,
    height,
    plantType: "Tree",
    ...(rate === null ? { priceOnRequest: true } : {}),
  },
  history: rate === null ? [] : [{ doc: "ASHOKA", rate }],
});

export const TREES: SeedProduct[] = [
  tree("SAFED-SIRIS-21", "Safed Siris", "safed siris", "21 x 21", "7-8 ft", 180, "Albizia procera"),
  tree("SIRAS-21", "Siras", "Siras", "21 x 21", "7-8 ft", 180, "Albizia lebbeck"),
  tree("LASODA-18", "Lasoda", "Lasura / Lasoda", "18 x 18", "7-8 ft", null, "Cordia dichotoma"),
  tree("TAKOLI-18", "Takoli", "takoli", "18 x 18", "7-8 ft", null, null),
  tree("BARGAD-21", "Bargad", "Bargad", "21 x 21", "7-8 ft", 650, "Ficus benghalensis"),
  tree("PILKHAN-21", "Pilkhan", "Pilkhan", "21 x 21", "7-8 ft", 650, "Ficus virens"),
  tree("LOKHANDI-15", "Lokhandi", "lokhandi", "15 x 15", "5-6 ft", null, null),
  tree("KAANJU-18", "Kaanju", "kaanju", "18 x 18", "7-8 ft", null, "Holoptelea integrifolia"),
  tree("MAHUA-18", "Mahua", "Mahua", "18 x 18", "7-8 ft", null, "Madhuca longifolia"),
  tree("KARANJ-18", "Karanj", "karanj", "18 x 18", "7-8 ft", 180, "Pongamia pinnata"),
  tree("REETHA-18", "Reetha", "reetha", "18 x 18", "7-8 ft", 180, "Sapindus mukorossi"),
  tree("KOSAM-21", "Kosam", "kosam", "21 x 21", "7-8 ft", 280, "Schleichera oleosa"),
  tree("DESI-KADAMB-18", "Desi Kadamb", "desi kadamb", "18 x 18", "7-8 ft", 180, null),
  tree("AMALTAS-18", "Amaltas", "amaltas", "18 x 18", "7-8 ft", 280, "Cassia fistula"),
  tree("ARJUN-18", "Arjun", "arjun", "18 x 18", "7-8 ft", 180, "Terminalia arjuna"),
];

// ─── Plants (OMAX + TDI estimates) ───────────────────────────────────────────

const plant = (
  sku: string,
  name: string,
  category: string,
  mrp: number,
  rate: number,
  docs: Array<"OMAX" | "TDI">,
  attributes: Record<string, string | null> = {},
): SeedProduct => ({
  sku,
  name,
  kind: "PLANT",
  category,
  unit: "plant",
  mrp,
  sellingPrice: rate,
  attributes,
  history: docs.map((doc) => ({ doc, mrp, rate })),
});

export const PLANTS: SeedProduct[] = [
  plant("PL-DRACAENA-MARTIANA", "Dracaena Martiana", "indoor-plants", 750, 650, ["OMAX", "TDI"], { localName: "Dracena martiana" }),
  plant("PL-DRACO-DRACAENA", "Draco Dracaena", "outdoor-plants", 10500, 8500, ["OMAX"], { localName: "Draco dracena", scientificName: "Dracaena draco" }),
  plant("PL-FICUS-3-LAYER", "Ficus 3 Layer", "outdoor-plants", 6500, 5500, ["OMAX"], { localName: "3 layer ficus" }),
  plant("PL-ARECA-PALM", "Areca Palm", "indoor-plants", 2350, 2000, ["OMAX", "TDI"], { localName: "Erica palm", scientificName: "Dypsis lutescens" }),
  plant("PL-RED-MACHIRA", "Red Machira", "plants", 450, 300, ["OMAX", "TDI"], { localName: "Red machira" }),
  plant("PL-CHUTIYA-FICUS", "Chutiya Ficus", "plants", 1200, 850, ["OMAX", "TDI"], { localName: "Chutiya ficus" }),
  plant("PL-MONEY-PLANT-3", "Money Plant 3\"", "indoor-plants", 600, 550, ["OMAX", "TDI"], { localName: "Money plant", scientificName: "Epipremnum aureum", potSize: "3\"" }),
  plant("PL-SUNDER-RUPA", "Sunder Rupa", "plants", 70, 50, ["OMAX", "TDI"], { localName: "Sunder rupa" }),
  plant("PL-GARDENIA", "Gardenia", "outdoor-plants", 150, 100, ["OMAX", "TDI"], { scientificName: "Gardenia jasminoides" }),
  plant("PL-SPIRAL-MEDIUM", "Spiral Topiary (Medium)", "outdoor-plants", 8000, 7000, ["OMAX", "TDI"], { localName: "Spiral medium (parsoon)", plantType: "Topiary" }),
  plant("PL-FICUS-TAPORI", "Ficus Tapori", "outdoor-plants", 3500, 3000, ["OMAX", "TDI"], { localName: "Ficus tapori" }),
  plant("PL-FICUS-TAPORI-BIG", "Ficus Tapori Big (thick stem)", "outdoor-plants", 10000, 8500, ["OMAX", "TDI"], { localName: "Ficus tapori big (thick stem)" }),
  plant("PL-LOROPETALUM-BIG", "Loropetalum (Big)", "outdoor-plants", 700, 600, ["OMAX", "TDI"], { localName: "Loropetrum (big)", scientificName: "Loropetalum chinense" }),
  plant("PL-RAAT-KI-RAANI", "Raat Ki Raani", "outdoor-plants", 200, 150, ["OMAX", "TDI"], { scientificName: "Cestrum nocturnum" }),
  plant("PL-DESI-GULAB", "Desi Gulab", "outdoor-plants", 80, 50, ["OMAX", "TDI"], { localName: "Desi gulab", scientificName: "Rosa" }),
  plant("PL-CYCAS", "Cycas", "outdoor-plants", 7000, 6000, ["OMAX", "TDI"], { localName: "Cycus", scientificName: "Cycas revoluta" }),
];

// ─── Materials & services (OMAX estimate) ────────────────────────────────────

export const MATERIALS_AND_SERVICES: SeedProduct[] = [
  {
    sku: "MAT-BIO-FERTILIZER",
    name: "Bio Fertilizer",
    kind: "MATERIAL",
    category: "fertilizers",
    unit: "unit",
    mrp: 20,
    sellingPrice: 18,
    attributes: { materialType: "Fertilizer" },
    history: [{ doc: "OMAX", mrp: 20, rate: 18 }],
  },
  {
    sku: "MAT-NEEM-CAKE",
    name: "Neem Oil Cake",
    kind: "MATERIAL",
    category: "fertilizers",
    unit: "unit",
    mrp: 120,
    sellingPrice: 100,
    attributes: { materialType: "Fertilizer" },
    history: [{ doc: "OMAX", mrp: 120, rate: 100 }],
  },
  {
    sku: "MAT-COCO-CHIPS",
    name: "Coco Chips",
    kind: "MATERIAL",
    category: "soil-media",
    unit: "unit",
    mrp: 60,
    sellingPrice: 55,
    attributes: { materialType: "Mulch" },
    history: [{ doc: "OMAX", mrp: 60, rate: 55 }],
  },
  {
    sku: "MAT-SOIL-MEDIA",
    name: "Soil Media",
    kind: "MATERIAL",
    category: "soil-media",
    unit: "unit",
    mrp: 120,
    sellingPrice: 100,
    attributes: { materialType: "Potting mix" },
    history: [{ doc: "OMAX", mrp: 120, rate: 100 }],
  },
  {
    sku: "SVC-LABOUR",
    name: "Labour",
    kind: "SERVICE",
    category: "labour",
    unit: "job",
    sellingPrice: 0,
    description: "Installation / planting labour. Priced per job.",
    attributes: { serviceType: "Installation", priceOnRequest: true },
    history: [{ doc: "OMAX", rate: 20000 }],
  },
  {
    sku: "SVC-TRANSPORT",
    name: "Transport",
    kind: "SERVICE",
    category: "transportation",
    unit: "trip",
    sellingPrice: 0,
    description: "Transportation as per actual.",
    attributes: { serviceType: "Transportation", priceOnRequest: true },
    history: [{ doc: "OMAX", rate: 2000 }],
  },
];

// ─── Pots ────────────────────────────────────────────────────────────────────

/** Not in the Greenri catalogue; seen in OMAX/TDI at MRP 5499, rate 3850. */
export const OTHER_POTS: SeedProduct[] = [
  {
    sku: "POT-PRACHIN-KHUMB",
    name: "Prachin Khumb",
    kind: "POT",
    category: "pots-planters",
    unit: "pc",
    mrp: 5499,
    sellingPrice: 3850,
    attributes: { material: null },
    history: [
      { doc: "OMAX", mrp: 5499, rate: 3850 },
      { doc: "TDI", mrp: 5499, rate: 3850 },
    ],
  },
];

const GREENRI_COLOURS = "Marble White, Marble Beige, Marble Grey, Mosaic Grey, Antique Bronze, Desert Stone";

interface GreenriRow {
  dims: string; // W x H, or L x W x H for windows
  size: string; // short size label used in the name
  packOf?: number;
  mrp: number;
  rate?: number; // actual rate seen in an estimate
  history?: HistoricalPrice[];
}

const greenriSeries: Array<{ series: string; code: string; rows: GreenriRow[]; note?: string; baseplate?: boolean }> = [
  {
    series: "Vetro",
    code: "VETRO",
    baseplate: true,
    rows: [
      { size: "8\"", dims: "8 x 8 in", packOf: 10, mrp: 549 },
      { size: "10\"", dims: "10 x 10 in", packOf: 5, mrp: 849 },
      { size: "12\"", dims: "12 x 12 in", packOf: 5, mrp: 1149 },
      { size: "15\"", dims: "15 x 15 in", packOf: 3, mrp: 1549 },
      { size: "18\"", dims: "18 x 18 in", packOf: 1, mrp: 2449 },
      { size: "22\"", dims: "22 x 22 in", packOf: 1, mrp: 4399 },
      { size: "26\"", dims: "26 x 26 in", packOf: 1, mrp: 6599 },
    ],
  },
  { series: "Vetro Vase", code: "VETRO-VASE", rows: [{ size: "17\"", dims: "17 x 26 in", packOf: 1, mrp: 4399 }] },
  {
    series: "Vetro Window",
    code: "VETRO-WINDOW",
    baseplate: true,
    rows: [
      { size: "24\"", dims: "24 x 11 x 11 in", mrp: 2949 },
      {
        size: "30\"",
        dims: "30 x 12 x 12 in",
        mrp: 3849,
        rate: 2695,
        history: [
          { doc: "OMAX", mrp: 3849, rate: 2695 },
          { doc: "TDI", mrp: 3849, rate: 2695 },
        ],
      },
      { size: "36\"", dims: "36 x 13 x 14 in", mrp: 5499 },
    ],
  },
  {
    series: "Grandeur",
    code: "GRANDEUR",
    baseplate: true,
    rows: [
      { size: "12\"", dims: "12 x 12 in", packOf: 4, mrp: 1299 },
      { size: "16\"", dims: "16 x 16 in", packOf: 1, mrp: 2199 },
      { size: "20\"", dims: "20 x 20 in", packOf: 1, mrp: 3649 },
      { size: "24\"", dims: "24 x 24 in", packOf: 1, mrp: 7149 },
    ],
  },
  {
    series: "I Grandeur",
    code: "I-GRANDEUR",
    baseplate: true,
    rows: [
      { size: "11.5\"", dims: "11.5 x 18 in", packOf: 3, mrp: 1899 },
      { size: "15.5\"", dims: "15.5 x 24 in", packOf: 1, mrp: 3199 },
      { size: "20\"", dims: "20 x 30 in", packOf: 1, mrp: 5499 },
    ],
  },
  {
    series: "I Aura",
    code: "I-AURA",
    note: "Matt black & rose gold metal strip.",
    rows: [
      { size: "12\"", dims: "12 x 25 in", packOf: 1, mrp: 3299 },
      { size: "15\"", dims: "15 x 30 in", packOf: 1, mrp: 5749 },
    ],
  },
  {
    series: "Flutex",
    code: "FLUTEX",
    baseplate: true,
    rows: [
      { size: "12\"", dims: "12 x 12 in", packOf: 1, mrp: 1449 },
      {
        size: "15\"",
        dims: "15 x 15 in",
        packOf: 1,
        mrp: 2149,
        rate: 1505,
        history: [
          { doc: "OMAX", mrp: 2149, rate: 1505 },
          { doc: "TDI", mrp: 2149, rate: 1505 },
        ],
      },
      {
        size: "18\"",
        dims: "18 x 18 in",
        packOf: 1,
        mrp: 3299,
        rate: 2309,
        history: [
          { doc: "OMAX", mrp: 3299, rate: 2309 },
          { doc: "TDI", mrp: 3299, rate: 2309 },
        ],
      },
    ],
  },
  { series: "Flutex Window", code: "FLUTEX-WINDOW", baseplate: true, rows: [{ size: "30\"", dims: "30 x 10.5 x 14.5 in", mrp: 3949 }] },
  {
    series: "Legacy",
    code: "LEGACY",
    rows: [
      { size: "12\"", dims: "12 x 12 in", packOf: 1, mrp: 1449 },
      { size: "16\"", dims: "16 x 16 in", packOf: 1, mrp: 3099 },
      { size: "20\"", dims: "20 x 20 in", packOf: 1, mrp: 5399 },
    ],
  },
  { series: "I Legacy", code: "I-LEGACY", rows: [{ size: "16\"", dims: "16 x 28.5 in", packOf: 1, mrp: 4399 }] },
  {
    series: "Legacy Window",
    code: "LEGACY-WINDOW",
    rows: [
      { size: "24\"", dims: "24 x 10 x 10 in", mrp: 2199 },
      { size: "36\"", dims: "36 x 14 x 14 in", mrp: 4949 },
    ],
  },
  {
    series: "Linear",
    code: "LINEAR",
    baseplate: true,
    rows: [
      { size: "12\"", dims: "12 x 12 in", packOf: 5, mrp: 1199 },
      { size: "15\"", dims: "15 x 15 in", packOf: 1, mrp: 1899 },
      { size: "18\"", dims: "18 x 18 in", packOf: 1, mrp: 2699 },
    ],
  },
  {
    series: "Face Lift",
    code: "FACE-LIFT",
    rows: [
      { size: "9.5\"", dims: "9.5 x 10 in", packOf: 6, mrp: 849 },
      { size: "14\"", dims: "14 x 15 in", packOf: 1, mrp: 2049 },
    ],
  },
  {
    series: "Castle",
    code: "CASTLE",
    baseplate: true,
    rows: [
      { size: "10\"", dims: "10 x 10 in", packOf: 10, mrp: 799 },
      { size: "12\"", dims: "12 x 12 in", packOf: 6, mrp: 1149 },
      { size: "14\"", dims: "14 x 14 in", packOf: 1, mrp: 1599 },
      { size: "16\"", dims: "16 x 16 in", packOf: 1, mrp: 2249 },
      { size: "18\"", dims: "18 x 18 in", packOf: 1, mrp: 3099 },
      { size: "20\"", dims: "20 x 20 in", packOf: 1, mrp: 3849 },
    ],
  },
  {
    series: "I-Castle",
    code: "I-CASTLE",
    baseplate: true,
    rows: [
      { size: "12\"", dims: "12 x 18 in", packOf: 1, mrp: 1849 },
      { size: "16\"", dims: "16 x 26 in", packOf: 1, mrp: 3899 },
      { size: "22\"", dims: "22 x 36 in", packOf: 1, mrp: 9899 },
    ],
  },
  {
    series: "Cube X",
    code: "CUBE-X",
    rows: [
      { size: "6\"", dims: "6 x 6 in", packOf: 12, mrp: 449 },
      { size: "8\"", dims: "8 x 8 in", packOf: 6, mrp: 899 },
      { size: "10\"", dims: "10 x 10 in", packOf: 4, mrp: 1149 },
      { size: "14\"", dims: "14 x 14 in", packOf: 1, mrp: 2449 },
    ],
  },
  {
    series: "Cube X Window",
    code: "CUBE-X-WINDOW",
    rows: [
      { size: "24\"", dims: "24 x 12 x 12 in", mrp: 3299 },
      { size: "30\"", dims: "30 x 12 x 12 in", mrp: 3849 },
      { size: "36\"", dims: "36 x 13 x 13 in", mrp: 5499 },
      { size: "24\" S", dims: "24 x 6 x 7 in", mrp: 1649 },
    ],
  },
  {
    series: "Casa",
    code: "CASA",
    baseplate: true,
    rows: [
      { size: "10\"", dims: "10 x 10 in", packOf: 5, mrp: 699 },
      { size: "12\"", dims: "12 x 12 in", packOf: 5, mrp: 1049 },
      { size: "16\"", dims: "16 x 16 in", packOf: 1, mrp: 1949 },
      { size: "20\"", dims: "20 x 20 in", packOf: 1, mrp: 3049 },
    ],
  },
  {
    series: "Casa Window",
    code: "CASA-WINDOW",
    baseplate: true,
    rows: [
      { size: "18\"", dims: "18 x 8 x 8 in", packOf: 6, mrp: 1099 },
      { size: "24\"", dims: "24 x 11 x 11 in", packOf: 3, mrp: 2299 },
    ],
  },
  {
    series: "Corso",
    code: "CORSO",
    rows: [
      { size: "15\"", dims: "15 x 8.5 in", packOf: 7, mrp: 899 },
      { size: "20\"", dims: "20 x 10 in", packOf: 1, mrp: 1649 },
      { size: "25\"", dims: "25 x 12 in", packOf: 1, mrp: 2649 },
      {
        size: "30\"",
        dims: "30 x 13 in",
        packOf: 1,
        mrp: 3749,
        rate: 2625,
        history: [
          { doc: "OMAX", mrp: 3749, rate: 2625 },
          { doc: "TDI", mrp: 3749, rate: 2625 },
        ],
      },
    ],
  },
  {
    series: "Tulsi",
    code: "TULSI",
    rows: [
      { size: "10\"", dims: "10 x 10 x 10 in", mrp: 1099 },
      { size: "12\"", dims: "12 x 12 x 12 in", mrp: 1549 },
    ],
  },
  { series: "Loopix", code: "LOOPIX", note: "Includes 6 inch inner pot.", rows: [{ size: "20\"", dims: "20 x 8 in", packOf: 1, mrp: 849 }] },
  {
    series: "Avenue",
    code: "AVENUE",
    baseplate: true,
    rows: [
      { size: "10\"", dims: "10 x 8 in", packOf: 10, mrp: 649 },
      { size: "12\"", dims: "12 x 10 in", packOf: 5, mrp: 899 },
      { size: "14\"", dims: "14 x 10.5 in", packOf: 5, mrp: 1399 },
      { size: "18\"", dims: "18 x 14.5 in", packOf: 1, mrp: 1799 },
      { size: "22\"", dims: "22 x 18.5 in", packOf: 1, mrp: 3299 },
      { size: "26\"", dims: "26 x 22.5 in", packOf: 1, mrp: 4949 },
    ],
  },
  {
    series: "Andora",
    code: "ANDORA",
    baseplate: true,
    rows: [
      { size: "8\"", dims: "8 x 9 in", packOf: 10, mrp: 549 },
      { size: "12\"", dims: "12 x 12 in", packOf: 5, mrp: 999 },
      { size: "16\"", dims: "16 x 18 in", packOf: 1, mrp: 2549 },
      { size: "20\"", dims: "20 x 22 in", packOf: 1, mrp: 4249 },
      { size: "24\"", dims: "24 x 26 in", packOf: 1, mrp: 5849 },
      { size: "28\"", dims: "28 x 30 in", packOf: 1, mrp: 8449 },
    ],
  },
  { series: "Estate", code: "ESTATE", rows: [{ size: "20\"", dims: "20 x 32 in", packOf: 1, mrp: 5499 }] },
  {
    series: "Terreno",
    code: "TERRENO",
    rows: [
      { size: "6\"", dims: "6 x 6 in", packOf: 12, mrp: 349 },
      { size: "10\"", dims: "10 x 11 in", packOf: 8, mrp: 599 },
      { size: "14\"", dims: "14 x 14 in", packOf: 1, mrp: 1049 },
      { size: "17\"", dims: "17 x 18 in", packOf: 1, mrp: 2199 },
    ],
  },
  {
    series: "I Terreno",
    code: "I-TERRENO",
    rows: [
      { size: "15\"", dims: "15 x 21 in", packOf: 1, mrp: 1949 },
      { size: "19\"", dims: "19 x 25 in", packOf: 1, mrp: 3649 },
    ],
  },
  {
    series: "Giga",
    code: "GIGA",
    rows: [
      { size: "22\"", dims: "22 x 15 in", packOf: 1, mrp: 3299 },
      { size: "27\"", dims: "27 x 18 in", packOf: 1, mrp: 4399 },
      { size: "32\"", dims: "32 x 22 in", packOf: 1, mrp: 7149 },
    ],
  },
];

/** MRP less 30%, rounded up to the rupee (the convention seen in the estimates). */
export function organoRate(mrp: number): number {
  return Math.ceil((mrp * 70) / 100);
}

export const GREENRI_POTS: SeedProduct[] = greenriSeries.flatMap((s) =>
  s.rows.map((r) => ({
    sku: `POT-GR-${s.code}-${r.size.replace(/[^0-9.A-Z]/gi, "").replace(".", "_")}`,
    name: `${s.series} ${r.size}`,
    kind: "POT" as const,
    category: "pots-planters",
    unit: "pc",
    mrp: r.mrp,
    sellingPrice: r.rate ?? organoRate(r.mrp),
    description: [s.note, s.baseplate ? "Base plate included." : null].filter(Boolean).join(" ") || undefined,
    attributes: {
      brand: "Greenri",
      series: `Lush / ${s.series}`,
      potSize: r.size,
      dimensions: r.dims,
      material: "Roto-moulded recyclable polymer",
      color: GREENRI_COLOURS,
      packOf: r.packOf ? String(r.packOf) : null,
    },
    history: r.history ?? [],
    catalogue: true,
    priceNote: r.rate ? "Rate from historical estimate" : "Rate = MRP less 30%, rounded up",
  })),
);

export const ALL_PRODUCTS: SeedProduct[] = [...TREES, ...PLANTS, ...OTHER_POTS, ...GREENRI_POTS, ...MATERIALS_AND_SERVICES];
