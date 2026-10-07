import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getNews } from '../../lib/data';
import { site } from '../../config';

export async function GET(context: APIContext) {
  const news = await getNews();
  return rss({
    title: `${site.name} news`,
    description: site.description,
    site: context.site ?? 'https://www.for5339.kit.edu',
    items: news.map((n) => ({
      title: n.data.title,
      pubDate: n.data.date,
      description: n.data.summary,
      link: `/news/${n.id}/`,
    })),
    customData: '<language>en-gb</language>',
  });
}
