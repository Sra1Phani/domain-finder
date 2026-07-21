// Tests for vibe / short-only steering added to generation.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCore, type FetchLike } from "./index";
import { ruleBasedLabels, SHORT_MAX_LEN, type GenerateObjectFn } from "./generate";

const notFound: FetchLike = async () => new Response("", { status: 404 });

test("ruleBasedLabels swaps the affix pool by vibe", () => {
  const techy = ruleBasedLabels("photo", "techy");
  const playful = ruleBasedLabels("photo", "playful");
  // vibe-specific suffixes show up in their own pool and not the other's
  assert.ok(techy.includes("photostack"), `techy: ${JSON.stringify(techy)}`);
  assert.ok(playful.includes("photopop"), `playful: ${JSON.stringify(playful)}`);
  assert.ok(!techy.includes("photopop"), "playful suffix leaked into techy");
  assert.ok(!playful.includes("photostack"), "techy suffix leaked into playful");
});

// A fake AI transport that returns one long and one short label.
const twoLabels: GenerateObjectFn = (async () => ({
  object: {
    names: [
      { name: "superlongbrandname", rationale: "long" },
      { name: "tiny", rationale: "short" },
    ],
  },
})) as GenerateObjectFn;

test("short:true drops labels longer than SHORT_MAX_LEN", async () => {
  const core = createCore({ fetch: notFound, config: { aiApiKey: "k" }, generateObject: twoLabels });
  // query has no usable keywords -> only the AI labels feed generation
  const { suggestions } = await core.generateSuggestions("a the", {
    useAi: true,
    useHacks: false,
    short: true,
  });
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((s) => s.sld.length <= SHORT_MAX_LEN), "a long label survived the short filter");
  assert.ok(suggestions.some((s) => s.sld === "tiny"));
  assert.ok(!suggestions.some((s) => s.sld === "superlongbrandname"));
});

test("without short, the long label is kept (control)", async () => {
  const core = createCore({ fetch: notFound, config: { aiApiKey: "k" }, generateObject: twoLabels });
  const { suggestions } = await core.generateSuggestions("a the", { useAi: true, useHacks: false });
  assert.ok(suggestions.some((s) => s.sld === "superlongbrandname"));
});

test("vibe injects a tone line into the AI prompt; 'any' does not", async () => {
  const prompts: string[] = [];
  const capturing: GenerateObjectFn = (async (args: { prompt: string }) => {
    prompts.push(args.prompt);
    return { object: { names: [{ name: "acme", rationale: "r" }] } };
  }) as GenerateObjectFn;

  const core = createCore({ fetch: notFound, config: { aiApiKey: "k" }, generateObject: capturing });

  await core.generateSuggestions("recipe app", { useAi: true, useHacks: false, vibe: "playful" });
  assert.match(prompts.at(-1)!, /Tone: playful/);

  await core.generateSuggestions("recipe app", { useAi: true, useHacks: false, vibe: "any" });
  assert.ok(!/Tone:/.test(prompts.at(-1)!), "'any' vibe should not add a tone line");
});
