import http from "node:http";

const g = (global.__portalServerSingleton ??= {
  server: null,
  listening: false,
});

/**
 * Starts the secondary HTTP listener on USER_PORT (default 20229)
 * and proxies requests to the main 9Router server on PORT (default 20228).
 * Injects `x-9r-portal-port: 1` so dashboardGuard isolates portal routes.
 */
export function startUserPortalServer() {
  // Never run in build phase
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export" ||
    process.env.NEXT_PHASE === "phase-static";

  if (isBuildPhase || typeof window !== "undefined") return;

  const portalPort = parseInt(process.env.USER_PORT || process.env.PORT_USER || "20229", 10);
  const mainPort = parseInt(process.env.PORT || "20228", 10);

  if (!portalPort || portalPort === mainPort) return;
  if (g.server && g.listening) return;

  try {
    const server = http.createServer((req, res) => {
      const headers = { ...req.headers };
      headers["host"] = `127.0.0.1:${mainPort}`;
      headers["x-9r-portal-port"] = "1";
      if (!headers["x-forwarded-for"]) {
        headers["x-forwarded-for"] = req.socket.remoteAddress || "127.0.0.1";
      }
      if (!headers["x-forwarded-proto"]) {
        headers["x-forwarded-proto"] = "http";
      }

      const proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port: mainPort,
          path: req.url,
          method: req.method,
          headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            `<html><body style="font-family:sans-serif;background:#0d0f12;color:#fff;padding:40px;text-align:center;">` +
            `<h2 style="color:#f59e0b">9Router Portal Connecting...</h2>` +
            `<p style="color:#888">Waiting for main server on port ${mainPort} to become ready (${err.message}).</p>` +
            `<script>setTimeout(() => location.reload(), 2000);</script>` +
            `</body></html>`
          );
        }
      });

      req.pipe(proxyReq);
    });

    // Support WebSocket / HMR for Next.js Fast Refresh and websockets
    server.on("upgrade", (req, socket, head) => {
      const headers = { ...req.headers };
      headers["host"] = `127.0.0.1:${mainPort}`;
      headers["x-9r-portal-port"] = "1";

      const proxyReq = http.request({
        hostname: "127.0.0.1",
        port: mainPort,
        path: req.url,
        method: req.method,
        headers,
      });

      proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\n` +
            Object.entries(proxyRes.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\r\n") +
            `\r\n\r\n`
        );
        if (proxyHead && proxyHead.length) socket.write(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });

      proxyReq.on("error", () => {
        socket.destroy();
      });

      proxyReq.end();
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        g.listening = true;
        return;
      }
      console.warn(`[UserPortal] Could not bind port ${portalPort}:`, err.message);
    });

    server.listen(portalPort, "0.0.0.0", () => {
      g.listening = true;
      console.log(`\n========================================================`);
      console.log(`🚀 [UserPortal] Client Portal running on:`);
      console.log(`   http://localhost:${portalPort}/portal`);
      console.log(`========================================================\n`);
    });

    g.server = server;

    const cleanup = () => {
      try {
        server.close();
      } catch {}
      g.listening = false;
      g.server = null;
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  } catch (err) {
    console.warn(`[UserPortal] Failed to spawn listener:`, err.message);
  }
}
