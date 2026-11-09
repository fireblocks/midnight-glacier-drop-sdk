import { readFileSync } from "fs";
import {
  BasePath,
  ConfigurationOptions as FireblocksConfig,
} from "@fireblocks/ts-sdk";
import dotenv from "dotenv";
dotenv.config();

const secretKeyPath = process.env.FIREBLOCKS_SECRET_KEY_PATH!;
const secretKey = readFileSync(secretKeyPath, "utf-8");

export const config: {
  PORT: number;
  HOST: string;
  CLIENT_PORT: number;
  FIREBLOCKS: FireblocksConfig;
  BLOCKFROST_PROJECT_ID?: string;
} = {
  PORT: Number(process.env.PORT) || 8000,
  // Loopback by default so the signing API is not reachable from the network unless
  // that is explicitly configured (the Docker image sets HOST=0.0.0.0 and the
  // loopback restriction is applied on the published port instead).
  HOST: process.env.HOST || "127.0.0.1",
  CLIENT_PORT: Number(process.env.CLIENT_PORT) || 3000,
  FIREBLOCKS: {
    apiKey: process.env.FIREBLOCKS_API_KEY || "",
    secretKey: secretKey,
    basePath: (process.env.BASE_PATH as BasePath) || BasePath.US,
  },
  BLOCKFROST_PROJECT_ID: process.env.BLOCKFROST_PROJECT_ID || "",
};
