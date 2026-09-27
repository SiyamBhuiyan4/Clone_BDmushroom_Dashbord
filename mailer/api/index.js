/*
  Vercel entry point.

  Vercel runs each file under `api/` as a serverless function and hands it a
  plain (req, res), which an Express app already is. `vercel.json` rewrites
  every path here so the app keeps owning its own routing.

  The URL is normalised first. Depending on how the rewrite is resolved the
  function can be handed either the original path or one still carrying the
  `/api` prefix, and the app's routes are mounted at the root — so without
  this, `/send/otp` arrives as `/api/send/otp` and 404s, which looks exactly
  like a broken deployment rather than a routing detail.

  Environment variables come from the project's settings on Vercel, not from
  .env, which is why nothing here reads one.
*/
import { createApp } from "../src/app.js";

const app = createApp();

export default function handler(req, res) {
  if (typeof req.url === "string" && req.url.startsWith("/api")) {
    const rest = req.url.slice("/api".length);
    req.url = rest === "" || rest[0] !== "/" ? `/${rest}` : rest;
    if (req.url === "/") req.url = "/";
  }
  return app(req, res);
}
