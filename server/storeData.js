import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadStoreData() {
  const dataPath = path.join(__dirname, "../data/shopify-store.json");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}
