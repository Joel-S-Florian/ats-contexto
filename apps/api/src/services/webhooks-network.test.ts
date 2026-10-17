import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSafeFetch } from "./webhooks.js";

let server: Server;
let port = 0;
beforeAll(async () => {
  server = createServer((_req, res) => res.writeHead(200).end("ok"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

// Estas pruebas usan el cliente HTTP REAL (las del flujo completo inyectan un fetch falso): detectan, por ejemplo,
// incompatibilidades del Agent con el fetch global.
describe("cliente HTTP de webhooks (red real)", () => {
  it("entrega a localhost solo cuando el modo de desarrollo lo permite", async () => {
    const dev = createSafeFetch({ allowLocalhost: true });
    const res = await dev(`http://localhost:${port}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
  });

  it("en producción no conecta a localhost aunque la URL llegue a este punto", async () => {
    const prod = createSafeFetch({ allowLocalhost: false });
    await expect(
      prod(`http://localhost:${port}/hook`, { method: "POST", body: "{}" }),
    ).rejects.toThrow();
  });
});
