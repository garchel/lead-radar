import type { NextFunction, Request, Response } from "express";

/**
 * Rate limiter simples em memória (janela fixa por IP).
 * Ativado apenas quando API_RATE_LIMIT está definido (ex.: "120" = 120 req/min).
 * Sem a variável, comporta-se como no-op — localhost não precisa.
 */
export function rateLimit(maxPerMinute: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!maxPerMinute || maxPerMinute <= 0) return next();

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + 60_000 });
      // limpa entradas expiradas periodicamente para não vazar memória
      if (hits.size > 5000) {
        for (const [k, v] of hits) {
          if (v.resetAt <= now) hits.delete(k);
        }
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > maxPerMinute) {
      return res.status(429).json({
        success: false,
        error: "Muitas requisições. Tente novamente em instantes.",
      });
    }
    next();
  };
}
