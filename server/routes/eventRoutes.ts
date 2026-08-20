import { Express, Request, Response } from "express";
import { eventHub } from "../events/eventHub";

export function registerEventRoutes(app: Express) {
  app.get("/api/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(
      `data: ${JSON.stringify({ event: "connected", ts: new Date().toISOString() })}\n\n`
    );
    eventHub.addClient(res);
  });
}
