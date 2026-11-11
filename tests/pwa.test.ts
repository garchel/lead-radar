import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Instalação do PWA: o evento `beforeinstallprompt` precisa ser guardado e
 * reaproveitado. O que se testa aqui é a máquina de estados do utilitário —
 * quem abre o diálogo é o navegador.
 */

type Listener = (event: any) => void;

function mountWindow(standalone = false) {
  const listeners = new Map<string, Listener[]>();
  const win = {
    matchMedia: (query: string) => ({ matches: standalone && query.includes("standalone") }),
    navigator: { standalone: false },
    addEventListener: (type: string, cb: Listener) => {
      const list = listeners.get(type) || [];
      list.push(cb);
      listeners.set(type, list);
    },
    dispatch: (type: string, event: any) => {
      for (const cb of listeners.get(type) || []) cb(event);
    },
  };
  return win;
}

const makePromptEvent = (outcome: "accepted" | "dismissed") => ({
  preventDefault: vi.fn(),
  prompt: vi.fn(async () => {}),
  userChoice: Promise.resolve({ outcome, platform: "web" }),
});

describe("instalação do PWA (src/utils/pwa)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("guarda o evento e libera a instalação quando o navegador oferece", async () => {
    const win = mountWindow();
    vi.stubGlobal("window", win);
    const pwa = await import("../src/utils/pwa");

    pwa.initPwaInstall();
    const seen: boolean[] = [];
    pwa.subscribeInstallChange((available) => seen.push(available));

    expect(pwa.canInstall()).toBe(false);
    win.dispatch("beforeinstallprompt", makePromptEvent("accepted"));
    expect(pwa.canInstall()).toBe(true);
    expect(seen).toContain(true);
  });

  it("devolve 'accepted' e marca como instalado", async () => {
    const win = mountWindow();
    vi.stubGlobal("window", win);
    const pwa = await import("../src/utils/pwa");
    pwa.initPwaInstall();

    win.dispatch("beforeinstallprompt", makePromptEvent("accepted"));
    await expect(pwa.promptInstall()).resolves.toBe("accepted");
    expect(pwa.canInstall()).toBe(false);
  });

  it("mantém o evento quando o usuário recusa — dá para tentar de novo", async () => {
    const win = mountWindow();
    vi.stubGlobal("window", win);
    const pwa = await import("../src/utils/pwa");
    pwa.initPwaInstall();

    win.dispatch("beforeinstallprompt", makePromptEvent("dismissed"));
    await expect(pwa.promptInstall()).resolves.toBe("dismissed");
    expect(pwa.canInstall()).toBe(true);
  });

  it("não oferece instalação quando já está rodando instalado", async () => {
    const win = mountWindow(true);
    vi.stubGlobal("window", win);
    const pwa = await import("../src/utils/pwa");
    pwa.initPwaInstall();

    win.dispatch("beforeinstallprompt", makePromptEvent("accepted"));
    expect(pwa.isStandalone()).toBe(true);
    expect(pwa.canInstall()).toBe(false);
  });

  it("sem evento, promptInstall responde 'unavailable'", async () => {
    const win = mountWindow();
    vi.stubGlobal("window", win);
    const pwa = await import("../src/utils/pwa");
    pwa.initPwaInstall();
    await expect(pwa.promptInstall()).resolves.toBe("unavailable");
  });
});
