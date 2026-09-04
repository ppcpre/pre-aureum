import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

/** Fetch and parse an RSS 2.0 feed into a flat list of items. */
export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "AureumBot/0.1 (+https://aureum.precare.workers.dev)" },
  });
  if (!res.ok) {
    throw new Error(`RSS fetch failed for ${url}: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const data = parser.parse(xml);

  const rawItems = data?.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .filter((it): it is Record<string, unknown> => Boolean(it && it.title && it.link))
    .map((it) => ({
      title: String(it.title).trim(),
      link: String(it.link).trim(),
      pubDate: String(it.pubDate ?? ""),
      description: it.description ? String(it.description).trim() : undefined,
    }));
}
