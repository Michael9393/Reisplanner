import { describe, expect, it } from "vitest";
import { buildSearchUrl, parseSearchResponse, wikipediaSearchUrl } from "./photon";

function feature(
  name: string | undefined,
  country: string | undefined,
  lngLat: [number, number],
  extra: Record<string, string> = {},
) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: lngLat },
    properties: { name, country, ...extra },
  };
}

describe("buildSearchUrl / wikipediaSearchUrl", () => {
  it("bouwt de Photon-URL met limiet en taal", () => {
    const url = new URL(buildSearchUrl("kyo to"));
    expect(url.origin).toBe("https://photon.komoot.io");
    expect(url.pathname).toBe("/api/");
    expect(url.searchParams.get("q")).toBe("kyo to");
    expect(url.searchParams.get("limit")).toBe("6");
    expect(url.searchParams.get("lang")).toBe("en");
  });

  it("bouwt een ge-encodeerde Wikipedia-zoeklink", () => {
    expect(wikipediaSearchUrl("Xi'an")).toBe(
      "https://nl.wikipedia.org/wiki/Special:Search?search=Xi'an",
    );
    expect(wikipediaSearchUrl("Chiang Mai")).toBe(
      "https://nl.wikipedia.org/wiki/Special:Search?search=Chiang%20Mai",
    );
  });
});

describe("parseSearchResponse", () => {
  it("draait GeoJSON-coördinaten om naar lat/lng en vult de infoUrl", () => {
    const result = parseSearchResponse({
      features: [feature("Kyoto", "Japan", [135.7681, 35.0116], { state: "Kyoto Prefecture" })],
    });
    expect(result).toEqual([
      {
        name: "Kyoto",
        country: "Japan",
        coords: { lat: 35.0116, lng: 135.7681 },
        description: "Kyoto Prefecture",
        infoUrl: "https://nl.wikipedia.org/wiki/Special:Search?search=Kyoto",
      },
    ]);
  });

  it("ontdubbelt op naam + land en slaat naamloze features over", () => {
    const result = parseSearchResponse({
      features: [
        feature("Kyoto", "Japan", [135.77, 35.01]),
        feature("Kyoto", "Japan", [135.76, 35.02]),
        feature("Kyoto", "Verenigde Staten", [-84.28, 39.35]),
        feature(undefined, "Japan", [135.0, 35.0]),
      ],
    });
    expect(result.map((s) => `${s.name} (${s.country})`)).toEqual([
      "Kyoto (Japan)",
      "Kyoto (Verenigde Staten)",
    ]);
  });

  it("valt terug op osm_value als omschrijving en null als land ontbreekt", () => {
    const result = parseSearchResponse({
      features: [feature("Ergens", undefined, [100, 10], { osm_value: "village" })],
    });
    expect(result[0].country).toBeNull();
    expect(result[0].description).toBe("village");
  });

  it("geeft een lege lijst bij een onbruikbaar antwoord", () => {
    expect(parseSearchResponse({})).toEqual([]);
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse({ features: "geen array" })).toEqual([]);
  });
});
