import { getCollection, type CollectionEntry } from 'astro:content';
import { SUBPROJECT_CODES } from '../content.config';

/** Subproject codes in the site's order, T1 to C. */
export const inOrder = (codes: readonly string[]) =>
  [...codes].sort((a, b) => SUBPROJECT_CODES.indexOf(a as never) - SUBPROJECT_CODES.indexOf(b as never));

export type Publication = CollectionEntry<'publications'>;
export type Person = CollectionEntry<'people'>;
export type Subproject = CollectionEntry<'subprojects'>;
export type NewsItem = CollectionEntry<'news'>;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "17 November 2025", or "November 2025" for month precision. */
export function formatDate(date: Date, precision: 'day' | 'month' = 'day'): string {
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return precision === 'month' ? `${month} ${year}` : `${date.getUTCDate()} ${month} ${year}`;
}

/** ISO date for <time datetime>. */
export function isoDate(date: Date, precision: 'day' | 'month' = 'day'): string {
  const iso = date.toISOString().slice(0, 10);
  return precision === 'month' ? iso.slice(0, 7) : iso;
}

/** T, M, F or C, used to tint subproject chips. */
export function subprojectKind(code: string): string {
  return code.charAt(0);
}

export function publicationHref(p: Publication['data']): string | undefined {
  if (p.doi) return `https://doi.org/${p.doi}`;
  return p.url;
}

const TYPE_ORDER: Record<string, number> = {
  journal: 0, conference: 1, chapter: 2, workshop: 3, thesis: 4, dataset: 5, preprint: 6,
};

/** Newest first; within a year journals before conferences, then by title. */
export function sortPublications(list: Publication[]): Publication[] {
  return [...list].sort(
    (a, b) =>
      b.data.year - a.data.year ||
      TYPE_ORDER[a.data.type] - TYPE_ORDER[b.data.type] ||
      a.data.title.localeCompare(b.data.title),
  );
}

export async function getPublications(): Promise<Publication[]> {
  return sortPublications(await getCollection('publications'));
}

/** The ten highlighted publications, in their fixed order. */
export async function getHighlights(): Promise<Publication[]> {
  const all = await getCollection('publications');
  return all.filter((p) => p.data.highlight).sort((a, b) => (a.data.highlight ?? 0) - (b.data.highlight ?? 0));
}

/** Venue and year for highlight cards, e.g. "ICLR 2025". */
export function venueLabel(p: Publication['data']): string {
  const name = p.short ?? p.venue.match(/\(([^)]+)\)/)?.[1] ?? p.venue.replace(/[:,].*$/, '');
  return `${name} ${p.year}`;
}

export async function getNews(): Promise<NewsItem[]> {
  const items = await getCollection('news');
  return items.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

// The publications a news item lists, in its order; an unknown id fails the build.
export async function newsPapers(n: NewsItem): Promise<Publication[]> {
  const pubs = await getPublications();
  return n.data.papers.map((id) => {
    const p = pubs.find((q) => q.id === id);
    if (!p) throw new Error(`News item ${n.id} lists unknown paper "${id}"`);
    return p;
  });
}

export async function getSubprojects(): Promise<Subproject[]> {
  const items = await getCollection('subprojects');
  return items.sort((a, b) => a.data.order - b.data.order);
}

export async function getPeople(): Promise<Person[]> {
  return getCollection('people');
}

/** Spokesperson first, then other coordinating roles, then everyone else. */
export function roleRank(p: Person): number {
  return p.data.role?.startsWith('Spokes') ? 0 : p.data.role ? 1 : 2;
}

/**
 * By subprojects in the site's order (T1 to C): people in T1 alone first, then those in T1 and a later
 * subproject, then T2, and so on; by name within the same subprojects.
 */
export function bySubprojects(a: Person, b: Person): number {
  const key = (p: Person) => inOrder(p.data.subprojects).map((c) => SUBPROJECT_CODES.indexOf(c as never));
  const ka = key(a), kb = key(b);
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return ka.length - kb.length || byName(a, b);
}

/** Surname, then first name, locale-aware (Döhner sorts with D). */
export function byName(a: Person, b: Person): number {
  const last = (p: Person) => p.data.name.split(' ').slice(-1)[0];
  return last(a).localeCompare(last(b), 'de') || a.data.name.localeCompare(b.data.name, 'de');
}

/**
 * Normalised key for matching author strings to members, so that
 * "Frank Doehner" in a paper matches "Frank Döhner" in the team list.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Set of name keys of everyone in people.yaml, including middle-initial variants. */
export async function getMemberKeys(): Promise<Set<string>> {
  const people = await getPeople();
  const keys = new Set<string>();
  for (const p of people) {
    keys.add(nameKey(p.data.name));
    const parts = p.data.name.split(' ');
    keys.add(nameKey(`${parts[0]} ${parts[parts.length - 1]}`));
  }
  return keys;
}

export function isMember(author: string, keys: Set<string>): boolean {
  const k = nameKey(author);
  if (keys.has(k)) return true;
  const parts = author.split(' ');
  return keys.has(nameKey(`${parts[0]} ${parts[parts.length - 1]}`));
}

export const TYPE_LABEL: Record<string, string> = {
  journal: 'Journal article',
  conference: 'Conference paper',
  chapter: 'Book chapter',
  workshop: 'Workshop paper',
  thesis: 'Doctoral thesis',
  dataset: 'Dataset',
  preprint: 'Preprint',
};

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

/** Spell out numbers up to twenty, e.g. to start a sentence. */
export function numberWord(n: number, capitalise = false): string {
  const w = n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
  return capitalise ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

/** Compact venue and year for inline references, e.g. "NeurIPS, 2025". */
export function venueShort(p: Publication['data']): string {
  const v = p.venue;
  const acronym = v.match(/\(([^)]+)\)/)?.[1];
  let name: string;
  if (/workshop/i.test(v)) name = v.replace(/\s*\(.*$/, '').replace(/,.*$/, '');
  else if (acronym) name = acronym;
  else name = v.replace(/,.*$/, '').replace(/\s+[\d.()–-]+$/, '');
  return name.includes(String(p.year)) ? name : `${name}, ${p.year}`;
}
