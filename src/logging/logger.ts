/**
 * Logger - HookManager logging system
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { LogLevel, LogEntry, LogFilter, LogStats } from '../types';

export interface LoggerOptions {
  level: LogLevel;
  path: string;
  format: 'json' | 'text';
  maxFileSize?: number;
  maxFiles?: number;
}

export class Logger {
  private options: LoggerOptions;
  private logFile: string;
  private initialized = false;

  constructor(options: LoggerOptions) {
    this.options = {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      ...options,
    };
    this.logFile = this.resolvePath(options.path);
  }

  /**
   * Initialize logger
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.logFile);
      await fs.ensureDir(logDir);

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  /**
   * Log an entry
   */
  async log(entry: LogEntry | string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const logEntry = typeof entry === 'string'
      ? {
          timestamp: new Date().toISOString(),
          level: LogLevel.INFO,
          message: entry,
        }
      : entry;

    // Check log level
    if (!this.shouldLog(logEntry.level)) {
      return;
    }

    const logLine = this.formatLogEntry(logEntry);

    try {
      await fs.appendFile(this.logFile, logLine + '\n');
      await this.rotateIfNeeded();
    } catch (error) {
      // Fallback to console if file logging fails
      console.error('Failed to write log:', error);
    }
  }

  /**
   * Log at debug level
   */
  debug(message: string, data?: any): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      data,
    });
  }

  /**
   * Log at info level
   */
  info(message: string, data?: any): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      data,
    });
  }

  /**
   * Log at warn level
   */
  warn(message: string, data?: any): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      data,
    });
  }

  /**
   * Log at error level
   */
  error(message: string, data?: any): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      data,
    });
  }

  /**
   * Get logs with filtering
   */
  async getLogs(filter: LogFilter & { limit?: number; search?: string }): Promise<LogEntry[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      if (!(await fs.pathExists(this.logFile))) {
        return [];
      }

      const content = await fs.readFile(this.logFile, 'utf-8');
      const lines = content.trim().split('\n');
      const logs: LogEntry[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        let log: LogEntry;
        try {
          if (this.options.format === 'json') {
            log = JSON.parse(line);
          } else {
            // Parse text format
            log = this.parseTextLog(line);
          }
        } catch {
          continue;
        }

        // Apply filters
        if (filter.level && Array.isArray(filter.level) && !filter.level.includes(log.level)) {
          continue;
        }
        if (filter.hookId && log.hookId !== filter.hookId) {
          continue;
        }
        if (filter.hookName && log.hookName !== filter.hookName) {
          continue;
        }
        if (filter.event && !filter.event.includes(log.event)) {
          continue;
        }
        if (filter.startTime && log.timestamp < filter.startTime) {
          continue;
        }
        if (filter.endTime && log.timestamp > filter.endTime) {
          continue;
        }
        if (filter.search && !log.message.includes(filter.search)) {
          continue;
        }

        logs.push(log);
      }

      // Apply limit
      if (filter.limit) {
        return logs.slice(-filter.limit);
      }

      return logs;
    } catch (error) {
      this.error('Failed to get logs', { error: (error as Error).message });
      return [];
    }
  }

  /**
   * Get log statistics
   */
  async getStats(): Promise<LogStats> {
    const logs = await this.getLogs({});

    const byLevel: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.SILENT]: 0,
    };

    const byHook: Record<string, number> = {};
    const byEvent: Record<string, number> = {};

    let startTime = logs[0]?.timestamp || new Date().toISOString();
    let endTime = logs[logs.length - 1]?.timestamp || new Date().toISOString();

    for (const log of logs) {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;

      if (log.hookName) {
        byHook[log.hookName] = (byHook[log.hookName] || 0) + 1;
      }

      if (log.event) {
        byEvent[log.event] = (byEvent[log.event] || 0) + 1;
      }
    }

    return {
      total: logs.length,
      byLevel,
      byHook,
      byEvent,
      timeRange: { start: startTime, end: endTime },
    };
  }

  /**
   * Clear all logs
   */
  async clear(): Promise<void> {
    try {
      if (await fs.pathExists(this.logFile)) {
        await fs.writeFile(this.logFile, '');
      }
    } catch (error) {
      this.error('Failed to clear logs', { error: (error as Error).message });
    }
  }

  /**
   * Destroy logger
   */
  async destroy(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.SILENT];
    const currentLevelIndex = levels.indexOf(this.options.level);
    const logLevelIndex = levels.indexOf(level);

    return logLevelIndex >= currentLevelIndex && currentLevelIndex >= 0;
  }

  /**
   * Format log entry
   */
  private formatLogEntry(entry: LogEntry): string {
    if (this.options.format === 'json') {
      return JSON.stringify(entry);
    }

    // Text format
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const level = entry.level.toUpperCase();
    let message = `[${timestamp}] [${level}] ${entry.message}`;

    if (entry.hookName) {
      message += ` [${entry.hookName}]`;
    }

    if (entry.event) {
      message += ` [${entry.event}]`;
    }

    if (entry.data) {
      message += ` ${JSON.stringify(entry.data)}`;
    }

    return message;
  }

  /**
   * Parse text log format
   */
  private parseTextLog(line: string): LogEntry {
    // Simple text format parsing
    const match = line.match(/\[(.*?)\] \[(.*?)\] (.*)/);
    if (match) {
      const [, timestamp, levelStr, message] = match;
      const level = levelStr.toLowerCase() as LogLevel;

      return {
        timestamp: new Date(timestamp).toISOString(),
        level,
        message,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message: line,
    };
  }

  /**
   * Rotate log file if needed
   */
  private async rotateIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFile);
      if (stats.size > this.options.maxFileSize!) {
        const logDir = path.dirname(this.logFile);
        const baseName = path.basename(this.logFile);
        const ext = path.extname(baseName);
        const nameWithoutExt = baseName.slice(0, -ext.length);

        // Rename current log file
        const timestamp = Date.now();
        const newFileName = `${nameWithoutExt}-${timestamp}${ext}`;
        const newFilePath = path.join(logDir, newFileName);

        await fs.move(this.logFile, newFilePath);

        // Clean up old log files
        const files = await fs.readdir(logDir);
        const logFiles = files.filter((f) => f.startsWith(nameWithoutExt) && f !== baseName);
        logFiles.sort((a, b) => {
          const aStat = fs.statSync(path.join(logDir, a));
          const bStat = fs.statSync(path.join(logDir, b));
          return bStat.mtime.getTime() - aStat.mtime.getTime();
        });

        // Keep only maxFiles
        if (logFiles.length > this.options.maxFiles!) {
          for (let i = this.options.maxFiles!; i < logFiles.length; i++) {
            await fs.remove(path.join(logDir, logFiles[i]));
          }
        }
      }
    } catch (error) {
      // Ignore rotation errors
    }
  }

  /**
   * Resolve path (expand ~ to home directory)
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }
}
