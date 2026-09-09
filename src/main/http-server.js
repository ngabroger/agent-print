const http = require('node:http');
const printQueue = require('./print-queue');
const store = require('./config-store');

// Jalur cetak HTML — hanya tersedia di Windows (butuh BrowserWindow render).
let htmlPrinter = null;
if (process.platform === 'win32') {
  htmlPrinter = require('./html-printer');
}

/**
 * HTTP server loopback untuk local print agent (docs/zd220-print-agent.md §3.1).
 *
 * - Listen HANYA di 127.0.0.1 — tidak ada permukaan jaringan.
 * - Route: GET /health, GET /printers, POST /print.
 * - CORS + preflight OPTIONS wajib, jika tidak fetch dari halaman dsmart gagal.
 * - Nol dependency (node:http).
 */

function setCors(res, origin) {
  const allowed = store.get('allowedOrigins') ?? ['*'];
  const ok = allowed.includes('*') || (origin && allowed.includes(origin));
  res.setHeader('Access-Control-Allow-Origin', ok ? origin || '*' : allowed[0] || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function handleRequest(req, res) {
  setCors(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = (req.url || '').split('?')[0];

  try {
    if (req.method === 'GET' && url === '/health') {
      return sendJson(res, 200, await require('./health').healthSummary());
    }

    if (req.method === 'GET' && url === '/printers') {
      return sendJson(res, 200, { printers: await printQueue.listPrinters() });
    }

    if (req.method === 'POST' && url === '/print') {
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        return sendJson(res, 400, { error: 'invalid_json', message: 'body is not valid JSON' });
      }

      if (typeof body.zpl !== 'string' || !body.zpl.trim()) {
        return sendJson(res, 400, { error: 'invalid_zpl', message: "field 'zpl' is required" });
      }

      const printer = body.printer || store.get('defaultZplPrinter');
      try {
        const jobId = await printQueue.enqueuePrintJob({
          type: 'zpl',
          data: body.zpl,
          copies: Number(body.copies) || 1,
          printer,
        });
        return sendJson(res, 200, { jobId, printer });
      } catch (err) {
        const msg = String(err?.message ?? err);
        if (msg.startsWith('printer_not_found')) {
          return sendJson(res, 404, { error: 'printer_not_found', message: msg });
        }
        if (msg.startsWith('invalid_zpl')) {
          return sendJson(res, 400, { error: 'invalid_zpl', message: msg });
        }
        return sendJson(res, 500, { error: 'internal', message: msg });
      }
    }

    if (req.method === 'POST' && url === '/print-html') {
      if (!htmlPrinter) {
        return sendJson(res, 501, {
          error: 'not_supported',
          message: 'HTML printing is only available on Windows.',
        });
      }

      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        return sendJson(res, 400, { error: 'invalid_json', message: 'body is not valid JSON' });
      }

      if (typeof body.html !== 'string' || !body.html.trim()) {
        return sendJson(res, 400, { error: 'invalid_html', message: "field 'html' is required" });
      }

      try {
        const { printer } = await htmlPrinter.printHtml(body.html, {
          printer: body.printer || store.get('defaultZplPrinter'),
          copies: Number(body.copies) || 1,
          pageSize: body.pageSize, // { width, height } dalam mikron; undefined = default printer
          landscape: Boolean(body.landscape),
          marginsType: body.marginsType || 'none',
        });
        return sendJson(res, 200, { jobId: String(Date.now()), printer });
      } catch (err) {
        const msg = String(err?.message ?? err);
        if (msg.startsWith('printer_not_found')) {
          return sendJson(res, 404, { error: 'printer_not_found', message: msg });
        }
        if (msg.startsWith('invalid_html')) {
          return sendJson(res, 400, { error: 'invalid_html', message: msg });
        }
        return sendJson(res, 500, { error: 'internal', message: msg });
      }
    }

    return sendJson(res, 404, { error: 'not_found', message: url });
  } catch (err) {
    return sendJson(res, 500, { error: 'internal', message: String(err?.message ?? err) });
  }
}

let server = null;

function startHttpServer() {
  if (server) return server;
  const port = Number(store.get('printAgentPort')) || 9110;

  server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[print-agent] unhandled:', err);
      try {
        sendJson(res, 500, { error: 'internal', message: String(err?.message ?? err) });
      } catch {
        /* response sudah terkirim */
      }
    });
  });

  server.on('error', (err) => {
    console.error(`[print-agent] server error (port ${port}):`, err.message);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[print-agent] listening on http://127.0.0.1:${port}`);
  });

  return server;
}

function stopHttpServer() {
  server?.close();
  server = null;
}

function isListening() {
  return Boolean(server && server.listening);
}

module.exports = { startHttpServer, stopHttpServer, isListening };
