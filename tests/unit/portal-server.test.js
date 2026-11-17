import http from "node:http";
import { describe, it, expect } from "vitest";

describe("Portal Server Secondary Listener", () => {
  it("proxies request to main server and attaches x-9r-portal-port header", async () => {
    // 1. Mock main server on dynamic port
    let receivedHeader = null;
    let receivedPath = null;

    const mainServer = http.createServer((req, res) => {
      receivedHeader = req.headers["x-9r-portal-port"];
      receivedPath = req.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });

    await new Promise((resolve) => mainServer.listen(0, "127.0.0.1", resolve));
    const mainPort = mainServer.address().port;

    // 2. Start proxy server
    const proxyServer = http.createServer((req, res) => {
      const headers = { ...req.headers };
      headers["host"] = `127.0.0.1:${mainPort}`;
      headers["x-9r-portal-port"] = "1";

      const pReq = http.request(
        {
          hostname: "127.0.0.1",
          port: mainPort,
          path: req.url,
          method: req.method,
          headers,
        },
        (pRes) => {
          res.writeHead(pRes.statusCode, pRes.headers);
          pRes.pipe(res);
        }
      );
      req.pipe(pReq);
    });

    await new Promise((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
    const proxyPort = proxyServer.address().port;

    // 3. Send test request to proxy
    const clientRes = await fetch(`http://127.0.0.1:${proxyPort}/portal`);
    const data = await clientRes.json();

    expect(clientRes.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(receivedHeader).toBe("1");
    expect(receivedPath).toBe("/portal");

    // Cleanup
    await new Promise((resolve) => proxyServer.close(resolve));
    await new Promise((resolve) => mainServer.close(resolve));
  });
});
