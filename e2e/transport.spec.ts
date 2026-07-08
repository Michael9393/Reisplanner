/**
 * Transportbeheer en kettingverschuiving via de UI.
 * (ASCII-testtitels: Chromium weigert stilletjes unicode-paden bij setInputFiles.)
 */
import { expect, type Page, test } from "@playwright/test";

async function openFreshApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Oost-Azië 2027" })).toBeVisible();
}

test("twee nachten langer in Beijing schuift de hele keten mee", async ({ page }) => {
  await openFreshApp(page);
  await expect(page.getByText("126 / 126")).toBeVisible();

  // "nachten Beijing" matcht de segmentkaart, niet de transportleg
  // "Amsterdam – Beijing".
  await page.getByRole("button", { name: /nachten Beijing/ }).click();
  await expect(page.getByRole("heading", { name: "Verblijf bewerken" })).toBeVisible();
  await page.getByLabel("Nachten").fill("9");

  // De verschuivingspreview verschijnt met exacte aantallen en staat aan.
  await expect(page.getByText(/19 verblijven en 20 transporten 2 dagen later/)).toBeVisible();
  const checkbox = page.getByRole("dialog").getByRole("checkbox");
  await expect(checkbox).toBeChecked();

  await page.getByRole("button", { name: "Opslaan" }).click();

  // Totaal wordt 128 en de keten blijft sluitend: geen gaten of overlaps.
  await expect(page.getByText("128 / 126")).toBeVisible();
  await expect(page.getByText(/Gat van/)).toHaveCount(0);
  await expect(page.getByText(/Overlap van/)).toHaveCount(0);
  // Xi'an is meegeschoven naar 19 mei.
  await expect(page.getByRole("button", { name: /nachten Xi'an/ })).toContainText("19 mei");
});

test("zonder vinkje schuift alleen het bewerkte verblijf", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: /nachten Beijing/ }).click();
  await page.getByLabel("Nachten").fill("9");
  await page.getByRole("dialog").getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Opslaan" }).click();

  // Nu ontstaat er een overlap met het volgende verblijf.
  await expect(page.getByText("128 / 126")).toBeVisible();
  await expect(page.getByText(/Overlap van 2 nachten/)).toBeVisible();
});

test("transport bewerken via de tijdlijn", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: /Amsterdam – Beijing/ }).click();
  await expect(page.getByRole("heading", { name: "Transport bewerken" })).toBeVisible();
  await page.getByLabel(/Geschatte kosten/).fill("1500");
  await page.getByRole("button", { name: "Opslaan" }).click();

  await expect(page.getByText("± € 1.500")).toBeVisible();
});

test("transport toevoegen en weer verwijderen", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "+ Transport", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nieuw transport" })).toBeVisible();
  await page.getByLabel("Vervoer").selectOption("boot");
  await page.getByLabel("Omschrijving").fill("Ferry testroute");
  await page.getByLabel(/Geschatte kosten/).fill("75");
  await page.getByRole("button", { name: "Opslaan" }).click();

  const row = page.getByRole("button", { name: /Ferry testroute/ });
  await expect(row).toBeVisible();

  await row.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Verwijderen", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ferry testroute/ })).toHaveCount(0);
});
