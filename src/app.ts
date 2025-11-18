import startServer from "./server.js";

import { Logger, LogLevel } from "./utils/logger.js";

const logLevel = process.env.LOG_LEVEL || "INFO";
Logger.setLogLevel(
  LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO
);
const logger = new Logger("app:server-initializer");
(() => {
  try {
    logger.info("server starting...");
    startServer();
  } catch (e) {
    logger.error("Error starting server:", e);
  }
})();
