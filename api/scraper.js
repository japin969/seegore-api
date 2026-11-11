const cheerio = require('cheerio');
const BASE_URL = 'https://seegore.com';

async function getHtml(url, params = null) {
    let targetUrl = url;
    if (params) {
        const urlObj = new URL(url);
        Object.keys(params).forEach(key => urlObj.searchParams.append(key, params[key]));
        targetUrl = urlObj.toString();
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `${BASE_URL}/gore/`
    };

    try {
        const response = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(15000) });
        if (response.ok) return await response.text();
    } catch (error) {
        console.error(`Failed to fetch URL ${targetUrl}:`, error.message);
    }
    return null;
}

function parseCard($, el) {
    const article = $(el);
    const card = {};
    const mediaLink = article.find('a.mm-card__media');
    const titleLink = article.find('h2.mm-card__title');
    let url = '';
    let title = '';

    if (mediaLink.length) {
        url = mediaLink.attr('href') || '';
        title = mediaLink.attr('aria-label') || '';
    }
    if (titleLink.length) {
        const aTag = titleLink.find('a');
        if (aTag.length) {
            if (!url) url = aTag.attr('href') || '';
            if (!title) title = aTag.attr('title') || aTag.text().trim();
        }
    }

    card.title = title;
    card.url = url;

    try {
        const parsed = new URL(url);
        card.slug = parsed.pathname.split('/').filter(Boolean).pop() || '';
    } catch (e) { card.slug = ''; }

    let img = mediaLink.length ? mediaLink.find('img') : article.find('img');
    card.thumbnail = img.attr('src') || '';

    const badge = article.find('a.mm-card__badge');
    if (badge.length) {
        card.category = badge.text().trim();
        card.category_url = badge.attr('href') || '';
        try {
            const catParsed = new URL(card.category_url);
            card.category_slug = catParsed.pathname.replace('/category/', '').split('/').filter(Boolean).join('/');
        } catch (e) { card.category_slug = ''; }
    } else {
        card.category = ''; card.category_url = ''; card.category_slug = '';
    }

    let views = ''; let upvotes = '';
    const statsSpan = article.find('span.mm-card__stats');
    if (statsSpan.length) {
        const viewsSpan = statsSpan.find('span[title="Views"]');
        if (viewsSpan.length) {
            const strong = viewsSpan.find('strong');
            views = strong.length ? strong.text().trim() : viewsSpan.text().trim();
        }
        const upvotesSpan = statsSpan.find('span[title="Upvotes"]');
        if (upvotesSpan.length) {
            const strong = upvotesSpan.find('strong');
            upvotes = strong.length ? strong.text().trim() : upvotesSpan.text().trim();
        }
    }
    card.views = views; card.upvotes = upvotes;

    const dateEl = article.find('time.mm-card__date');
    if (dateEl.length) {
        card.date = dateEl.text().trim();
        card.datetime = dateEl.attr('datetime') || '';
    } else { card.date = ''; card.datetime = ''; }

    return card;
}

function parseCategories($) {
    const categories = [];
    const ul = $('ul.mm-category-list');
    if (ul.length) {
        ul.find('li').each((_, li) => {
            const a = $(li).find('a');
            if (a.length) {
                const span = a.find('span');
                const strong = a.find('strong');
                const name = span.length ? span.text().trim() : a.text().trim();
                const count = strong.length ? strong.text().trim() : '0';
                const href = a.attr('href') || '';
                let slug = '';
                try {
                    const parsed = new URL(href);
                    slug = parsed.pathname.replace('/category/', '').split('/').filter(Boolean).join('/');
                } catch (e) {}
                categories.push({ name, count, url: href, slug });
            }
        });
    }
    return categories;
}

