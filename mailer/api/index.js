/*
  Vercel entry point. Vercel runs each file under `api/` as a serverless
  function and hands it a plain (req, res), which an Express app already is —
  so the app is exported directly rather than wrapped.

  Environment variables come from the project's settings there, not from
  .env, which is why nothing in this file reads one.
*/
import { createApp } from "../src/app.js";

export default createApp();
