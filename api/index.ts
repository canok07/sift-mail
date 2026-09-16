import type { IncomingMessage, ServerResponse } from "http";
import app from "../server.ts";

/**
 * Vercel Serverless Function Entry Point for Sift Backend APIs.
 * Routes all /api/* calls directly to the Express application.
 */
export default function handler(req: IncomingMessage & { url?: string }, res: ServerResponse) {
  // Normalize incoming URL to ensure /api prefix is preserved
  if (req.url && !req.url.startsWith("/api")) {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }
  return app(req, res);
}
