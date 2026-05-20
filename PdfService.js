const https = require('https');
const http = require('http');
const Logger = require('./Logger');

class PdfService {
    /**
     * Convert arxiv abstract URL to PDF version
     * https://arxiv.org/abs/2605.18801 -> https://arxiv.org/pdf/2605.18801.pdf
     */
    convertArxivUrl(url) {
        const match = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
        if (match) {
            return `https://arxiv.org/pdf/${match[1]}`;
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
     * Download PDF content from a URL
     */
    downloadPDF(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;

            const request = protocol.get(url, { timeout: 15000 }, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
                    // Handle redirects
                    this.downloadPDF(response.headers.location)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                    return;
                }

                const chunks = [];
                response.on('data', chunk => {
                    chunks.push(chunk);
                });

                response.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
            });

            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    /**
     * Download PDF files for selected articles
     */
    async downloadArticles(articles) {
        Logger.info(`Downloading PDF for ${articles.length} articles`);
        const downloads = [];

        for (const article of articles) {
            try {
                const downloadUrl = this.getLinkForDownload(article.link, article.site);
                Logger.info(`Downloading PDF: ${downloadUrl}`);

                const pdfBuffer = await this.downloadPDF(downloadUrl);

                // Keep filename safe but readable
                const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '').trim();
                downloads.push({
                    title: article.title,
                    filename: `${safeTitle}.pdf`,
                    content: pdfBuffer
                });
            } catch (error) {
                Logger.error(`Failed to download article PDF: ${article.title}`, error);
            }
        }

        Logger.info(`Successfully downloaded ${downloads.length} PDF files`);
        return downloads;
    }
}

module.exports = PdfService;
