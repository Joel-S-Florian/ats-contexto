import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signWebhook } from "@ats/shared/webhook";
import { handleReceiver } from "./receiver.js";

const SECRET = "whsec_demo_local_secret_0001";
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleReceiver(req, res, base).then((ok) => ok || res.writeHead(404).end());
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const send = (opts: { secret?: string; ts?: number; id?: string } = {}) => {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    schema_version: "1.0",
    id: opts.id ?? `evt_${Math.random()}`,
    event: "candidate.hired",
    data: {},
  });
  return fetch(`${base}/webhooks/hired`, {
    method: "POST",
    headers: {
      "x-ats-timestamp": String(ts),
      "x-ats-signature": signWebhook(opts.secret ?? SECRET, ts, body),
      "x-ats-delivery": "del_1",
    },
    body,
  });
};
const events = async () =>
  (await (await fetch(`${base}/receptor/events.json`)).json()) as {
    responded: number;
    validation: string;
    duplicate: boolean;
  }[];

describe("receptor de contratados", () => {
  it("acepta una firma válida y la muestra", async () => {
    expect((await send()).status).toBe(200);
    expect((await events())[0]).toMatchObject({ responded: 200, validation: "Firma válida" });
  });
  it("rechaza firma inválida, secreto equivocado y marcas de tiempo viejas", async () => {
    expect((await send({ secret: "otro" })).status).toBe(401);
    expect((await send({ ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await events())[0]!.validation).toContain("fuera de tolerancia");
  });
  it("simula errores para ejercitar los reintentos y detecta duplicados", async () => {
    await fetch(`${base}/receptor/fail?n=2`, { method: "POST" });
    const statuses = [
      (await send({ id: "evt_dup" })).status,
      (await send({ id: "evt_dup" })).status,
      (await send({ id: "evt_dup" })).status,
      (await send({ id: "evt_dup" })).status,
    ];
    expect(statuses).toEqual([500, 500, 200, 200]);
    expect((await events())[0]).toMatchObject({ duplicate: true });
  });
  it("la página y los botones de prueba responden", async () => {
    expect((await fetch(`${base}/receptor`)).status).toBe(200);
    await fetch(`${base}/receptor/send-ok`, { method: "POST" });
    await fetch(`${base}/receptor/send-bad`, { method: "POST" });
    const ev = await events();
    expect(ev[0]!.responded).toBe(401);
    expect(ev[1]!.responded).toBe(200);
    await fetch(`${base}/receptor/clear`, { method: "POST" });
    expect(await events()).toEqual([]);
  });
});
