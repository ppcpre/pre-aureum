export interface NewsSource {
  id: string;
  url: string;
  assetTag: string;
}

// Verified working as of 2026-09-04 (see README for how each was checked).
// Kitco's public RSS feed and Investing.com's commodity RSS feeds are both
// dead (404) as of this date — do not re-add them without re-verifying.
export const NEWS_SOURCES: NewsSource[] = [
  { id: "fxstreet", url: "https://www.fxstreet.com/rss/news", assetTag: "gold" },
];
