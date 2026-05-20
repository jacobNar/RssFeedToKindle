const fs = require('fs');
const path = require('path');

class Logger {
    static logPath = path.join(__dirname, 'app.log');

    static info(message) {
        this._write('INFO', message);
    }

    static error(message, err = null) {
        let fullMessage = message;
        if (err) {
            fullMessage += ` - ${err.message}\n${err.stack}`;
        }
        this._write('ERROR', fullMessage);
    }

    static _write(level, message) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level}] ${message}\n`;
        fs.appendFileSync(this.logPath, logLine);
        console.log(logLine.trim());
    }
}

module.exports = Logger;
