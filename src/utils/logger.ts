import fs from "fs";
import path from "path";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export class Logger {
  private static level: LogLevel = LogLevel.INFO;
  private static logPrefix = "[FB_MIDNIGHT]";
  private static logsDir = "logs";
  private static dataDir = "data";
  private static fileLoggingEnabled = true;
  private context: string;

  /**
   * Create a new logger instance
   * @param context The context for this logger (e.g. class name)
   */
  constructor(context: string) {
    this.context = context;
    Logger.ensureDirectories();
  }

  /**
   * Ensure log and data directories exist
   */
  private static ensureDirectories(): void {
    if (!fs.existsSync(Logger.logsDir)) {
      fs.mkdirSync(Logger.logsDir, { recursive: true });
    }
    if (!fs.existsSync(Logger.dataDir)) {
      fs.mkdirSync(Logger.dataDir, { recursive: true });
    }
  }

  /**
   * Set the global log level
   * @param level Log level
   */
  static setLogLevel(level: LogLevel): void {
    Logger.level = level;
  }

  /**
   * Get current log level
   * @returns Current log level
   */
  static getLogLevel(): LogLevel {
    return Logger.level;
  }

  /**
   * Set prefix for all log messages
   * @param prefix Log prefix
   */
  static setLogPrefix(prefix: string): void {
    Logger.logPrefix = prefix;
  }

  /**
   * Enable or disable file logging
   * @param enabled Whether to enable file logging
   */
  static setFileLogging(enabled: boolean): void {
    Logger.fileLoggingEnabled = enabled;
  }

  /**
   * Write to log file
   * @param level Log level
   * @param message Log message
   * @param args Additional arguments
   */
  private writeToFile(level: string, message: string, ...args: any[]): void {
    if (!Logger.fileLoggingEnabled) return;

    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${Logger.logPrefix} [${level}] [${this.context}] ${message}`;

    // Format additional arguments
    const argsStr =
      args.length > 0
        ? " " +
          args
            .map((arg) =>
              typeof arg === "object" ? JSON.stringify(arg) : String(arg)
            )
            .join(" ")
        : "";

    const fullMessage = logMessage + argsStr + "\n";

    // Write to daily log file
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const logFile = path.join(Logger.logsDir, `${date}.log`);
    fs.appendFileSync(logFile, fullMessage);

    // Also write errors to separate error log
    if (level === "ERROR") {
      const errorFile = path.join(Logger.logsDir, `${date}-errors.log`);
      fs.appendFileSync(errorFile, fullMessage);
    }
  }

  /**
   * Log a debug message
   * @param message Log message
   * @param ...args Additional arguments
   */
  debug(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.DEBUG) {
      console.log(
        `${Logger.logPrefix} [DEBUG] [${this.context}] ${message}`,
        ...args
      );
      this.writeToFile("DEBUG", message, ...args);
    }
  }

  /**
   * Log an info message
   * @param message Log message
   * @param ...args Additional arguments
   */
  info(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.INFO) {
      console.log(
        `${Logger.logPrefix} [INFO] [${this.context}] ${message}`,
        ...args
      );
      this.writeToFile("INFO", message, ...args);
    }
  }

  /**
   * Log a warning message
   * @param message Log message
   * @param ...args Additional arguments
   */
  warn(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.WARN) {
      console.warn(
        `${Logger.logPrefix} [WARN] [${this.context}] ${message}`,
        ...args
      );
      this.writeToFile("WARN", message, ...args);
    }
  }

  /**
   * Log an error message
   * @param message Log message
   * @param ...args Additional arguments
   */
  error(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.ERROR) {
      console.error(
        `${Logger.logPrefix} [ERROR] [${this.context}] ${message}`,
        ...args
      );
      this.writeToFile("ERROR", message, ...args);
    }
  }

  /**
   * Save important data to a persistent file
   * @param filename Filename (without extension, will be .json)
   * @param data Data to save
   */
  saveData(filename: string, data: any): void {
    const filepath = path.join(Logger.dataDir, `${filename}.json`);
    const timestamp = new Date().toISOString();

    const dataWithMetadata = {
      timestamp,
      context: this.context,
      data,
    };

    fs.writeFileSync(filepath, JSON.stringify(dataWithMetadata, null, 2));
    this.info(`Data saved to ${filepath}`);
  }

  /**
   * Append data to a file (for tracking over time)
   * @param filename Filename (without extension)
   * @param data Data to append
   */
  appendData(filename: string, data: any): void {
    const filepath = path.join(Logger.dataDir, `${filename}.jsonl`);
    const timestamp = new Date().toISOString();

    const entry = {
      timestamp,
      context: this.context,
      data,
    };

    fs.appendFileSync(filepath, JSON.stringify(entry) + "\n");
  }

  /**
   * Load data from file
   * @param filename Filename (without extension)
   * @returns Parsed data or null if file doesn't exist
   */
  loadData(filename: string): any {
    const filepath = path.join(Logger.dataDir, `${filename}.json`);

    if (!fs.existsSync(filepath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filepath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      this.error(`Failed to load data from ${filepath}:`, error);
      return null;
    }
  }

  /**
   * Create a child logger with a subcontext
   * @param subContext Subcontext name
   * @returns Child logger instance
   */
  createChild(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`);
  }
}

// Set log level from environment variable if available
if (typeof process !== "undefined" && process.env.LOG_LEVEL) {
  const envLevel = process.env.LOG_LEVEL.toUpperCase();
  switch (envLevel) {
    case "DEBUG":
      Logger.setLogLevel(LogLevel.DEBUG);
      break;
    case "INFO":
      Logger.setLogLevel(LogLevel.INFO);
      break;
    case "WARN":
      Logger.setLogLevel(LogLevel.WARN);
      break;
    case "ERROR":
      Logger.setLogLevel(LogLevel.ERROR);
      break;
    case "NONE":
      Logger.setLogLevel(LogLevel.NONE);
      break;
  }
}