function parsePagination($) {
    const pagination = { current: 1, next: null, pages: [] };
    let pagDiv = $('.mm-pagination, .nav-links');
    if (!pagDiv.length) {
        pagDiv = $('nav.pagination');
        if (pagDiv.length) {
            const links = pagDiv.find('.nav-links');
            pagDiv = links.length ? links : pagDiv;
        }
    }
    if (pagDiv.length) {
        const currSpan = pagDiv.find('span.current');
        if (currSpan.length) {
            const val = parseInt(currSpan.text().trim(), 10);
            if (!isNaN(val)) pagination.current = val;
        }
        pagDiv.find('a').each((_, aEl) => {
            const a = $(aEl);
            const text = a.text().trim();
            const href = a.attr('href') || '';
            if (text.toLowerCase().includes('next') || text.includes('→')) {
                pagination.next = href;
            } else {
                const pNum = parseInt(text, 10);
                if (!isNaN(pNum)) pagination.pages.push({ page: pNum, url: href });
            }
        });
    }
    return pagination;
}

async function getGorePage(page = 1) {
    const url = page <= 1 ? `${BASE_URL}/gore/` : `${BASE_URL}/gore/page/${page}/`;
    const html = await getHtml(url);
    if (!html) return { trending: [], latest: [], categories: [], pagination: {} };

    const $ = cheerio.load(html);
    const trending = []; const latest = []; let categories = [];

    if (page <= 1) {
        let currentState = 'none';
        $('h2, article.mm-card').each((_, el) => {
            const node = $(el);
            if (node.is('h2')) {
                const text = node.text().trim();
                if (text === 'Trending now') currentState = 'trending';
                else if (text === 'Latest') currentState = 'latest';
                else if (['Search', 'Categories', 'Recent comments', 'Adults only'].includes(text)) currentState = 'other';
            } else if (node.is('article.mm-card')) {
                const card = parseCard($, node);
                if (currentState === 'trending') {
                    if (!trending.some(c => c.url === card.url)) trending.push(card);
                } else if (currentState === 'latest') {
                    if (!latest.some(c => c.url === card.url) && !trending.some(c => c.url === card.url)) latest.push(card);
                }
            }
        });
        categories = parseCategories($);
    } else {
        $('article.mm-card').each((_, el) => {
            const card = parseCard($, el);
            if (!latest.some(c => c.url === card.url)) latest.push(card);
        });
    }
    const pagination = parsePagination($);
    if (!pagination.current || pagination.current === 1) pagination.current = page;
    return { trending, latest, categories, pagination };
}

