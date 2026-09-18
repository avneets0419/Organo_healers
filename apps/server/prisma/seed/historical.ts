/**
 * The three estimates from the supplied PDFs, line for line. Item names are kept
 * exactly as written in the originals (including "Fluetx") because a document
 * snapshot records what the customer actually received. Each line still links to
 * the matching catalog product by SKU.
 */
import { defaultLayout, type DocumentLayout } from "@organo/shared";

export const SOURCE_DOCS = {
  ASHOKA: { label: "Ashoka University estimate (17 Sep 2026)", date: new Date("2026-09-17T11:00:00+05:30") },
  OMAX: { label: "Sunil Saroha (OMAX) estimate (07 Sep 2026)", date: new Date("2026-09-07T11:00:00+05:30") },
  TDI: { label: "TDI Residential estimate (07 Sep 2026)", date: new Date("2026-09-07T12:00:00+05:30") },
} as const;

interface Line {
  name: string;
  sku?: string;
  qty: number;
  mrp?: number;
  rate: number;
  attributes?: Record<string, string>;
}
interface Group {
  name: string;
  items: Line[];
}
export interface HistoricalDocument {
  source: (typeof SOURCE_DOCS)[keyof typeof SOURCE_DOCS];
  customer: { name: string; companyName?: string };
  groups: Group[];
  terms: string;
  layout: DocumentLayout;
  expectedTotal: string;
}

const groundFloorPots = (withDraco: boolean): Line[] => [
  { name: "Flutex pot 18”", sku: "POT-GR-FLUTEX-18", qty: 2, mrp: 3299, rate: 2309 },
  { name: "Flutex 15”", sku: "POT-GR-FLUTEX-15", qty: 2, mrp: 2149, rate: 1505 },
  { name: "Vetro window 30” (staircase)", sku: "POT-GR-VETRO-WINDOW-30", qty: 2, mrp: 3849, rate: 2695 },
  { name: "Dracena martiana", sku: "PL-DRACAENA-MARTIANA", qty: 4, mrp: 750, rate: 650 },
  { name: "Prachin khumb", sku: "POT-PRACHIN-KHUMB", qty: 2, mrp: 5499, rate: 3850 },
  ...(withDraco
    ? [
        { name: "Draco dracena", sku: "PL-DRACO-DRACAENA", qty: 2, mrp: 10500, rate: 8500 },
        { name: "3 layer ficus", sku: "PL-FICUS-3-LAYER", qty: 2, mrp: 6500, rate: 5500 },
      ]
    : []),
];

const terrace: Line[] = [
  { name: "Flutex 18”", sku: "POT-GR-FLUTEX-18", qty: 2, mrp: 3299, rate: 2309 },
  { name: "Erica palm", sku: "PL-ARECA-PALM", qty: 2, mrp: 2350, rate: 2000 },
];

const balcony = (gateNote: boolean): Line[] => [
  { name: "Fluetx 18”", sku: "POT-GR-FLUTEX-18", qty: 3, mrp: 3299, rate: 2309 },
  { name: "Flutex 15”", sku: "POT-GR-FLUTEX-15", qty: 3, mrp: 2149, rate: 1505 },
  { name: "Red machira", sku: "PL-RED-MACHIRA", qty: 1, mrp: 450, rate: 300 },
  { name: "Chutiya ficus", sku: "PL-CHUTIYA-FICUS", qty: 3, mrp: 1200, rate: 850 },
  { name: gateNote ? "Flutex 15” (behind the gate)" : "Flutex 15”", sku: "POT-GR-FLUTEX-15", qty: 2, mrp: 2149, rate: 1505 },
  { name: "Money plant 3\"", sku: "PL-MONEY-PLANT-3", qty: 2, mrp: 600, rate: 550 },
];

const groundFloorPlants: Line[] = [
  { name: "Sunder rupa", sku: "PL-SUNDER-RUPA", qty: 30, mrp: 70, rate: 50 },
  { name: "Gardenia", sku: "PL-GARDENIA", qty: 30, mrp: 150, rate: 100 },
  { name: "Spiral medium(parsoon)", sku: "PL-SPIRAL-MEDIUM", qty: 2, mrp: 8000, rate: 7000 },
  { name: "Ficus tapori (3000)", sku: "PL-FICUS-TAPORI", qty: 2, mrp: 3500, rate: 3000 },
  { name: "Ficus tapori big(thick stem) (8.5k)", sku: "PL-FICUS-TAPORI-BIG", qty: 1, mrp: 10000, rate: 8500 },
  { name: "Loropetrum (big)", sku: "PL-LOROPETALUM-BIG", qty: 10, mrp: 700, rate: 600 },
  { name: "Raat ki raani", sku: "PL-RAAT-KI-RAANI", qty: 5, mrp: 200, rate: 150 },
  { name: "Desi gulab", sku: "PL-DESI-GULAB", qty: 5, mrp: 80, rate: 50 },
  { name: "Corso (30)", sku: "POT-GR-CORSO-30", qty: 1, mrp: 3749, rate: 2625 },
  { name: "Cycus (7000)", sku: "PL-CYCAS", qty: 1, mrp: 7000, rate: 6000 },
];

