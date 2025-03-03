import { appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

class Logger {
  private logFile: string;

  constructor() {
    this.logFile = join(homedir(), '.unity-mcp-server.log');
    this.log('Logger initialized');
  }

  log(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ${message}`;
    if (error) {
      logMessage += `\nError: ${error.message}\nStack: ${error.stack}`;
    }
    logMessage += '\n';

    // Write to file
    try {
      appendFileSync(this.logFile, logMessage);
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }

    // Also log to console
    console.error(logMessage);
  }
}

export const logger = new Logger();