async function searchVideos(query, page = 1) {
    const url = page <= 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`;
    const html = await getHtml(url, { s: query });
    if (!html) return { results: [], pagination: {} };
    const $ = cheerio.load(html);
    const results = [];
    $('article.mm-card').each((_, article) => {
        const card = parseCard($, article);
        if (!results.some(c => c.url === card.url)) results.push(card);
    });
    const pagination = parsePagination($);
    if (!pagination.current) pagination.current = page;
    return { results, pagination };
}

async function getCategoryVideos(categorySlug, page = 1) {
    const url = page <= 1 ? `${BASE_URL}/category/${categorySlug}/` : `${BASE_URL}/category/${categorySlug}/page/${page}/`;
    const html = await getHtml(url);
    if (!html) return { results: [], pagination: {} };
    const $ = cheerio.load(html);
    const results = [];
    $('article.mm-card').each((_, article) => {
        const card = parseCard($, article);
        if (!results.some(c => c.url === card.url)) results.push(card);
    });
    const pagination = parsePagination($);
    if (!pagination.current) pagination.current = page;
    return { results, pagination };
}

async function getVideoDetail(urlOrSlug) {
    const url = urlOrSlug.startsWith('http') ? urlOrSlug : `${BASE_URL}/${urlOrSlug}/`;
    const html = await getHtml(url);
    if (!html) return null;

    const $ = cheerio.load(html);
    const article = $('article');
    const detail = { url, title: '', category: '', category_url: '', category_slug: '', date: '', datetime: '', views: '', upvotes: '', comments_count: '0', description: '', videos: [], tags: [] };

    if (!article.length) {
        const h1 = $('h1');
        if (h1.length) detail.title = h1.text().trim();
        return detail;
    }

    const header = article.find('header.mm-single__header');
    if (header.length) {
        const h1 = header.find('h1');
        if (h1.length) detail.title = h1.text().trim();
        const badge = header.find('a.mm-card__badge');
        if (badge.length) {
            detail.category = badge.text().trim();
            detail.category_url = badge.attr('href') || '';
            try {
                const catParsed = new URL(detail.category_url);
                detail.category_slug = catParsed.pathname.replace('/category/', '').split('/').filter(Boolean).join('/');
            } catch (e) {}
        }
    }
    if (!detail.title) {
        const h1 = article.find('h1');
        if (h1.length) detail.title = h1.text().trim();
    }

    const metaDiv = article.find('div.mm-single-summary');
    if (metaDiv.length) {
        const timeEl = metaDiv.find('time.mm-single-summary__item');
        if (timeEl.length) {
            const span = timeEl.find('span');
            detail.date = span.length ? span.text().trim() : timeEl.text().trim();
            detail.datetime = timeEl.attr('datetime') || '';
        }
        const commentsLink = metaDiv.find('a[href="#comments"]');
        if (commentsLink.length) {
            const span = commentsLink.find('span');
            detail.comments_count = span.length ? span.text().trim() : commentsLink.text().trim();
        }
        metaDiv.find('span.mm-single-summary__item').each((_, spanEl) => {
            const s = $(spanEl);
            const titleAttr = s.attr('title') || '';
            const strong = s.find('strong');
            const val = strong.length ? strong.text().trim() : s.text().trim();
            if (titleAttr.toLowerCase().includes('views')) detail.views = val;
            else if (titleAttr.toLowerCase().includes('upvotes')) detail.upvotes = val;
        });
    }

    let contentDiv = article.find('div.mm-single__content');
    if (!contentDiv.length) contentDiv = article;

    contentDiv.find('video').each((idx, videoEl) => {
        const vt = $(videoEl);
        let src = '';
        const sourceTag = vt.find('source');
        if (sourceTag.length) src = sourceTag.attr('src') || '';
        if (!src) src = vt.attr('src') || '';
        if (src) src = src.split('?')[0];
        const poster = vt.attr('poster') || '';
        detail.videos.push({ index: idx + 1, src, poster, width: vt.attr('width') || '', height: vt.attr('height') || '' });
    });

    if (detail.videos.length === 0) {
        contentDiv.find('a').each((idx, aEl) => {
            const a = $(aEl);
            const href = a.attr('href') || '';
            if (href.split('?')[0].endsWith('.mp4')) {
                detail.videos.push({ index: idx + 1, src: href.split('?')[0], poster: '', width: '', height: '' });
            }
        });
    }

    const paragraphs = [];
    contentDiv.find('p').each((_, pEl) => {
        const p = $(pEl);
        if (p.find('video').length || !p.text().trim()) return;
        paragraphs.push(p.text().trim());
    });
    detail.description = paragraphs.join('\n\n');

    const tagsNav = article.find('nav.mm-post-tags');
    if (tagsNav.length) {
        tagsNav.find('li').each((_, liEl) => {
            const a = $(liEl).find('a');
            if (a.length) {
                const href = a.attr('href') || '';
                let tagSlug = '';
                try {
                    const parsed = new URL(href);
                    tagSlug = parsed.pathname.replace('/tag/', '').split('/').filter(Boolean).join('/');
                } catch (e) {}
                detail.tags.push({ name: a.text().trim().replace('#', ''), url: href, slug: tagSlug });
            }
        });
    }
    return detail;
}

module.exports = { getGorePage, searchVideos, getCategoryVideos, getVideoDetail, getLatestVideos: async (page) => (await getGorePage(page)).latest, getTrendingVideos: async () => (await getGorePage(1)).trending, getCategories: async () => (await getGorePage(1)).categories };
