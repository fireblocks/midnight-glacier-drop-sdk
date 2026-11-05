import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import {
  requireAuth,
  assertAuthConfigured,
  loadAuthConfig,
  type AuthConfig,
} from "../api/auth.js";

const base: AuthConfig = {
  token: "",
  allowUnauthenticated: false,
  production: true,
};

const servers: Server[] = [];

/** Mounts requireAuth the way server.ts does: in front of every route, docs included. */
const start = async (config: AuthConfig): Promise<string> => {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.send("Alive");
  });
  app.use(requireAuth(config, { publicPaths: ["/health"] }));
  app.get("/api/claims/:chain/:vaultAccountId", (_req, res) => {
    res.json({ ok: true });
  });
  app.post("/api/transfer", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api-docs-json", (_req, res) => {
    res.json({ spec: true });
  });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

after(() => {
  servers.forEach((s) => s.close());
});

describe("REST authentication (requireAuth)", () => {
  it("fails closed with 503 when no token is configured", async () => {
    const url = await start({ ...base });
    const res = await fetch(`${url}/api/claims/CARDANO/1`);
    assert.equal(res.status, 503);
  });

  it("allows requests when unauthenticated mode is explicitly enabled outside production", async () => {
    const url = await start({
      ...base,
      allowUnauthenticated: true,
      production: false,
    });
    const res = await fetch(`${url}/api/claims/CARDANO/1`);
    assert.equal(res.status, 200);
  });

  it("rejects a request with no bearer token (401)", async () => {
    const url = await start({ ...base, token: "s3cret" });
    const res = await fetch(`${url}/api/claims/CARDANO/1`);
    assert.equal(res.status, 401);
  });

  it("rejects a wrong token (401)", async () => {
    const url = await start({ ...base, token: "s3cret" });
    const res = await fetch(`${url}/api/claims/CARDANO/1`, {
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(res.status, 401);
  });

  it("rejects a non-Bearer scheme (401)", async () => {
    const url = await start({ ...base, token: "s3cret" });
    const res = await fetch(`${url}/api/claims/CARDANO/1`, {
      headers: { Authorization: "Basic s3cret" },
    });
    assert.equal(res.status, 401);
  });

  it("accepts the correct token", async () => {
    const url = await start({ ...base, token: "s3cret" });
    const res = await fetch(`${url}/api/claims/CARDANO/1`, {
      headers: { Authorization: "Bearer s3cret" },
    });
    assert.equal(res.status, 200);
  });

  it("protects the fund-moving POST /api/transfer", async () => {
    const url = await start({ ...base, token: "s3cret" });
    const body = JSON.stringify({
      vaultAccountId: "1",
      recipientAddress: "addr1attacker",
      requiredTokenAmount: "1",
    });
    const anon = await fetch(`${url}/api/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    assert.equal(anon.status, 401);

    const authed = await fetch(`${url}/api/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer s3cret",
      },
      body,
    });
    assert.equal(authed.status, 200);
  });

  it("protects the Swagger spec as well", async () => {
    const url = await start({ ...base, token: "s3cret" });
    const res = await fetch(`${url}/api-docs-json`);
    assert.equal(res.status, 401);
  });

  it("leaves only the explicitly public paths open", async () => {
    const url = await start({ ...base, token: "s3cret" });
    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);
  });
});

describe("startup auth gate (assertAuthConfigured)", () => {
  it("throws when no token is configured", () => {
    assert.throws(() => assertAuthConfigured({ ...base }));
  });

  it("does not throw when a token is configured", () => {
    assert.doesNotThrow(() =>
      assertAuthConfigured({ ...base, token: "s3cret" }),
    );
  });

  it("does not throw when unauthenticated mode is explicitly enabled outside production", () => {
    assert.doesNotThrow(() =>
      assertAuthConfigured({
        ...base,
        allowUnauthenticated: true,
        production: false,
      }),
    );
  });
});

describe("ALLOW_UNAUTHENTICATED is refused in production", () => {
  const prod = { token: "", allowUnauthenticated: true, production: true };
  const dev = { token: "", allowUnauthenticated: true, production: false };

  it("refuses to start in production even with the opt-out set", () => {
    assert.throws(() => assertAuthConfigured(prod), /production/i);
  });

  it("still starts outside production, where the opt-out is meant to be usable", () => {
    assert.doesNotThrow(() => assertAuthConfigured(dev));
  });

  it("rejects requests in production rather than waving them through", async () => {
    const url = await start(prod);
    const res = await fetch(`${url}/api/claims/CARDANO/1`);
    assert.equal(res.status, 503);
  });
});

describe("loadAuthConfig", () => {
  const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv;

  it("treats an unset NODE_ENV as production", () => {
    assert.equal(loadAuthConfig(env({})).production, true);
  });

  it("treats NODE_ENV=production as production", () => {
    assert.equal(
      loadAuthConfig(env({ NODE_ENV: "production" })).production,
      true,
    );
  });

  it("treats an unrecognised NODE_ENV as production (fail safe)", () => {
    assert.equal(loadAuthConfig(env({ NODE_ENV: "staging" })).production, true);
  });

  it("treats NODE_ENV=development and test as non-production", () => {
    assert.equal(
      loadAuthConfig(env({ NODE_ENV: "development" })).production,
      false,
    );
    assert.equal(loadAuthConfig(env({ NODE_ENV: "test" })).production, false);
  });

  it("reads the token from API_AUTH_TOKEN", () => {
    assert.equal(loadAuthConfig(env({ API_AUTH_TOKEN: "abc" })).token, "abc");
    assert.equal(loadAuthConfig(env({})).token, "");
  });

  it("enables the opt-out only for the exact string 'true'", () => {
    assert.equal(
      loadAuthConfig(env({ ALLOW_UNAUTHENTICATED: "true" }))
        .allowUnauthenticated,
      true,
    );
    assert.equal(
      loadAuthConfig(env({ ALLOW_UNAUTHENTICATED: "1" })).allowUnauthenticated,
      false,
    );
  });
});
