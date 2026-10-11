import { afterEach, describe, expect, it, vi } from "vitest";
import { FireboardOAuthProvider } from "../src/oauth/provider";
import {
  DurableOAuthState,
  OAuthStateUnavailableError,
} from "../src/oauth/state";
import { accessOAuthState, oauthStateOutbound } from "./oauth-state.js";

function durableStorage() {
  const entries = new Map();
  const storage = {
    get: vi.fn(async (key) => entries.get(key)),
    put: vi.fn(async (key, value) => entries.set(key, value)),
    delete: vi.fn(async (key) => entries.delete(key)),
    transaction: vi.fn(async (callback) => callback(storage)),
  };
  return { entries, storage };
}

afterEach(() => vi.unstubAllGlobals());

describe("persistent OAuth state", () => {
  it("retains registered clients and independent tokens across provider restarts, including revocation", async () => {
    const { entries, storage } = durableStorage();
    const idFromString = vi.fn((id) => id);
    const get = vi.fn(() => ({
      oauthState: (operation) => accessOAuthState(storage, operation),
    }));
    const env = { FIREBOARD: { idFromString, get } };
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init) =>
        oauthStateOutbound(new Request(url, init), env, {
          containerId: "runtime-container-id",
        }),
      ),
    );
    const createProvider = () =>
      new FireboardOAuthProvider(
        new DurableOAuthState("http://oauth-state.internal/"),
      );
    const first = createProvider();
    const client = {
      client_id: "client-a",
      redirect_uris: ["https://client.example/callback"],
    };
    const other = { ...client, client_id: "client-b" };
    await first.clientsStore.registerClient(client);
    await first.clientsStore.registerClient(other);
    async function issue(provider, owner) {
      const code = provider.issueCode({
        clientId: owner.client_id,
        redirectUri: client.redirect_uris[0],
        codeChallenge: "challenge",
        fireboardToken: "synthetic-upstream-token",
      });
      return (
        await provider.exchangeAuthorizationCode(
          owner,
          code,
          undefined,
          client.redirect_uris[0],
        )
      ).access_token;
    }
    const token = await issue(first, client);
    const otherToken = await issue(first, other);
    const restarted = createProvider();
    expect(await restarted.clientsStore.getClient(client.client_id)).toEqual(
      client,
    );
    expect(await restarted.verifyAccessToken(token)).toMatchObject({
      clientId: "client-a",
      fireboardToken: "synthetic-upstream-token",
    });
    const newToken = await issue(
      restarted,
      await restarted.clientsStore.getClient(client.client_id),
    );
    await restarted.revokeToken(other, { token });
    await expect(
      createProvider().verifyAccessToken(token),
    ).resolves.toMatchObject({ clientId: "client-a" });
    await restarted.revokeToken(client, { token });
    await expect(createProvider().verifyAccessToken(token)).rejects.toThrow(
      "Invalid token",
    );
    await expect(
      createProvider().verifyAccessToken(newToken),
    ).resolves.toMatchObject({ clientId: "client-a" });
    await expect(
      createProvider().verifyAccessToken(otherToken),
    ).resolves.toMatchObject({ clientId: "client-b" });
    expect(storage.transaction).toHaveBeenCalledTimes(2);
    expect(
      [...entries.keys()].every(
        (key) => !key.includes(token) && !key.includes(otherToken),
      ),
    ).toBe(true);
    expect(idFromString).toHaveBeenCalledWith("runtime-container-id");
    expect(get).toHaveBeenCalledWith("runtime-container-id");
  });

  it("does not persist unfinished authorization codes", async () => {
    const { storage } = durableStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) =>
        Response.json(await accessOAuthState(storage, JSON.parse(init.body))),
      ),
    );
    const first = new FireboardOAuthProvider(
      new DurableOAuthState("http://oauth-state.internal/"),
    );
    const client = {
      client_id: "client",
      redirect_uris: ["https://client.example/callback"],
    };
    const code = first.issueCode({
      clientId: "client",
      redirectUri: client.redirect_uris[0],
      codeChallenge: "challenge",
      fireboardToken: "synthetic-upstream-token",
    });
    const restarted = new FireboardOAuthProvider(
      new DurableOAuthState("http://oauth-state.internal/"),
    );
    await expect(
      restarted.exchangeAuthorizationCode(
        client,
        code,
        undefined,
        client.redirect_uris[0],
      ),
    ).rejects.toThrow("Invalid authorization code");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed without falling back to empty memory when storage is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    const state = new DurableOAuthState("http://oauth-state.internal/");
    await expect(state.getToken("synthetic-token")).rejects.toBeInstanceOf(
      OAuthStateUnavailableError,
    );
    await expect(state.getClient("client")).rejects.toBeInstanceOf(
      OAuthStateUnavailableError,
    );
    await expect(
      state.putToken("synthetic-token", {
        clientId: "client",
        fireboardToken: "secret",
      }),
    ).rejects.toBeInstanceOf(OAuthStateUnavailableError);
  });

  it("rejects arbitrary storage collections and unexpected bridge routes", async () => {
    const { storage } = durableStorage();
    await expect(
      accessOAuthState(storage, {
        action: "put",
        collection: "__CF_CONTAINER_STATE",
        key: "x",
        value: {},
      }),
    ).rejects.toThrow("Invalid OAuth state operation");
    await expect(
      accessOAuthState(storage, {
        action: "delete",
        collection: "clients",
        key: "client",
      }),
    ).rejects.toThrow("Invalid OAuth state action");
    expect(
      (
        await oauthStateOutbound(
          new Request("http://oauth-state.internal/private"),
          {},
          {},
        )
      ).status,
    ).toBe(404);
    expect(storage.put).not.toHaveBeenCalled();
  });
});
