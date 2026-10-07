import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

// in the site's order: the process (T1, T2), the methods (M1 to M4), then F and C
export const SUBPROJECT_CODES = ['T1', 'T2', 'M1', 'M2', 'M3', 'M4', 'F', 'C'] as const;
const subprojectCode = z.enum(SUBPROJECT_CODES);

// One Markdown file per news item. The body is optional (e.g. a talk abstract).
const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    // 'month' prints "November 2025" instead of a full date.
    precision: z.enum(['day', 'month']).default('day'),
    kind: z.enum(['event', 'talk', 'award', 'publication', 'press', 'milestone']),
    summary: z.string(),
    link: z.object({ href: z.url(), label: z.string() }).optional(),
    subprojects: z.array(subprojectCode).default([]),
  }),
});

// One Markdown file per subproject. Frontmatter carries the facts and the
// work packages, the body a short description of the aim.
const subprojects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/subprojects' }),
  schema: ({ image }) =>
    z.object({
      code: subprojectCode,
      title: z.string(),
      // Role in the Research Unit, one word ("Learn") and one short line.
      verb: z.string(),
      tagline: z.string(),
      // Two to four words, used in lists and navigation.
      short: z.string(),
      order: z.number(),
      field: z.string(),
      host: z.string(),
      // Person ids from src/data/people.yaml, in the order they should appear.
      pis: z.array(z.string()).min(1),
      summary: z.string(),
      illustration: z
        .object({
          name: z.enum(['t1', 't2', 'm1', 'm2', 'm3', 'm4', 'f']),
          label: z.string(),
          caption: z.string(),
        })
        .optional(),
      // Work packages of the first funding phase, with codes, titles, results and cited
      // papers; `papers` are ids from publications.yaml.
      workPackages: z
        .array(
          z.object({
            code: z.string(),
            title: z.string(),
            text: z.string(),
            papers: z.array(z.string()).default([]),
            // An optional figure from the team's own work, with its source.
            figure: z.object({ src: image(), alt: z.string(), caption: z.string(), credit: z.string() }).optional(),
          }),
        )
        .default([]),
      // Activities without work packages (the coordination project C).
      contributions: z
        .array(z.object({ title: z.string(), text: z.string(), papers: z.array(z.string()).default([]) }))
        .default([]),
    }),
});

const people = defineCollection({
  loader: file('src/data/people.yaml'),
  schema: z.object({
    name: z.string(),
    // Academic title printed before the name, e.g. "Prof. Dr.-Ing."
    title: z.string().optional(),
    group: z.enum(['pi', 'researcher', 'alumni']),
    // A coordinating role, e.g. "Spokesperson".
    role: z.string().optional(),
    subprojects: z.array(subprojectCode).min(1),
    affiliation: z.string().optional(),
    // One line on the person's research, taken from their own publications.
    focus: z.string().optional(),
    url: z.url().optional(),
    email: z.email().optional(),
    note: z.string().optional(),
  }),
});

const publications = defineCollection({
  loader: file('src/data/publications.yaml'),
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()).min(1),
    venue: z.string(),
    year: z.number().int(),
    type: z.enum(['journal', 'conference', 'workshop', 'preprint', 'thesis', 'dataset', 'chapter']),
    subprojects: z.array(subprojectCode).min(1),
    doi: z.string().optional(),
    url: z.url().optional(),
    status: z.enum(['published', 'accepted', 'preprint']).default('published'),
    // The first `equal` authors contributed equally; they are marked with an asterisk.
    equal: z.number().int().min(2).optional(),
    award: z.string().optional(),
    // Position among the ten highlights (home page and filter).
    highlight: z.number().int().min(1).optional(),
    // Short venue label for highlight cards, e.g. "ICLR".
    short: z.string().optional(),
  }),
});

export const collections = { news, subprojects, people, publications };
