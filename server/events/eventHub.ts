import { Response } from "express";

type Listener = (event: string, payload: any) => void;

/**
 * Simple in-memory event hub that broadcasts changes (jobs, leads, landing pages)
 * to connected SSE clients and to internal subscribers.
 */
class EventHub {
  private clients: Set<Response> = new Set();
  private listeners: Listener[] = [];

  addClient(res: Response) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  emit(event: string, payload: any = {}) {
    const data = `data: ${JSON.stringify({
      event,
      payload,
      ts: new Date().toISOString(),
    })}\n\n`;

    this.clients.forEach((c) => {
      try {
        c.write(data);
      } catch {
        /* ignore */
      }
    });

    this.listeners.forEach((l) => {
      try {
        l(event, payload);
      } catch {
        /* ignore */
      }
    });
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn);
    };
  }
}

export const eventHub = new EventHub();
