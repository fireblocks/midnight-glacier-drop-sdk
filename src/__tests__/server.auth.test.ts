import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthConfig } from "../api/auth.js";

/**
 * Wiring test: proves server.ts mounts authentication in front of the REAL router,
 * not just that the middleware works in isolation (auth.test.ts).
 */

const TOKEN = "wiring-test-token";
const authConfig: AuthConfig = {
  token: TOKEN,
  allowUnauthenticated: false,
  production: true,
};

let dir: string;
let server: Server;
let baseUrl: string;
let shutdown: () => Promise<void>;
let startServer: (config?: AuthConfig) => unknown;

before(async () => {
  // config.ts reads the Fireblocks secret key from disk at import time, so the
  // environment must be in place before server.js is imported.
  dir = mkdtempSync(join(tmpdir(), "midnight-wiring-"));
  const keyPath = join(dir, "dummy.key");
  writeFileSync(keyPath, "not-a-real-key");
  process.env.FIREBLOCKS_SECRET_KEY_PATH = keyPath;
  process.env.FIREBLOCKS_API_KEY = "dummy-api-key";

  const mod = await import("../server.js");
  startServer = mod.default as typeof startServer;

  const created = mod.createApp(authConfig);
  shutdown = created.shutdown;
  server = await new Promise<Server>((resolve) => {
    const s = created.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  await shutdown?.();
  rmSync(dir, { recursive: true, force: true });
});

const anonymous: Array<[string, string]> = [
  ["POST", "/api/transfer"],
  ["POST", "/api/claims/CARDANO"],
  ["GET", "/api/claims/CARDANO/1"],
  ["POST", "/api/scavenger-hunt/donate/1/addr1attacker"],
  ["POST", "/api/scavenger-hunt/register/1"],
  ["POST", "/api/scavenger-hunt/solve/1"],
  ["POST", "/api/thaws/redeem/1"],
  ["GET", "/api/thaws/phase-config"],
  ["GET", "/api-docs-json"],
  ["GET", "/api-docs/"],
  ["GET", "/docs/"],
  // A route that does not exist yet: auth must be global, not per-route.
  ["GET", "/api/some-future-route"],
  ["POST", "/anything"],
];

describe("server wiring: every route requires authentication", () => {
  for (const [method, path] of anonymous) {
    it(`${method} ${path} without a token is 401`, async () => {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      });
      assert.equal(res.status, 401);
    });
  }

  it("rejects a wrong token with 401", async () => {
    const res = await fetch(`${baseUrl}/api-docs-json`, {
      headers: { Authorization: "Bearer nope" },
    });
    assert.equal(res.status, 401);
  });

  it("serves the Swagger spec to a caller with the correct token", async () => {
    const res = await fetch(`${baseUrl}/api-docs-json`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(res.status, 200);
  });

  it("keeps /health open for liveness probes", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
  });
});

describe("server startup gate", () => {
  it("refuses to start when no token is configured", () => {
    assert.throws(
      () =>
        startServer({
          token: "",
          allowUnauthenticated: false,
          production: true,
        }),
      /not configured/i,
    );
  });

  it("refuses to start with the opt-out set in production", () => {
    assert.throws(
      () =>
        startServer({
          token: "",
          allowUnauthenticated: true,
          production: true,
        }),
      /production/i,
    );
  });
});
