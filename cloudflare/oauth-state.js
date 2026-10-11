export async function accessOAuthState(storage, operation) {
  const { action, collection, key } = operation;
  if (
    !["clients", "tokens"].includes(collection) ||
    typeof key !== "string" ||
    !key ||
    key.length > 1024
  )
    throw new Error("Invalid OAuth state operation");
  const storageKey = `oauth:${collection}:${key}`;
  switch (action) {
    case "get":
      return (await storage.get(storageKey)) ?? null;
    case "put":
      if (!operation.value || typeof operation.value !== "object")
        throw new Error("Invalid OAuth state value");
      await storage.put(storageKey, operation.value);
      return null;
    case "revoke":
      if (collection !== "tokens" || typeof operation.clientId !== "string")
        throw new Error("Invalid revocation");
      await storage.transaction(async (transaction) => {
        const token = await transaction.get(storageKey);
        if (token?.clientId === operation.clientId)
          await transaction.delete(storageKey);
      });
      return null;
    default:
      throw new Error("Invalid OAuth state action");
  }
}

export async function oauthStateOutbound(request, env, context) {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/") {
    return new Response("Not found", { status: 404 });
  }
  const container = env.FIREBOARD.get(
    env.FIREBOARD.idFromString(context.containerId),
  );
  const result = await container.oauthState(await request.json());
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
