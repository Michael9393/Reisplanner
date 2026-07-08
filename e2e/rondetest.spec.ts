/**
 * De import/export-rondetest uit het plan, in een echte browser:
 * seed → export → alle lokale data wissen → import → zelfde reis terug,
 * en een tweede export die byte-gelijk is aan de eerste.
 */

import fs from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// Elke Playwright-test krijgt een verse browsercontext (schone IndexedDB),
// dus de app laadt hier altijd de seed.
async function openFreshApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Oost-Azië 2027" })).toBeVisible();
}

// Let op: testtitels bewust zonder unicode-tekens — de titel wordt de
// test-results-mapnaam, en Chromium weigert stilletjes bestandspaden met
// tekens als "→" in setInputFiles.
test("rondetest: seed, export, alles wissen, import zonder dataverlies", async ({ page }) => {
  await openFreshApp(page);

  // Seed vult de planning: 126 van 126 nachten gepland.
  await expect(page.getByText("126 / 126")).toBeVisible();

  // Exporteer en bewaar de download.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporteren", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("oost-azie-2027.json");
  const exportPath = test.info().outputPath("export-1.json");
  await download.saveAs(exportPath);
  const firstExport = fs.readFileSync(exportPath, "utf8");
  expect(firstExport).toContain('"schemaVersion": 1');

  // Wis alle lokale data (dialoog bevestigen).
  await page.getByRole("button", { name: "Back-up & data" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Alle lokale data wissen" }).click();
  await expect(page.getByText("Geen reis in de lokale opslag")).toBeVisible();

  // Importeer het zojuist geëxporteerde bestand vanuit de lege staat.
  await page.locator('input[type="file"]').setInputFiles(exportPath);
  await expect(page.getByRole("heading", { name: "Oost-Azië 2027" })).toBeVisible();
  await page.getByRole("button", { name: "Planning" }).click();
  await expect(page.getByText("126 / 126")).toBeVisible();

  // Tweede export is byte-gelijk aan de eerste: geen dataverlies.
  const secondDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporteren", exact: true }).click();
  const secondDownload = await secondDownloadPromise;
  const secondPath = test.info().outputPath("export-2.json");
  await secondDownload.saveAs(secondPath);
  expect(fs.readFileSync(secondPath, "utf8")).toBe(firstExport);
});

test("corrupte JSON wordt geweigerd en de bestaande reis blijft intact", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Back-up & data" }).click();
  const corruptPath = test.info().outputPath("corrupt.json");
  fs.writeFileSync(corruptPath, "{ dit is geen json ");
  await page.locator('input[type="file"]').setInputFiles(corruptPath);

  await expect(page.getByText("Import geweigerd:")).toBeVisible();
  await expect(page.getByText(/geen geldige JSON/)).toBeVisible();

  // Reis is onaangetast.
  await page.getByRole("button", { name: "Planning" }).click();
  await expect(page.getByText("126 / 126")).toBeVisible();
});

test("een te groot bestand wordt geweigerd zonder het in te lezen", async ({ page }) => {
  await openFreshApp(page);

  const bigPath = test.info().outputPath("veel-te-groot.json");
  fs.writeFileSync(bigPath, Buffer.alloc(11 * 1024 * 1024, 0x20)); // 11 MB spaties

  await page.getByRole("button", { name: "Back-up & data" }).click();
  await page.locator('input[type="file"]').setInputFiles(bigPath);

  await expect(page.getByText(/begrensd op 10 MB/)).toBeVisible();

  // Reis is onaangetast.
  await page.getByRole("button", { name: "Planning" }).click();
  await expect(page.getByText("126 / 126")).toBeVisible();
});

test("kaart centreert op de bestemmingen van een geimporteerde reis", async ({ page }) => {
  await openFreshApp(page);

  // Mini-reis aan de andere kant van de wereld: zonder hercentrering blijft
  // de kaart op Oost-Azie staan en valt deze marker buiten beeld.
  const doc = {
    meta: {
      id: "trip-ijsland",
      title: "IJsland test",
      startDate: "2027-05-10",
      endDate: "2027-05-17",
      durationWeeks: 1,
      currency: "EUR",
      schemaVersion: 1,
    },
    destinations: [
      {
        id: "is-reykjavik",
        name: "Reykjavik",
        country: "IJsland",
        coords: { lat: 64.1466, lng: -21.9426 },
        activities: ["stad"],
        status: "vast",
        seasonal: [],
        notes: "",
      },
    ],
    itinerary: [
      {
        id: "seg-rvk",
        destinationId: "is-reykjavik",
        startDate: "2027-05-10",
        nights: 7,
        status: "vast",
        notes: "",
      },
    ],
    transport: [],
    budget: { categories: [], items: [] },
    packing: [],
  };
  const docPath = test.info().outputPath("ijsland.json");
  fs.writeFileSync(docPath, JSON.stringify(doc));

  await page.getByRole("button", { name: "Back-up & data" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles(docPath);
  await expect(page.getByRole("heading", { name: "IJsland test" })).toBeVisible();

  await page.getByRole("button", { name: "Kaart" }).click();
  const marker = page.locator("path.leaflet-interactive").first();
  await expect(marker).toBeVisible();

  const viewport = page.viewportSize()!;
  const box = (await marker.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
});

test("JSON met kapotte referentie wordt geweigerd met een duidelijke fout", async ({ page }) => {
  await openFreshApp(page);

  // Exporteer eerst een geldig document en maak er één referentie in kapot.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporteren", exact: true }).click();
  const download = await downloadPromise;
  const validPath = test.info().outputPath("valid.json");
  await download.saveAs(validPath);

  const doc = JSON.parse(fs.readFileSync(validPath, "utf8"));
  doc.itinerary[0].destinationId = "bestaat-niet";
  const brokenPath = test.info().outputPath("broken-ref.json");
  fs.writeFileSync(brokenPath, JSON.stringify(doc));

  await page.getByRole("button", { name: "Back-up & data" }).click();
  await page.locator('input[type="file"]').setInputFiles(brokenPath);

  await expect(page.getByText("Import geweigerd:")).toBeVisible();
  await expect(page.getByText(/bestaat-niet/)).toBeVisible();
});

test("segment bewerken: duur en status aanpassen werkt door in de planning", async ({ page }) => {
  await openFreshApp(page);

  // Open het Kyoto-verblijf en maak er 4 nachten van. "nachten Kyoto" matcht
  // de segmentkaart, niet de transportlegs "Takayama – Kyoto"/"Kyoto – Tokyo".
  await page.getByRole("button", { name: /nachten Kyoto/ }).click();
  await expect(page.getByRole("heading", { name: "Verblijf bewerken" })).toBeVisible();
  await page.getByLabel("Nachten").fill("4");
  // Bewust niet meeschuiven: we testen hier de gatdetectie.
  await page.getByRole("dialog").getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Opslaan" }).click();

  // Totaal zakt van 126 naar 123 en de aansluiting toont een gat.
  await expect(page.getByText("123 / 126")).toBeVisible();
  await expect(page.getByText(/Gat van 3 nachten/)).toBeVisible();
});

test("kaart, budget en paklijst tonen de seed-data", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Kaart" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  // 21 bestemmingen als cirkelmarkers in de overlay-pane.
  await expect(page.locator("path.leaflet-interactive")).toHaveCount(22); // 21 markers + 1 routelijn

  await page.getByRole("button", { name: "Budget" }).click();
  await expect(page.getByText("Gepland totaal")).toBeVisible();
  // Som van alle geplande posten in de seed; verschijnt als totaal én als
  // verschil (er is nog niets werkelijk uitgegeven).
  await expect(page.getByText("€ 26.220")).toHaveCount(2);

  await page.getByRole("button", { name: "Paklijst" }).click();
  await expect(page.getByText(/0 van 26 ingepakt/)).toBeVisible();
  // Vink één item af. Bewust click() en geen check(): de checkbox is een
  // controlled component die pas omklapt nadat de IndexedDB-write rond is.
  await page.getByRole("checkbox").first().click();
  await expect(page.getByText(/1 van 26 ingepakt/)).toBeVisible();
});
