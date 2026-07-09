import { describe, expect, it } from "vitest";
import { buildArchiveUrl, parseArchiveResponse, roundCoord } from "./openMeteo";

describe("roundCoord / buildArchiveUrl", () => {
  it("rondt coördinaten af op twee decimalen", () => {
    expect(roundCoord(35.0116)).toBe(35.01);
    expect(roundCoord(-0.005)).toBe(-0);
    expect(roundCoord(139.6982)).toBe(139.7);
  });

  it("bouwt de archive-URL met dagvelden en UTC", () => {
    const url = new URL(buildArchiveUrl({ lat: 35.0116, lng: 135.7681 }));
    expect(url.origin).toBe("https://archive-api.open-meteo.com");
    expect(url.pathname).toBe("/v1/archive");
    expect(url.searchParams.get("latitude")).toBe("35.01");
    expect(url.searchParams.get("longitude")).toBe("135.77");
    expect(url.searchParams.get("start_date")).toBe("2015-01-01");
    expect(url.searchParams.get("end_date")).toBe("2024-12-31");
    expect(url.searchParams.get("daily")).toBe("temperature_2m_max,precipitation_sum");
    expect(url.searchParams.get("timezone")).toBe("UTC");
  });
});

describe("parseArchiveResponse", () => {
  const valid = {
    latitude: 35.0,
    daily: {
      time: ["2024-05-01", "2024-05-02"],
      temperature_2m_max: [21.5, null],
      precipitation_sum: [0, 4.2],
    },
  };

  it("parseert een geldig antwoord (extra velden toegestaan)", () => {
    expect(parseArchiveResponse(valid)).toEqual({
      time: ["2024-05-01", "2024-05-02"],
      temperature_2m_max: [21.5, null],
      precipitation_sum: [0, 4.2],
    });
  });

  it("weigert ontbrekende of ongelijk lange dagreeksen", () => {
    expect(parseArchiveResponse({})).toBeNull();
    expect(parseArchiveResponse({ daily: { time: ["2024-05-01"] } })).toBeNull();
    expect(
      parseArchiveResponse({
        daily: { ...valid.daily, precipitation_sum: [0] },
      }),
    ).toBeNull();
    expect(parseArchiveResponse("geen object")).toBeNull();
  });
});
