// Pins the zod-across-the-injection-seam invariant.
//
// packages/core builds the generateObject schema with ITS zod; the real AI
// transport (ai@7) validates/converts with ITS zod. If those ever resolve to
// two physical copies (or diverge across a major), the schema breaks at RUNTIME
// while every faked-generateObject test stays green. These two assertions make
// that regression a test failure instead:
//   (a) core, ai, and the app all resolve zod to ONE physical copy, and
//   (b) the actual schema core hands to generateObject is accepted by the SDK's
//       own offline schema-conversion path (asSchema), no network involved.
//
// Lives in the app, not core: it deliberately imports `ai`, which core must not.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { realpathSync, readFileSync } from "node:fs";
import { asSchema } from "ai";
import { createCore, type GenerateObjectFn } from "@domain-finder/core";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFrom = (relBase: string) =>
  createRequire(resolve(repoRoot, relBase));

test("(a) zod resolves to a single physical copy across core, ai, and the app", () => {
  const fromCore = realpathSync(requireFrom("packages/core/package.json").resolve("zod"));
  const fromAi = realpathSync(requireFrom("node_modules/ai/package.json").resolve("zod"));
  const fromApp = realpathSync(requireFrom("package.json").resolve("zod"));

  assert.equal(fromCore, fromAi, "core and ai must share one physical zod");
  assert.equal(fromCore, fromApp, "core and app must share one physical zod");
});

test("(a) the single zod copy is v4, satisfying ai@7's peer range", () => {
  const zodPkgPath = requireFrom("package.json").resolve("zod/package.json");
  const zodVersion = JSON.parse(readFileSync(zodPkgPath, "utf8")).version as string;
  assert.match(zodVersion, /^4\./, `expected zod 4.x, got ${zodVersion}`);

  const aiPkgPath = requireFrom("package.json").resolve("ai/package.json");
  const aiPeer = JSON.parse(readFileSync(aiPkgPath, "utf8")).peerDependencies?.zod as string;
  // ai@7 declares "^3.25.76 || ^4.1.8" — assert it admits a zod-4 line at all.
  assert.match(aiPeer, /\^4\./, `ai peer range does not admit zod 4: ${aiPeer}`);
});

test("(b) core's actual generateObject schema is accepted by the SDK's offline converter", async () => {
  // Capture the exact schema core builds and hands to the injected transport.
  let capturedSchema: unknown;
  let capturedModel: string | undefined;
  const capture: GenerateObjectFn = async <T,>(args: {
    model: string;
    schema: unknown;
    prompt: string;
  }) => {
    capturedSchema = args.schema;
    capturedModel = args.model;
    return { object: { names: [] } as unknown as T };
  };

  const core = createCore({
    fetch: async () => new Response("", { status: 404 }),
    config: { aiApiKey: "present", aiModel: "test/model" },
    generateObject: capture,
  });

  // Trigger the AI path (key present, useAi not false) so the schema is built.
  await core.generateSuggestions("recipe sharing app", { useAi: true, useHacks: false });

  assert.ok(capturedSchema, "core should have built and passed a schema");
  assert.equal(capturedModel, "test/model", "config.aiModel should reach the transport");

  // The real landmine test: run core's schema through the SAME offline path the
  // AI SDK uses internally. Two incompatible zod copies would fail here.
  const converted = asSchema(capturedSchema as never);
  assert.equal(converted.jsonSchema.type, "object");
  assert.ok(
    converted.jsonSchema.properties && "names" in converted.jsonSchema.properties,
    "converted JSON schema should carry the `names` field core defines",
  );
});
