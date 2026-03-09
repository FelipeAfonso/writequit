import type { RequestHandler } from './$types';

const SITE_URL = 'https://writequit.dev';

const staticPages = [
	{
		url: '/',
		changefreq: 'weekly',
		priority: '1.0',
		lastmod: '2026-03-09'
	}
];

export const GET: RequestHandler = async () => {
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
	.map(
		(page) => `  <url>
    <loc>${SITE_URL}${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
