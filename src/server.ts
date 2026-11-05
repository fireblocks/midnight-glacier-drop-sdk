import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "./utils/config.js";
import { Express } from "express-serve-static-core";
import { configureRouter } from "./api/router.js";
import { swaggerSpec, swaggerUi } from "./utils/swagger.js";
import path from "path";
import { FbNightApiService } from "./api/apiService.js";
import { ApiServiceConfig } from "./types/index.js";
import { BasePath } from "@fireblocks/ts-sdk";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Logger, LogLevel } from "./utils/logger.js";
import {
  AuthConfig,
  assertAuthConfigured,
  loadAuthConfig,
  requireAuth,
} from "./api/auth.js";

const logLevel = "INFO";
Logger.setLogLevel(
  LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO,
);
const logger = new Logger("app:server-setup");

const fbNightApiServiceConfigs: ApiServiceConfig = {
  apiKey: config.FIREBLOCKS.apiKey || "",
  secretKey: config.FIREBLOCKS.secretKey || "",
  basePath: (config.FIREBLOCKS.basePath as BasePath) || BasePath.US,
  poolConfig: {
    maxPoolSize: parseInt(process.env.POOL_MAX_SIZE || "100"),
    idleTimeoutMs: parseInt(process.env.POOL_IDLE_TIMEOUT_MS || "1800000"),
    cleanupIntervalMs: parseInt(
      process.env.POOL_CLEANUP_INTERVAL_MS || "300000",
    ),
  },
};

/**
 * Builds the Express app. Authentication is mounted before every route, including
 * the API, Swagger and static docs, so a route added later is protected by default.
 * Only /health stays open, for liveness probes.
 */
export const createApp = (authConfig: AuthConfig = loadAuthConfig()) => {
  const app = express();

  configureMiddlewares(app);

  app.use(requireAuth(authConfig, { publicPaths: ["/health"] }));

  const fbNightApiService = new FbNightApiService(fbNightApiServiceConfigs);
  const router = configureRouter(fbNightApiService);
  app.use("/api", router);

  app.get("/health", (_req: Request, res: Response) => {
    logger.info("alive");
    res.status(200).send("Alive");
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs-json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  app.use("/docs", express.static(path.join(__dirname, "../docs")));

  return { app, shutdown: () => fbNightApiService.shutdown() };
};

const startServer = (authConfig: AuthConfig = loadAuthConfig()) => {
  // Fail closed: refuse to start as an open signing proxy when auth is unconfigured.
  assertAuthConfigured(authConfig);

  const { app } = createApp(authConfig);

  app.listen(config.PORT, config.HOST, () => {
    logger.info(
      `Fireblocks-Midnight SDK listening on ${config.HOST}:${config.PORT}`,
    );
  });
};

const configureMiddlewares = (app: Express) => {
  app.use(
    cors({
      origin: [`http://localhost:${config.CLIENT_PORT}`],
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
};

export default startServer;
