import net from "node:net";

export interface VirusScanner {
  scan(data: Buffer): Promise<"clean" | "infected">;
}

const EICAR = String.raw`X5O!P%@AP[4PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;

/** Desarrollo/pruebas: solo detecta la cadena de prueba EICAR. No protege en produccion. */
export const eicarScanner: VirusScanner = {
  async scan(data) {
    return data.includes(EICAR) ? "infected" : "clean";
  },
};

/** ClamAV via clamd (protocolo INSTREAM). Falla cerrado: si clamd no responde, el archivo no se acepta. */
export function clamdScanner(host: string, port = 3310): VirusScanner {
  return {
    scan: (data) =>
      new Promise((resolve, reject) => {
        const sock = net.connect({ host, port, timeout: 15000 });
        let out = "";
        sock.on("connect", () => {
          sock.write("zINSTREAM\0");
          for (let i = 0; i < data.length; i += 64 * 1024) {
            const chunk = data.subarray(i, i + 64 * 1024);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(chunk.length);
            sock.write(Buffer.concat([len, chunk]));
          }
          sock.write(Buffer.alloc(4));
        });
        sock.on("data", (d) => (out += d.toString()));
        sock.on("end", () =>
          out.includes("FOUND")
            ? resolve("infected")
            : out.includes("OK")
              ? resolve("clean")
              : reject(new Error("clamd: respuesta inesperada")),
        );
        sock.on("timeout", () => (sock.destroy(), reject(new Error("clamd: tiempo agotado"))));
        sock.on("error", reject);
      }),
  };
}
