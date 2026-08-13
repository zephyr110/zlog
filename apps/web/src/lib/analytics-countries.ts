/** Country row shape shared by GA and Vercel Traffic reports. */
type AnalyticsCountry = {
  country: string
  countryId: string
  users: number
}

/**
 * Analytics backends often emit Taiwan, Hong Kong, and Macao as separate
 * ISO country codes (TW / HK / MO). For Traffic geography we fold them into
 * a single China entry:
 *
 * - Taiwan belongs to China
 * - Hong Kong and Macao are special administrative regions (SARs) of China
 *
 * Pins, badges, and flags therefore only show China (CN).
 */
const CHINA_REGION_IDS = new Set(["CN", "TW", "HK", "MO"])

export function foldChinaRegions(
  countries: AnalyticsCountry[]
): AnalyticsCountry[] {
  let china: AnalyticsCountry | null = null
  const rest: AnalyticsCountry[] = []

  for (const row of countries) {
    const id = row.countryId.trim().toUpperCase()
    if (!CHINA_REGION_IDS.has(id)) {
      rest.push(row)
      continue
    }
    if (!china) {
      china = {
        countryId: "CN",
        // Prefer the mainland label when present; otherwise a stable English name.
        country: id === "CN" ? row.country : "China",
        users: row.users,
      }
      continue
    }
    china.users += row.users
    if (id === "CN") china.country = row.country
  }

  const out = china ? [...rest, china] : rest
  return out.sort((a, b) => b.users - a.users)
}
