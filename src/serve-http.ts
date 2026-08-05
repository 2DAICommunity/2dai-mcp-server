/** Hosted transport for mcp.2dai.io.
 *
 *  Stateless Streamable HTTP: each POST /mcp is one full MCP session end-to-end.
 *  Every request builds its own SDK client from the header key, its own McpServer,
 *  and its own transport — nothing survives the response. That is what makes a
 *  single process safe to share across users: no session table, no per-user
 *  client cache, no cross-request state to leak.
 *
 *  Auth is `Authorization: Bearer <2DAI api key>`; the value is passed straight
 *  through to the SDK, and the SDK is the one authority on whether the key is
 *  valid, scoped and unrevoked. This server never inspects the key, never logs
 *  it, and never persists it. */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config, HostedConfig } from './config.js';
import { createClient, VERSION } from './context.js';
import { createServer } from './server.js';

const AUTH_RE = /^Bearer\s+(\S+)\s*$/i;

function writeJson(res: ServerResponse, status: number, body: Record<string, unknown>, extra?: Record<string, string>): void {
  res.writeHead(status, { 'content-type': 'application/json', ...(extra ?? {}) });
  res.end(JSON.stringify(body));
}

async function handle(req: IncomingMessage, res: ServerResponse, hosted: HostedConfig): Promise<void> {
  const method = req.method ?? 'GET';
  const path = (req.url ?? '/').split('?')[0];

  // Health probe for compose healthcheck and any front-facing load balancer.
  // Deliberately unauthenticated: the endpoint is a liveness ping, nothing more.
  if (method === 'GET' && (path === '/health' || path === '/healthz')) {
    writeJson(res, 200, { ok: true, name: '2dai-mcp-server', version: VERSION });
    return;
  }

  if (path !== '/mcp') {
    writeJson(res, 404, { error: { code: 'not_found', message: 'Only POST /mcp is served here' } });
    return;
  }

  const auth = req.headers['authorization'];
  const m = typeof auth === 'string' ? AUTH_RE.exec(auth) : null;
  if (!m) {
    writeJson(
      res,
      401,
      { error: { code: 'unauthorized', message: 'Send Authorization: Bearer <your 2DAI API key>' } },
      { 'www-authenticate': 'Bearer realm="2dai-mcp"' },
    );
    return;
  }
  const apiKey = m[1]!;

  const config: Config = { ...hosted, apiKey };
  const client = createClient(config);
  const server = createServer(config, client);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  // If the client disconnects mid-stream, drop both halves so we don't leak
  // an open server or a half-alive SDK poll for a request no one is reading.
  const cleanup = (): void => {
    void transport.close().catch(() => { /* already closed */ });
    void server.close().catch(() => { /* already closed */ });
  };
  res.on('close', cleanup);

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    process.stderr.write(
      `[2dai-mcp-server] handler failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    if (!res.headersSent) {
      writeJson(res, 500, { error: { code: 'internal', message: 'Request handling failed' } });
    } else {
      res.end();
    }
    cleanup();
  }
}

export function startHttpServer(hosted: HostedConfig): void {
  const httpServer = createHttpServer((req, res) => {
    void handle(req, res, hosted);
  });

  // Malformed HTTP frames must not take the whole process down.
  httpServer.on('clientError', (err, socket) => {
    process.stderr.write(`[2dai-mcp-server] client error: ${err.message}\n`);
    try {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } catch {
      /* socket already closed */
    }
  });

  httpServer.listen(hosted.port, hosted.bindHost, () => {
    process.stderr.write(
      `[2dai-mcp-server] http ready on ${hosted.bindHost}:${hosted.port} (version ${VERSION})\n`,
    );
  });

  // Graceful shutdown so container orchestrators (compose stop, k8s SIGTERM)
  // stop accepting new work and let in-flight generations finish returning
  // their queueId before the process dies — otherwise the caller pays for
  // work whose ticket it never received.
  const shutdown = (sig: string) => (): void => {
    process.stderr.write(`[2dai-mcp-server] ${sig} — shutting down\n`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}
