const Parser = require('rss-parser');
const Logger = require('./Logger');

class RssService {
    constructor() {
        this.parser = new Parser();
        this.articles = [];
        this.lastFetch = null;
    }

    async fetchFeeds(feedConfigs) {
        Logger.info(`Fetching ${feedConfigs.length} RSS feeds...`);
        const allArticles = [];

        for (const feedConfig of feedConfigs) {
            const url = typeof feedConfig === 'string' ? feedConfig : feedConfig.url;
            const site = typeof feedConfig === 'string' ? null : feedConfig.site;
            const downloadType = typeof feedConfig === 'string' ? null : feedConfig.downloadType;

            try {
                const feed = await this.parser.parseURL(url);
                Logger.info(`Fetched feed: ${feed.title} from ${url}`);

                feed.items.forEach(item => {
                    allArticles.push({
                        id: Buffer.from(item.link || item.title).toString('base64'),
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate,
                        contentSnippet: item.contentSnippet,
                        content: item.content,
                        feedTitle: feed.title,
                        site: site,
                        downloadType: downloadType
                    });
                });
            } catch (error) {
                Logger.error(`Error fetching feed ${url}`, error);
            }
        }

        allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // Deduplicate cross-listed articles by ID
        const uniqueArticlesMap = new Map();
        for (const article of allArticles) {
            if (!uniqueArticlesMap.has(article.id)) {
                uniqueArticlesMap.set(article.id, article);
            }
        }

        this.articles = Array.from(uniqueArticlesMap.values());
        this.lastFetch = new Date();
        return this.articles;
    }

    getArticles() {
        return this.articles;
    }
}

module.exports = RssService;
