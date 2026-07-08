/**
 * Kladblok: ideeën vastleggen via de plaats-autocomplete en promoveren tot
 * volwaardige bestemming. Extern verkeer (Photon, Open-Meteo) is gemockt
 * zodat de tests netwerk-onafhankelijk blijven.
 * (ASCII-testtitels: Chromium weigert stilletjes unicode-paden bij setInputFiles.)
 */
import { expect, type Page, test } from "@playwright/test";

const PHOTON_NIKKO = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [139.6982, 36.7198] },
      properties: { name: "Nikko", country: "Japan", state: "Tochigi", osm_value: "city" },
    },
  ],
};

async function openAppWithMocks(page: Page) {
  await page.route("https://photon.komoot.io/**", (route) => route.fulfill({ json: PHOTON_NIKKO }));
  // De achtergrond-klimaatfetch mag hier stil falen; dat pad is niet-blokkerend.
  await page.route("https://archive-api.open-meteo.com/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Oost-Azië 2027" })).toBeVisible();
}

test("autocomplete vult naam land coordinaten en link bij een idee", async ({ page }) => {
  await openAppWithMocks(page);

  await page.getByRole("button", { name: "Kladblok" }).click();
  await expect(page.getByText("Nog geen ideeën.")).toBeVisible();

  await page.getByLabel("Nieuw idee").fill("Nik");
  await page.getByRole("option", { name: /Nikko/ }).click();

  // De suggestie maakt direct een idee aan met land en Wikipedia-link.
  const card = page.getByRole("listitem").filter({ hasText: "Nikko" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Japan")).toBeVisible();
  const link = card.getByRole("link", { name: /Wikipedia/ });
  await expect(link).toHaveAttribute(
    "href",
    "https://nl.wikipedia.org/wiki/Special:Search?search=Nikko",
  );
});

test("kladblok idee toevoegen bewerken en promoveren tot bestemming", async ({ page }) => {
  await openAppWithMocks(page);

  await page.getByRole("button", { name: "Kladblok" }).click();

  // Kaal idee: alleen een naam, zonder suggestie.
  await page.getByLabel("Nieuw idee").fill("Geheime tip");
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  const card = page.getByRole("listitem").filter({ hasText: "Geheime tip" });
  await expect(card).toBeVisible();

  // Bewerken: notitie en land toevoegen.
  await card.getByRole("button", { name: "Bewerken" }).click();
  await expect(page.getByRole("heading", { name: "Idee bewerken" })).toBeVisible();
  await page.getByLabel("Land (optioneel)").fill("Japan");
  await page.getByLabel("Notities").fill("Tip van een vriend.");
  await page.getByRole("button", { name: "Opslaan" }).click();
  await expect(card.getByText("Tip van een vriend.")).toBeVisible();

  // Promoveren: de bestemmingseditor opent met prefill; coordinaten aanvullen.
  await card.getByRole("button", { name: "Promoveer naar bestemming" }).click();
  await expect(page.getByRole("heading", { name: "Nieuwe bestemming" })).toBeVisible();
  await expect(page.getByLabel("Naam")).toHaveValue("Geheime tip");
  await expect(page.getByLabel("Land", { exact: true })).toHaveValue("Japan");
  await page.getByLabel("Breedtegraad (lat)").fill("36.7198, 139.6982");
  await page.getByRole("button", { name: "Opslaan" }).click();

  // Het idee is weg en de bestemming bestaat.
  await expect(page.getByText("Nog geen ideeën.")).toBeVisible();
  await page.getByRole("button", { name: "Bestemmingen" }).click();
  await expect(page.getByText("22 bestemmingen")).toBeVisible();
  await expect(page.getByRole("button", { name: /Geheime tip/ })).toBeVisible();
});

test("idee verwijderen na bevestiging", async ({ page }) => {
  await openAppWithMocks(page);

  await page.getByRole("button", { name: "Kladblok" }).click();
  await page.getByLabel("Nieuw idee").fill("Weggooier");
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  const card = page.getByRole("listitem").filter({ hasText: "Weggooier" });
  await expect(card).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Idee Weggooier verwijderen" }).click();
  await expect(page.getByText("Nog geen ideeën.")).toBeVisible();
});
