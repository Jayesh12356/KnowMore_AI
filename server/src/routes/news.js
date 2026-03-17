const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─── In-memory cache for news (avoid hammering free APIs) ───
let newsCache = { data: null, fetchedAt: 0 };
const NEWS_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Simple XML tag extractor — avoids needing an XML parser dep.
 * Returns the text content of the first match of <tag>...</tag>
 */
function xmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

/**
 * Extract multiple entries/items from an RSS/Atom feed.
 * Works with both <entry> (Atom) and <item> (RSS).
 */
function feedEntries(xml) {
  const entries = xml.match(/<(entry|item)[\s>][\s\S]*?<\/\1>/gi) || [];
  return entries;
}

/**
 * Parse a generic RSS/Atom entry into our article format.
 */
function parseEntry(entryXml, source) {
  const title = xmlTag(entryXml, 'title').replace(/\n/g, ' ').replace(/<[^>]+>/g, '').trim();
  let description = xmlTag(entryXml, 'description') || xmlTag(entryXml, 'summary') || '';
  description = description.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  if (description.length > 250) description = description.slice(0, 250) + '…';

  // URL — try <link href="..."> then <link>...</link> then <guid>
  let url = '';
  const linkHref = entryXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (linkHref) url = linkHref[1];
  if (!url) url = xmlTag(entryXml, 'link') || xmlTag(entryXml, 'id') || xmlTag(entryXml, 'guid') || '';
  url = url.trim();

  const published = xmlTag(entryXml, 'published') || xmlTag(entryXml, 'pubDate') || xmlTag(entryXml, 'updated') || '';

  // Cover image — try media:content, media:thumbnail, enclosure
  let cover_image = null;
  const mediaMatch = entryXml.match(/<media:(content|thumbnail)[^>]+url=["']([^"']+)["']/i);
  if (mediaMatch) cover_image = mediaMatch[2];
  if (!cover_image) {
    const encMatch = entryXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (encMatch) cover_image = encMatch[1];
  }

  return { title, description, url, source, published_at: published, cover_image, tags: [] };
}

/**
 * Fetch and parse an RSS/Atom feed URL.
 */
async function fetchRSSFeed(feedUrl, source, maxItems = 10) {
  const articles = [];
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'StudyQuizAI/1.0 (RSS Reader)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return articles;
    const xml = await res.text();
    const entries = feedEntries(xml).slice(0, maxItems);
    for (const entry of entries) {
      const article = parseEntry(entry, source);
      if (article.title && article.url) articles.push(article);
    }
  } catch (e) {
    console.error(`[NEWS] ${source} fetch failed:`, e.message);
  }
  return articles;
}

/**
 * Fetch AI/ML news from multiple free public sources.
 * No API keys required for any of these.
 */
async function fetchNews() {
  const now = Date.now();
  if (newsCache.data && now - newsCache.fetchedAt < NEWS_TTL_MS) {
    return newsCache.data;
  }

  // Fire all feeds in parallel for speed
  const [
    devtoML, devtoAI, hnArticles,
    arxivArticles, redditArtificial, redditML,
    hfBlog, mitTechReview, techCrunchAI,
    openAIBlog, googleAIBlog, ventureAI,
  ] = await Promise.all([
    // ── EXISTING SOURCES ──

    // 1. Dev.to — Machine Learning tag
    fetchDevTo('machinelearning'),

    // 2. Dev.to — AI tag
    fetchDevTo('ai'),

    // 3. Hacker News — AI-filtered top stories
    fetchHackerNews(),

    // 4. arXiv — recent AI/ML papers
    fetchRSSFeed(
      'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=lastUpdatedDate&sortOrder=descending&max_results=10',
      'arXiv', 10
    ),

    // ── NEW SOURCES ──

    // 5. Reddit r/artificial (RSS feed, no auth needed)
    fetchRSSFeed('https://www.reddit.com/r/artificial/.rss?limit=10', 'Reddit', 10),

    // 6. Reddit r/MachineLearning (RSS feed)
    fetchRSSFeed('https://www.reddit.com/r/MachineLearning/.rss?limit=10', 'Reddit', 10),

    // 7. Hugging Face Blog (Atom feed)
    fetchRSSFeed('https://huggingface.co/blog/feed.xml', 'Hugging Face', 8),

    // 8. MIT Technology Review — AI section
    fetchRSSFeed('https://www.technologyreview.com/topic/artificial-intelligence/feed', 'MIT Tech Review', 8),

    // 9. TechCrunch — AI section
    fetchRSSFeed('https://techcrunch.com/category/artificial-intelligence/feed/', 'TechCrunch', 8),

    // 10. OpenAI Blog
    fetchRSSFeed('https://openai.com/blog/rss.xml', 'OpenAI', 5),

    // 11. Google AI Blog
    fetchRSSFeed('https://blog.google/technology/ai/rss/', 'Google AI', 5),

    // 12. VentureBeat AI
    fetchRSSFeed('https://venturebeat.com/category/ai/feed/', 'VentureBeat', 8),
  ]);

  // Merge and deduplicate by URL
  const allArticles = [
    ...devtoML, ...devtoAI, ...hnArticles, ...arxivArticles,
    ...redditArtificial, ...redditML,
    ...hfBlog, ...mitTechReview, ...techCrunchAI,
    ...openAIBlog, ...googleAIBlog, ...ventureAI,
  ];

  const seen = new Set();
  const deduplicated = [];
  for (const a of allArticles) {
    const key = a.url.replace(/\/$/, '').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(a);
    }
  }

  // Sort by date descending
  deduplicated.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));

  newsCache = { data: deduplicated, fetchedAt: now };
  return deduplicated;
}