const materials: Line[] = [
  { name: "Bio fertilizer", sku: "MAT-BIO-FERTILIZER", qty: 50, mrp: 20, rate: 18 },
  { name: "Neem oil cakes", sku: "MAT-NEEM-CAKE", qty: 20, mrp: 120, rate: 100 },
  { name: "Labour", sku: "SVC-LABOUR", qty: 1, rate: 20000 },
  { name: "Coco chips", sku: "MAT-COCO-CHIPS", qty: 50, mrp: 60, rate: 55 },
  { name: "Soil media", sku: "MAT-SOIL-MEDIA", qty: 150, mrp: 120, rate: 100 },
  { name: "Transport", sku: "SVC-TRANSPORT", qty: 1, rate: 2000 },
];

const tree = (name: string, sku: string, bagSize: string, height: string, qty: number, rate: number): Line => ({
  name,
  sku,
  qty,
  rate,
  attributes: { bagSize, height },
});

export const HISTORICAL_DOCUMENTS: HistoricalDocument[] = [
  {
    source: SOURCE_DOCS.OMAX,
    customer: { name: "Sunil Saroha (OMAX)", companyName: "OMAX" },
    groups: [
      { name: "GROUND FLOOR, POTS IN WHITE", items: groundFloorPots(true) },
      { name: "FIRST FLOOR (terrace garden)", items: terrace },
      { name: "FIRST FLOOR (balcony)", items: balcony(true) },
      { name: "GROUND FLOOR PLANTS", items: groundFloorPlants },
      { name: "", items: materials },
    ],
    terms: "Material will be delivered within the week after order confirmation.",
    layout: defaultLayout("particulars"),
    expectedTotal: "169613",
  },
  {
    source: SOURCE_DOCS.TDI,
    customer: { name: "TDI Residential" },
    groups: [
      { name: "GROUND FLOOR, POTS IN WHITE", items: groundFloorPots(false) },
      { name: "FIRST FLOOR (terrace garden)", items: terrace },
      { name: "FIRST FLOOR (balcony)", items: balcony(false) },
      { name: "GROUND FLOOR PLANTS", items: groundFloorPlants },
    ],
    terms: "Material will be delivered within the week after order confirmation.",
    layout: defaultLayout("particulars"),
    expectedTotal: "98963",
  },
  {
    source: SOURCE_DOCS.ASHOKA,
    customer: { name: "Ashoka University" },
    groups: [
      {
        name: "",
        items: [
          tree("safed siris", "TR-SAFED-SIRIS-21", "21 x 21", "7-8 ft", 22, 180),
          tree("Siras", "TR-SIRAS-21", "21 x 21", "7-8 ft", 27, 180),
          tree("Lasura /Lasoda", "TR-LASODA-18", "18 x 18", "7-8 ft", 31, 0),
          tree("takoli", "TR-TAKOLI-18", "18 x 18", "7-8 ft", 33, 0),
          tree("Bargad", "TR-BARGAD-21", "21 x 21", "7-8 ft", 5, 650),
          tree("Pilkhan", "TR-PILKHAN-21", "21 x 21", "7-8 ft", 3, 650),
          tree("lokhandi", "TR-LOKHANDI-15", "15 x 15", "5-6 ft", 38, 0),
          tree("kaanju", "TR-KAANJU-18", "18 x 18", "7-8 ft", 17, 0),
          tree("Mahua", "TR-MAHUA-18", "18 x 18", "7-8 ft", 14, 0),
          tree("karanj", "TR-KARANJ-18", "18 x 18", "7-8 ft", 39, 180),
          tree("reetha", "TR-REETHA-18", "18 x 18", "7-8 ft", 10, 180),
          tree("kosam", "TR-KOSAM-21", "21 x 21", "7-8 ft", 27, 280),
          tree("desi kadamb", "TR-DESI-KADAMB-18", "18 x 18", "7-8 ft", 25, 180),
          tree("amaltas", "TR-AMALTAS-18", "18 x 18", "7-8 ft", 14, 280),
          tree("arjun", "TR-ARJUN-18", "18 x 18", "7-8 ft", 18, 180),
        ],
      },
    ],
    terms: "Material will be delivered within the week after order confirmation.\nTransportation as per actual.",
    layout: defaultLayout("trees"),
    expectedTotal: "42060",
  },
];
