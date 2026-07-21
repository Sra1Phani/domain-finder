import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hasAffiliateLinks, registrarLinks, type RegistrarLink } from "./links";

test("registrarLinks builds a correct per-domain URL for each registrar", () => {
  const links = registrarLinks("acme.io");
  const byId = Object.fromEntries(links.map((l) => [l.id, l.url]));
  assert.match(byId.namecheap, /namecheap\.com\/domains\/registration\/results\/\?domain=acme\.io/);
  assert.match(byId.porkbun, /porkbun\.com\/checkout\/search\?q=acme\.io/);
  assert.match(byId.godaddy, /godaddy\.com\/domainsearch\/find\?domainToCheck=acme\.io/);
  assert.match(byId.dynadot, /dynadot\.com\/domain\/search\?domain=acme\.io/);
});

test("registrarLinks is ordered neutrally (alphabetical) — order must not imply commission", () => {
  const names = registrarLinks("acme.com").map((l) => l.name);
  assert.deepEqual(names, [...names].sort());
});

test("no affiliate params are wired yet, so the disclosure is hidden", () => {
  const links = registrarLinks("acme.com");
  assert.ok(links.every((l) => l.affiliate === false));
  assert.equal(hasAffiliateLinks(links), false);
});

test("hasAffiliateLinks is true only when a link carries an affiliate param", () => {
  const withAff: RegistrarLink[] = [
    { id: "x", name: "X", url: "https://x.test?ref=abc", affiliate: true },
    { id: "y", name: "Y", url: "https://y.test", affiliate: false },
  ];
  assert.equal(hasAffiliateLinks(withAff), true);
});
