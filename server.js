require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const Imap = require('imap');
const Logger = require('./Logger');
const RssService = require('./RssService');
const EpubService = require('./EpubService');
const HTMLService = require('./HTMLService');
const PdfService = require('./PdfService');
const EmailService = require('./EmailService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rssService = new RssService();
const epubService = new EpubService();
const htmlService = new HTMLService();
const pdfService = new PdfService();
const emailService = new EmailService();

let config = {};

try {
    const configPath = path.join(__dirname, 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    Logger.info('Loaded config.json successfully');
} catch (error) {
    Logger.error('Failed to load config.json', error);
    process.exit(1);
}

// List available mailboxes on startup
// const listMailboxes = () => {
//     return new Promise((resolve) => {
//         const imap = new Imap({
//             user: process.env.IMAP_USER,
//             password: process.env.IMAP_PASS,
//             host: process.env.IMAP_HOST,
//             port: process.env.IMAP_PORT || 993,
//             tls: true,
//             tlsOptions: { rejectUnauthorized: false }
//         });

//         imap.on('ready', () => {
//             imap.getBoxes((err, boxes) => {
//                 if (err) {
//                     Logger.info('Error listing mailboxes: ' + err.message);
//                 } else {
//                     const getAllBoxes = (boxes, prefix = '') => {
//                         const result = [];
//                         for (const [name, box] of Object.entries(boxes)) {
//                             const fullName = prefix ? prefix + box.delimiter + name : name;
//                             result.push(fullName);
//                             if (box.children) {
//                                 result.push(...getAllBoxes(box.children, fullName));
//                             }
//                         }
//                         return result;
//                     };
//                     const allBoxes = getAllBoxes(boxes);
//                     Logger.info('Available mailboxes: ' + allBoxes.join(', '));
//                 }
//                 imap.end();
//                 resolve();
//             });
//         });

//         imap.on('error', (err) => {
//             Logger.info('IMAP error: ' + err.message);
//             imap.end();
//             resolve();
//         });

//         imap.on('end', () => {
//             resolve();
//         });

//         imap.connect();
//     });
// };

// // List mailboxes on startup
// listMailboxes().then(() => {
//     Logger.info('Mailbox check complete');
// });

const fetchAllFeeds = async () => {
    try {
        await rssService.fetchFeeds(config.rssFeeds || []);
    } catch (error) {
        Logger.error('Scheduled RSS fetch failed', error);
    }
};

fetchAllFeeds();
setInterval(fetchAllFeeds, 60 * 60 * 1000);

app.get('/api/feeds', (req, res) => {
    try {
        const articles = rssService.getArticles();
        res.json({ articles });
    } catch (error) {
        Logger.error('Error serving feeds API', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/send', async (req, res) => {
    try {
        const { articleIds } = req.body;
        if (!articleIds || articleIds.length === 0) {
            return res.status(400).json({ error: 'No articles selected' });
        }

        const allArticles = rssService.getArticles();
        const selectedArticles = allArticles.filter(a => articleIds.includes(a.id));

        if (selectedArticles.length === 0) {
            return res.status(400).json({ error: 'Selected articles not found' });
        }

        const toEmails = process.env.TO_EMAILS ? process.env.TO_EMAILS.split(',').map(e => e.trim()) : [];
        if (toEmails.length === 0) {
            return res.status(400).json({ error: 'No Kindle emails configured in .env' });
        }

        const filesToSend = [];

        const pdfArticles = selectedArticles.filter(a => a.downloadType === 'pdf');
        const htmlArticles = selectedArticles.filter(a => a.downloadType !== 'pdf');

        if (pdfArticles.length > 0) {
            const pdfFiles = await pdfService.downloadArticles(pdfArticles);
            filesToSend.push(...pdfFiles);
        }

        if (htmlArticles.length > 0) {
            const htmlFiles = await htmlService.downloadArticles(htmlArticles);
            for (const file of htmlFiles) {
                const article = htmlArticles.find(a => a.title === file.title);
                if (article) {
                    const epubBuffer = await epubService.generateFromHtml(article, file.content.toString('utf8'));
                    const safeTitle = file.title.replace(/[\\/:*?"<>|]/g, '').trim();
                    filesToSend.push({
                        title: file.title,
                        filename: `${safeTitle}.epub`,
                        content: epubBuffer
                    });
                }
            }
        }

        if (filesToSend.length === 0) {
            return res.status(500).json({ error: 'Failed to download any articles' });
        }

        const saveLocal = false;
        if (saveLocal) {
            const epubDir = path.join(__dirname, 'epub');
            if (!fs.existsSync(epubDir)) {
                fs.mkdirSync(epubDir, { recursive: true });
            }

            for (const file of filesToSend) {
                if (file.filename.endsWith('.epub')) {
                    fs.writeFileSync(path.join(epubDir, file.filename), file.content);
                }
            }
        }

        const sendEmail = process.env.SEND_EMAIL === 'true';
        if (sendEmail) {
            await emailService.sendFiles(toEmails, filesToSend, `Digest ${new Date().toLocaleDateString()}`);
        }

        res.json({ message: 'Successfully processed and saved EPUBs locally!' });
    } catch (error) {
        Logger.error('Error in /api/send', error);
        res.status(500).json({ error: 'Failed to process and send articles' });
    }
});

app.post('/api/send-link', async (req, res) => {
    try {
        let { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'No URL provided' });
        }

        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        const toEmails = process.env.TO_EMAILS ? process.env.TO_EMAILS.split(',').map(e => e.trim()) : [];
        if (toEmails.length === 0) {
            return res.status(400).json({ error: 'No Kindle emails configured in .env' });
        }

        const html = await htmlService.downloadHTML(url);
        let title = 'Web Article';
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].trim()
                .replace(/\s+/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
        }

        const article = {
            title: title,
            link: url,
            author: new URL(url).hostname || 'Web Article',
            feedTitle: 'Direct Link'
        };

        const epubBuffer = await epubService.generateFromHtml(article, html);
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'web_article';
        const filesToSend = [{
            title: title,
            filename: `${safeTitle}.epub`,
            content: epubBuffer
        }];

        const sendEmail = process.env.SEND_EMAIL === 'true';
        if (sendEmail) {
            await emailService.sendFiles(toEmails, filesToSend, `Direct Link: ${title}`);
        }

        res.json({ message: 'Successfully sent link to Kindle!' });
    } catch (error) {
        Logger.error('Error in /api/send-link', error);
        res.status(500).json({ error: 'Failed to process and send link: ' + error.message });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    Logger.info(`Server started on http://0.0.0.0:${PORT}`);
});


