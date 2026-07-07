/**
 * Bestemmingenbeheer via de UI: toevoegen met seizoensdata, inplannen en de
 * verwijder-blokkade zolang er verblijven naar verwijzen.
 * (ASCII-testtitels: Chromium weigert stilletjes unicode-paden bij setInputFiles.)
 */
import { expect, test, type Page } from "@playwright/test";

async function openFreshApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Oost-Azië 2027" })).toBeVisible();
}

test("bestemming toevoegen met seizoensdata en direct inplannen", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Bestemmingen" }).click();
  await expect(page.getByText("21 bestemmingen")).toBeVisible();

  await page.getByRole("button", { name: "+ Bestemming toevoegen" }).click();
  await page.getByLabel("Naam").fill("Nikko");
  await page.getByLabel("Land").fill("Japan");
  // Geplakt "lat, lng"-paar splitst automatisch over beide velden.
  await page.getByLabel("Breedtegraad (lat)").fill("36.7198, 139.6982");
  await expect(page.getByLabel("Lengtegraad (lng)")).toHaveValue("139.6982");
  await expect(page.getByLabel("Breedtegraad (lat)")).toHaveValue("36.7198");
  await page.getByLabel("Activiteiten (komma-gescheiden)").fill("tempels, watervallen");

  await page.getByRole("button", { name: "+ Periode" }).click();
  await page.getByLabel("Periode", { exact: true }).selectOption("2027-08-H2");
  await page.getByLabel("Rating").selectOption("5");

  await page.getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByRole("button", { name: /Nikko/ })).toBeVisible();
  await expect(page.getByText("22 bestemmingen")).toBeVisible();

  // Direct inplannen: de seizoensdata moet in de planning zichtbaar worden.
  await page.getByRole("button", { name: "Planning" }).click();
  await page.getByRole("button", { name: "+ Segment toevoegen" }).click();
  await page.getByLabel("Bestemming").selectOption({ label: "Nikko" });
  await page.getByLabel("Startdatum").fill("2027-08-20");
  await page.getByLabel("Nachten").fill("3");
  // De editor toont live de seizoensbeoordeling van het gekozen venster.
  await expect(
    page.getByRole("dialog", { name: "Nieuw verblijf" }).getByText("seizoen 5/5"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Opslaan" }).click();

  const segmentCard = page.getByRole("button", { name: /Nikko/ });
  await expect(segmentCard).toBeVisible();
  await expect(segmentCard.getByText("seizoen 5/5")).toBeVisible();
});

test("bestemming met verblijven verwijderen wordt geblokkeerd", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Bestemmingen" }).click();
  await page.getByRole("button", { name: /Kyoto/ }).click();
  await expect(page.getByRole("heading", { name: "Bestemming bewerken" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Verwijderen", exact: true }).click();

  await expect(page.getByText(/nog 1 verblijf in de planning/)).toBeVisible();

  // Kyoto bestaat nog steeds.
  await page.getByRole("button", { name: "Annuleren" }).click();
  await expect(page.getByRole("button", { name: /Kyoto/ })).toBeVisible();
});

test("bewerken-knop op de kaart opent de bestemmingseditor", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Kaart" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();

  // Open een marker-popup en klik Bewerken.
  await page.locator("path.leaflet-interactive").last().click();
  await page.getByRole("button", { name: "Bewerken" }).click();

  await expect(page.getByRole("heading", { name: "Bestemming bewerken" })).toBeVisible();
  await expect(page.getByLabel("Naam")).not.toHaveValue("");
});
