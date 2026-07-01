import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = __dirname;
const maxArchiveBytes = 256 * 1024;
const textEncoder = new TextEncoder();
let synapseClientPromise;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function jsonResponse(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(payload);
}

function normalizePrivateKey(value) {
  if (!value) return '';
  return value.startsWith('0x') ? value : `0x${value}`;
}

function chainName() {
  return process.env.SYNAPSE_CHAIN === 'mainnet' ? 'mainnet' : 'calibration';
}

async function getSynapseClient() {
  if (!process.env.SYNAPSE_PRIVATE_KEY) {
    throw Object.assign(new Error('Set SYNAPSE_PRIVATE_KEY on the server.'), { statusCode: 503 });
  }

  if (!synapseClientPromise) {
    synapseClientPromise = Promise.all([
      import('@filoz/synapse-sdk'),
      import('viem/accounts')
    ]).then(([synapseModule, accountsModule]) => {
      const { Synapse, calibration, mainnet } = synapseModule;
      const { privateKeyToAccount } = accountsModule;
      const chain = chainName() === 'mainnet' ? mainnet : calibration;
      const account = privateKeyToAccount(normalizePrivateKey(process.env.SYNAPSE_PRIVATE_KEY));
      return Synapse.create({ account, chain });
    });
  }

  return synapseClientPromise;
}

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxArchiveBytes) {
      throw Object.assign(new Error(`Archive payload exceeds ${maxArchiveBytes} bytes.`), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function digestForBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function prepareProofEnvelope(body) {
  if (!body?.proof || body.proof.schema !== 'pop2048-agent-proof-v1') {
    throw Object.assign(new Error('Invalid proof package.'), { statusCode: 422 });
  }

  const envelope = {
    proof: body.proof,
    digest: body.digest,
    archivedAt: new Date().toISOString(),
    source: process.env.SYNAPSE_SOURCE || 'pop2048-agent'
  };
  const bytes = textEncoder.encode(JSON.stringify(envelope, null, 2));
  if (bytes.byteLength > maxArchiveBytes) {
    throw Object.assign(new Error(`Proof package exceeds ${maxArchiveBytes} bytes.`), { statusCode: 413 });
  }
  return { envelope, bytes };
}

async function archiveProofPackage(body) {
  const { bytes } = prepareProofEnvelope(body);
  const synapse = await getSynapseClient();

  const preflight = await synapse.storage.prepare({
    dataSize: BigInt(bytes.byteLength)
  });

  let paymentTxHash = null;
  if (preflight?.transaction) {
    const prepared = await preflight.transaction();
    paymentTxHash = prepared?.hash || null;
  }

  const result = await synapse.storage.upload(bytes);
  const pieceCid = String(result.pieceCid || result.pieceCID || result.commp || '');

  return {
    pieceCid,
    chain: chainName(),
    bytes: bytes.byteLength,
    digest: digestForBytes(bytes),
    complete: Boolean(result.complete),
    providerCopyCount: Array.isArray(result.providerIds) ? result.providerIds.length : result.providerCopyCount || null,
    paymentTxHash
  };
}

async function retrieveProofPackage(pieceCid) {
  if (!pieceCid) {
    throw Object.assign(new Error('PieceCID is required.'), { statusCode: 422 });
  }
  const synapse = await getSynapseClient();
  const downloaded = await synapse.storage.download({ pieceCid });
  const text = new TextDecoder().decode(downloaded);
  const parsed = JSON.parse(text);
  return {
    pieceCid,
    digest: parsed.digest || null,
    proof: parsed.proof,
    archivedAt: parsed.archivedAt || null
  };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const normalized = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicRoot, normalized);

  if (!filePath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');

    try {
      if (request.method === 'GET' && url.pathname === '/api/status') {
        jsonResponse(response, 200, {
          synapseConfigured: Boolean(process.env.SYNAPSE_PRIVATE_KEY),
          chain: chainName(),
          maxArchiveBytes,
          source: process.env.SYNAPSE_SOURCE || 'pop2048-agent'
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/archive') {
        const body = await readRequestJson(request);
        const receipt = await archiveProofPackage(body);
        jsonResponse(response, 200, receipt);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/retrieve') {
        const result = await retrieveProofPackage(url.searchParams.get('pieceCid'));
        jsonResponse(response, 200, result);
        return;
      }

      if (request.method === 'GET') {
        await serveStatic(request, response);
        return;
      }

      jsonResponse(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    } catch (error) {
      jsonResponse(response, error.statusCode || 500, {
        error: error.code || 'REQUEST_FAILED',
        message: error.message
      });
    }
  });
}

export async function startServer() {
  const port = Number(process.env.PORT || 8787);
  const server = createAppServer();
  server.listen(port, () => {
    const mode = process.env.SYNAPSE_PRIVATE_KEY ? 'Synapse live' : 'Synapse not configured';
    console.log(`PoP2048Agent running at http://127.0.0.1:${port}`);
    console.log(`Filecoin archive: ${mode} on ${chainName()}`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}

