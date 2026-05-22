const nodemailer = require('nodemailer');
const Imap = require('imap');
const Logger = require('./Logger');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_PORT == '465',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        this.fromEmail = process.env.FROM_EMAIL;
        this.imapConfig = {
            user: process.env.IMAP_USER,
            password: process.env.IMAP_PASS,
            host: process.env.IMAP_HOST,
            port: process.env.IMAP_PORT || 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        };
    }

    /**
     * Archive sent message to the Sent folder via IMAP
     */
    async archiveSentMessage(mailOptions) {
        return new Promise((resolve) => {
            const imap = new Imap(this.imapConfig);

            imap.on('ready', () => {
                imap.openBox('INBOX.Sent', false, (err) => {
                    if (err) {
                        Logger.info(`Failed to open INBOX.Sent: ${err.message}`);
                        imap.end();
                        resolve();
                        return;
                    }
                    doAppend();
                });
            });

            function doAppend() {
                // Construct a proper RFC 822 formatted message
                const now = new Date().toUTCString();
                let messageBody = `From: ${mailOptions.from}\r\n`;
                messageBody += `To: ${mailOptions.to}\r\n`;
                messageBody += `Subject: ${mailOptions.subject}\r\n`;
                messageBody += `Date: ${now}\r\n`;
                messageBody += `Content-Type: text/plain\r\n`;
                messageBody += `\r\n`;
                messageBody += `${mailOptions.text}\r\n`;

                // Add attachment information if present
                if (mailOptions.attachments && mailOptions.attachments.length > 0) {
                    messageBody += `\r\n--- Attachments ---\r\n`;
                    mailOptions.attachments.forEach((attachment, index) => {
                        messageBody += `${index + 1}. ${attachment.filename}\r\n`;
                    });
                }

                imap.append(Buffer.from(messageBody), { Flags: ['\\Seen'] }, (appendErr) => {
                    if (appendErr) {
                        Logger.info(`Failed to append message: ${appendErr.message}`);
                    } else {
                        Logger.info('Message archived to Sent folder');
                    }
                    imap.end();
                    resolve();
                });
            }

            imap.on('error', (err) => {
                Logger.info(`IMAP connection error: ${err.message}`);
                imap.end();
                resolve();
            });

            imap.on('end', () => {
                resolve();
            });

            imap.connect();
        });
    }

    async sendEpub(toEmails, epubBuffer, title) {
        if (process.env.SEND_EMAIL !== 'true') {
            Logger.info('Email sending is disabled');
            return;
        }
        Logger.info(`Sending ${title}.epub to ${toEmails.join(', ')}`);

        const mailOptions = {
            from: `"RSS to Kindle" <${this.fromEmail}>`,
            to: toEmails.join(', '),
            subject: `Send to Kindle: ${title}`,
            text: 'Attached is your requested RSS digest.',
            attachments: [
                {
                    filename: `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.epub`,
                    content: epubBuffer
                }
            ]
        };

        try {
            const mailResult = await this.transporter.sendMail(mailOptions);
            Logger.info(`Successfully sent ${title}.epub`);

            // Archive to Sent folder (non-blocking)
            if (process.env.IMAP_USER) {
                this.archiveSentMessage(mailOptions).catch(err => {
                    Logger.info('Failed to archive sent message');
                });
            }
        } catch (error) {
            Logger.error('Failed to send email', error);
            throw error;
        }
    }

    async sendFiles(toEmails, files, title) {
        if (process.env.SEND_EMAIL !== 'true') {
            Logger.info('Email sending is disabled');
            return;
        }
        Logger.info(`Sending ${files.length} files to ${toEmails.join(', ')}`);

        const attachments = files.map(file => ({
            filename: file.filename,
            content: file.content
        }));

        const mailOptions = {
            from: `"RSS to Kindle" <${this.fromEmail}>`,
            to: toEmails.join(', '),
            subject: `Send to Kindle: ${title}`,
            text: `Attached are ${files.length} articles from your RSS feeds.`,
            attachments: attachments
        };

        try {
            const mailResult = await this.transporter.sendMail(mailOptions);
            Logger.info(`Successfully sent ${files.length} files`);

            // Archive to Sent folder (non-blocking)
            if (process.env.IMAP_USER) {
                this.archiveSentMessage(mailOptions).catch(err => {
                    Logger.info('Failed to archive sent message');
                });
            }
        } catch (error) {
            Logger.error('Failed to send email', error);
            throw error;
        }
    }
}

module.exports = EmailService;

