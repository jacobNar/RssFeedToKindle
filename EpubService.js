const Epub = require('epub-gen-memory').default;
const Logger = require('./Logger');

class EpubService {
    async generate(articles, title = 'RSS Digest') {
        Logger.info(`Generating EPUB for ${articles.length} articles`);

        const options = {
            title: title,
            author: "RSS Feed To Kindle",
            ignoreFailedDownloads: true
        };

        const content = articles.map(article => ({
            title: article.title,
            author: article.author || article.feedTitle || 'Unknown',
            content: `<h2><a href="${article.link}">${article.title}</a></h2>` + (article.content || article.contentSnippet || '')
        }));

        try {
            const buffer = await Epub(options, content);
            Logger.info('EPUB generated successfully');
            return buffer;
        } catch (error) {
            Logger.error('Failed to generate EPUB', error);
            throw error;
        }
    }

    async generateFromHtml(article, htmlContent) {
        Logger.info(`Generating EPUB for article: ${article.title}`);
        const options = {
            title: article.title,
            author: article.author || article.feedTitle || 'Unknown',
            ignoreFailedDownloads: true
        };
        const content = [{
            title: article.title,
            author: article.author || article.feedTitle || 'Unknown',
            content: htmlContent
        }];
        try {
            const buffer = await Epub(options, content);
            Logger.info('EPUB generated successfully');
            return buffer;
        } catch (error) {
            Logger.error('Failed to generate EPUB from HTML', error);
            throw error;
        }
    }
}

module.exports = EpubService;
