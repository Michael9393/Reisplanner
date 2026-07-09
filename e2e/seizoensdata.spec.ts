/**
 * Automatische seizoensratings in de bestemmingseditor: klimaatdata ophalen
 * (gemockte Open-Meteo-API), omzetten naar periodes, en de nette foutmelding
 * wanneer de bron onbereikbaar is.
 * (ASCII-testtitels: Chromium weigert stilletjes unicode-paden bij setInputFiles.)
 */
import { expect, type Page, test } from "@playwright/test";

/** Een jaar aan dagdata: mild en droog, genoeg voor elke reisperiode. */
function openMeteoFixture() {
  const time: string[] = [];
  const temperature_2m_max: number[] = [];
  const precipitation_sum: number[] = [];
  const start = new Date("2024-01-01T00:00:00Z");
  for (let i = 0; i < 366; i++) {
    const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    time.push(day.toISOString().slice(0, 10));
    temperature_2m_max.push(24);
    precipitation_sum.push(2);
  }
  return { daily: { time, temperature_2m_max, precipitation_sum } };
}

async function openApp(page: Page) {
  await page.route("https://photon.komoot.io/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Oost-Azië 2027" })).toBeVisible();
}

test("seizoensdata ophalen vult periodes met ratings en Automatisch-notities", async ({ page }) => {
  await page.route("https://archive-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: openMeteoFixture() }),
  );
  await openApp(page);

  await page.getByRole("button", { name: "Bestemmingen" }).click();
  await page.getByRole("button", { name: "+ Bestemming toevoegen" }).click();

  // Zonder coordinaten is de knop uitgeschakeld.
  const fetchButton = page.getByRole("button", { name: "Seizoensdata ophalen" });
  await expect(fetchButton).toBeDisabled();

  await page.getByLabel("Naam").fill("Nikko");
  await page.getByLabel("Land", { exact: true }).fill("Japan");
  await page.getByLabel("Breedtegraad (lat)").fill("36.7198, 139.6982");
  await expect(fetchButton).toBeEnabled();
  await fetchButton.click();

  // Reisvenster mei t/m september 2027 = tien halve maanden.
  await expect(page.getByLabel("Periode", { exact: true })).toHaveCount(10);
  await expect(page.getByLabel("Seizoensnotitie").first()).toHaveValue(
    /Automatisch \(Open-Meteo\)/,
  );

  // Mild en droog: rating 5 in mei; juli t/m september krijgen het
  // tyfoonrisico aangevinkt (zes halve maanden).
  await expect(page.getByLabel("Rating").first()).toHaveValue("5");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "tyfoon", pressed: true }),
  ).toHaveCount(6);

  // Opslaan en controleren dat de ratings op de kaart van de lijst staan.
  await page.getByRole("button", { name: "Opslaan" }).click();
  const card = page.getByRole("button", { name: /Nikko/ });
  await expect(card).toBeVisible();
  await expect(card.getByText(/beg\. mei 5/)).toBeVisible();
});

test("onbereikbare klimaatbron geeft een nette foutmelding", async ({ page }) => {
  await page.route("https://archive-api.open-meteo.com/**", (route) => route.abort());
  await openApp(page);

  await page.getByRole("button", { name: "Bestemmingen" }).click();
  await page.getByRole("button", { name: "+ Bestemming toevoegen" }).click();
  await page.getByLabel("Breedtegraad (lat)").fill("36.7198, 139.6982");
  await page.getByRole("button", { name: "Seizoensdata ophalen" }).click();

  await expect(page.getByText(/Kon geen klimaatdata ophalen/)).toBeVisible();

  // De editor blijft gewoon bruikbaar.
  await page.getByLabel("Naam").fill("Nikko");
  await expect(page.getByRole("button", { name: "Opslaan" })).toBeEnabled();
});

test("bevestiging gevraagd voordat bestaande seizoensdata wordt vervangen", async ({ page }) => {
  await page.route("https://archive-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: openMeteoFixture() }),
  );
  await openApp(page);

  // Kyoto heeft in de seed al seizoensdata.
  await page.getByRole("button", { name: "Bestemmingen" }).click();
  await page.getByRole("button", { name: /Kyoto/ }).click();
  await expect(page.getByRole("heading", { name: "Bestemming bewerken" })).toBeVisible();

  // Annuleren laat het handwerk staan.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Seizoensdata ophalen" }).click();
  await expect(page.getByLabel("Seizoensnotitie").first()).not.toHaveValue(/Automatisch/);

  // Bevestigen vervangt de lijst door de automatische periodes.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Seizoensdata ophalen" }).click();
  await expect(page.getByLabel("Seizoensnotitie").first()).toHaveValue(
    /Automatisch \(Open-Meteo\)/,
  );
});
