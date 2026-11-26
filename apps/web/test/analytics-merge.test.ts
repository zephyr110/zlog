import { describe, expect, it } from "vitest"
import {
  dbAggToParts,
  mergeParts,
  type AnalyticsMergedParts,
  type AnalyticsReport,
} from "@/lib/analytics-shared"

const EMPTY_PARTS: AnalyticsMergedParts = {
  topPages: [],
  sources: [],
  devices: [],
  browsers: [],
  operatingSystems: [],
  countries: [],
}

function liveReport(countries: AnalyticsReport["countries"]): AnalyticsReport {
  return {
    configured: true,
    source: "vercel",
    range: "all",
    customRange: { start: "2026-08-01", end: "2026-11-26" },
    availableFrom: "2026-08",
    missingMonths: [],
    totals: { activeUsers: 0, screenPageViews: 0 },
    topPages: [],
    sources: [],
    devices: [],
    browsers: [],
    operatingSystems: [],
    countries,
  }
}

describe("mergeParts — countries are a full list, not a top-N panel", () => {
  it("keeps every archived country beyond the panel depth", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      country: `C${i}`,
      countryId: `C${i}`,
      users: 12 - i,
    }))
    const merged = mergeParts({ ...EMPTY_PARTS, countries: many }, null)
    expect(merged.countries).toHaveLength(12)
    expect(merged.countries.map((c) => c.countryId)).toEqual(
      many.map((c) => c.countryId)
    )
  })

  it("unions DB and live rows, sums shared countryIds, keeps 1-user tails", () => {
    const merged = mergeParts(
      {
        ...EMPTY_PARTS,
        countries: [
          { country: "CN", countryId: "CN", users: 11 },
          ...Array.from({ length: 9 }, (_, i) => ({
            country: `D${i}`,
            countryId: `D${i}`,
            users: 2,
          })),
        ],
      },
      liveReport([
        { country: "CN", countryId: "CN", users: 5 },
        { country: "AT", countryId: "AT", users: 1 },
        { country: "BA", countryId: "BA", users: 1 },
        { country: "GB", countryId: "GB", users: 1 },
      ])
    )
    expect(merged.countries).toHaveLength(13)
    expect(merged.countries[0]).toEqual({
      country: "CN",
      countryId: "CN",
      users: 16,
    })
    expect(merged.countries.map((c) => c.countryId)).toEqual(
      expect.arrayContaining(["AT", "BA", "GB"])
    )
  })

  it("leaves the top-10 cap on the other dimensions", () => {
    const sources = Array.from({ length: 12 }, (_, i) => ({
      source: `s${i}`,
      users: 12 - i,
    }))
    const merged = mergeParts({ ...EMPTY_PARTS, sources }, null)
    expect(merged.sources).toHaveLength(10)
  })

  it("keeps more than 100 countries (merge is uncapped)", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      country: `C${i}`,
      countryId: `C${i}`,
      users: 150 - i,
    }))
    const merged = mergeParts({ ...EMPTY_PARTS, countries: many }, null)
    expect(merged.countries).toHaveLength(150)
  })

  it("sums archived composite keys with live rows by countryId", () => {
    const db = dbAggToParts(
      new Map([
        [
          "countries",
          [
            { itemKey: "US|United States", users: 10, views: 0 },
            { itemKey: "CN|China", users: 7, views: 0 },
          ],
        ],
      ])
    )
    const merged = mergeParts(
      db,
      liveReport([
        { country: "US", countryId: "US", users: 5 },
        { country: "CN", countryId: "CN", users: 3 },
        { country: "AT", countryId: "AT", users: 1 },
      ])
    )
    expect(merged.countries).toEqual([
      { country: "United States", countryId: "US", users: 15 },
      { country: "China", countryId: "CN", users: 10 },
      { country: "AT", countryId: "AT", users: 1 },
    ])
  })
})
