import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../frontend/public/sw.js", import.meta.url), "utf8");

test("service worker removes only obsolete Safr caches", async () => {
  const deleted: string[] = [];
  let activate: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;
  runInNewContext(source, {
    self: {
      addEventListener: (name: string, handler: typeof activate) => {
        if (name === "activate") activate = handler;
      },
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => [
        "safr-emergency-cache-v1",
        "safr-emergency-cache-old",
        "another-app-cache",
      ],
      delete: async (name: string) => {
        deleted.push(name);
      },
    },
  });
  let completion: Promise<unknown> | undefined;
  activate!({
    waitUntil: (promise) => {
      completion = promise;
    },
  });
  await completion;
  assert.deepEqual(deleted, ["safr-emergency-cache-old"]);
});

test("service worker leaves external, POST and server requests alone", () => {
  let handleFetch: (event: {
    request: { url: string; method: string };
    respondWith: () => void;
  }) => void;
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://safr.test" },
      addEventListener: (name: string, handler: typeof handleFetch) => {
        if (name === "fetch") handleFetch = handler;
      },
    },
  });
  for (const [url, method] of [
    ["https://tiles.test/tile", "GET"],
    ["https://safr.test/explore", "POST"],
    ["https://safr.test/_server/test", "GET"],
    ["https://safr.test/api/alert", "GET"],
  ]) {
    handleFetch!({
      request: { url: url!, method: method! },
      respondWith: () => assert.fail("Request should bypass the worker"),
    });
  }
});