// ─── Dev.to fetcher (JSON API, no auth) ───
async function fetchDevTo(tag) {
  const articles = [];
  try {
    const res = await fetch(`https://dev.to/api/articles?tag=${tag}&per_page=10&top=7`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return articles;
    const data = await res.json();
    for (const a of data) {
      articles.push({
        title: a.title,
        description: a.description || '',
        url: a.url,
        source: 'Dev.to',
        published_at: a.published_at,
        cover_image: a.cover_image || null,
        tags: a.tag_list || [],
      });
    }
  } catch (e) {
    console.error(`[NEWS] Dev.to (${tag}) fetch failed:`, e.message);
  }
  return articles;
}

// ─── Hacker News fetcher (Firebase API, no auth) ───
async function fetchHackerNews() {
  const articles = [];
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return articles;
    const ids = (await res.json()).slice(0, 40); // check top 40
    const storyPromises = ids.map(id =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
        signal: AbortSignal.timeout(5000),
      }).then(r => r.json()).catch(() => null)
    );
    const stories = await Promise.all(storyPromises);
    const aiKeywords = [
      'ai', 'ml', 'gpt', 'llm', 'neural', 'deep learning', 'machine learning',
      'transformer', 'openai', 'anthropic', 'google ai', 'artificial intelligence',
      'chatgpt', 'diffusion', 'gemini', 'claude', 'langchain', 'rag', 'embedding',
      'mistral', 'llama', 'copilot', 'stable diffusion', 'midjourney', 'reasoning',
      'agentic', 'fine-tuning', 'foundation model', 'multimodal',
    ];

    for (const s of stories) {
      if (!s || !s.title || !s.url) continue;
      const titleLower = s.title.toLowerCase();
      if (aiKeywords.some(kw => titleLower.includes(kw))) {
        articles.push({
          title: s.title,
          description: '',
          url: s.url,
          source: 'Hacker News',
          published_at: new Date(s.time * 1000).toISOString(),
          cover_image: null,
          tags: ['hackernews'],
          score: s.score,
        });
      }
    }
  } catch (e) {
    console.error('[NEWS] HN fetch failed:', e.message);
  }
  return articles;
}

// ─── ROUTES ───

// GET /api/v1/news
router.get('/', async (_req, res, next) => {
  try {
    const articles = await fetchNews();

    // Build source counts
    const sourceCounts = {};
    for (const a of articles) {
      sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
    }

    res.json({
      articles,
      total: articles.length,
      cached: Date.now() - newsCache.fetchedAt < 1000,
      sources: Object.keys(sourceCounts).sort(),
      source_counts: sourceCounts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/news/papers — arXiv only
router.get('/papers', async (req, res, next) => {
  try {
    const articles = await fetchNews();
    const papers = articles.filter(a => a.source === 'arXiv');
    res.json({ papers, total: papers.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
