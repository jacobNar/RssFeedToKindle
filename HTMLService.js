const https = require('https');
const http = require('http');
const Logger = require('./Logger');

class HTMLService {
    /**
     * Convert arxiv abstract URL to HTML version
     * https://arxiv.org/abs/2605.18801 -> https://arxiv.org/html/2605.18801v1
     */
    convertArxivUrl(url) {
        const match = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
        if (match) {
            return `https://arxiv.org/html/${match[1]}v1`;
        }
        return url;
    }

    /**
     * Convert article link based on site type
     */
    getLinkForDownload(link, site) {
        if (site === 'arxiv.org') {
            return this.convertArxivUrl(link);
        }
        return link;
    }

    /**
     * Download HTML content from a URL
     */
    downloadHTML(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;

            protocol.get(url, { timeout: 10000 }, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    // Handle redirects
                    this.downloadHTML(response.headers.location)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                    return;
                }

                let data = '';
                response.on('data', chunk => {
                    data += chunk;
                });

                response.on('end', () => {
                    resolve(data);
                });
            }).on('error', reject);
        });
    }

    /**
     * Download HTML files for selected articles
     */
    async downloadArticles(articles) {
        Logger.info(`Downloading HTML for ${articles.length} articles`);
        const downloads = [];

        for (const article of articles) {
            try {
                const downloadUrl = this.getLinkForDownload(article.link, article.site);
                Logger.info(`Downloading: ${downloadUrl}`);

                const html = await this.downloadHTML(downloadUrl);
                downloads.push({
                    title: article.title,
                    filename: `${article.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`,
                    content: Buffer.from(html, 'utf8')
                });
            } catch (error) {
                Logger.error(`Failed to download article: ${article.title}`, error);
            }
        }

        Logger.info(`Successfully downloaded ${downloads.length} HTML files`);
        return downloads;
    }
}

module.exports = HTMLService;
