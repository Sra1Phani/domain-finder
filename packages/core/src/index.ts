// @domain-finder/core — the clearance core.
//
// Pure domain logic only: no HTTP, no framework, no database, no process.env.
// Anything here must be liftable into any surface (this web app, a future MCP
// server, a REST API) without dragging infrastructure along. The boundary is
// enforced two ways: this package lists none of next/react/drizzle-orm/postgres
// as dependencies, and an ESLint rule (see eslint.config.mjs) fails on a
// forbidden import or a process.env read anywhere under packages/core.

export * from "./types";
export * from "./tlds";
export * from "./rdap-status";
export * from "./rank";
export * from "./cadence";
export * from "./cache";
export * from "./pool";
export * from "./availability";
export * from "./namespace";
export * from "./hacks";
export * from "./generate";
export * from "./search";
export * from "./core";
