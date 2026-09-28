#!/usr/bin/env node
// Local dev-only relay for uploading proof-page artifacts to Succinct's S3 bucket.
//
// Why this exists: browsers can't PUT to https://spn-artifacts-mainnet.s3.*.amazonaws.com/... — that bucket
// has no CORS policy for browser origins at all (verified live: the preflight OPTIONS itself gets HTTP 403,
// regardless of origin scheme). That's a gap on Succinct's side, not something fixable in client code. A
// server-to-server request has no CORS restriction, so this tiny relay does the PUT for the browser: the app
// PUTs to this instead, this PUTs to S3 for real, and relays the response back with permissive CORS headers.
//
// This is a workaround for local testing only. It does not belong in production — either Succinct adds CORS
// to that bucket, or a real deployment needs its own equivalent of this running server-side.
//
// Usage: node scripts/artifact-proxy.mjs [port]   (default port 8787)
// Then:  VITE_ARTIFACT_PROXY_URL=http://localhost:8787 pnpm dev

import { createServer } from 'node:http'

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

const PORT = Number(process.argv[2]) || 8787
const HOST = '127.0.0.1' // localhost only — this is an open PUT relay, never bind it beyond loopback
const ALLOWED_HOST_SUFFIX = '.amazonaws.com' // only forward to Succinct's artifact bucket, not anywhere else

/** @param {ServerResponse} res */
function withCors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'PUT, GET, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
}

/**
 * @param {IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    req.on('data', (/** @type {Buffer} */ c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
async function handleRequest(req, res) {
  withCors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = req.url ?? ''
  const isDownload = req.method === 'GET' && url.startsWith('/download')
  if (!isDownload && !(req.method === 'PUT' && url.startsWith('/upload'))) {
    res.writeHead(404)
    res.end('not found. PUT /upload?url=<encoded presigned url> or GET /download?url=<encoded url>')
    return
  }

  const target = new URL(url, `http://${HOST}:${PORT}`).searchParams.get('url')
  if (!target) {
    res.writeHead(400)
    res.end('missing ?url=')
    return
  }
  let targetUrl
  try {
    targetUrl = new URL(target)
  } catch {
    res.writeHead(400)
    res.end('bad ?url=')
    return
  }
  if (!targetUrl.hostname.endsWith(ALLOWED_HOST_SUFFIX)) {
    res.writeHead(403)
    res.end(`refusing to proxy to ${targetUrl.hostname}: only *${ALLOWED_HOST_SUFFIX} is allowed`)
    return
  }

  if (isDownload) {
    try {
      const upstream = await fetch(targetUrl)
      const bytes = Buffer.from(await upstream.arrayBuffer())
      console.log(`GET ${targetUrl.hostname}${targetUrl.pathname} <- ${upstream.status} (${bytes.length} bytes)`)
      res.writeHead(upstream.status, { 'content-type': 'application/octet-stream' })
      res.end(bytes)
    } catch (e) {
      console.error('  download failed:', e)
      res.writeHead(502)
      res.end(String(e))
    }
    return
  }

  const body = await readBody(req)
  console.log(`PUT ${body.length} bytes -> ${targetUrl.hostname}${targetUrl.pathname}`)

  try {
    const upstream = await fetch(targetUrl, { method: 'PUT', body: new Uint8Array(body) })
    const text = await upstream.text()
    console.log(`  <- ${upstream.status}`)
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' })
    res.end(text)
  } catch (e) {
    console.error('  upload failed:', e)
    res.writeHead(502)
    res.end(String(e))
  }
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((e) => {
    console.error('proxy request failed:', e)
    if (!res.headersSent) res.writeHead(500)
    res.end('internal error')
  })
})

server.listen(PORT, HOST, () => {
  console.log(`artifact-proxy listening on http://${HOST}:${PORT}`)
  console.log(`set VITE_ARTIFACT_PROXY_URL=http://${HOST}:${PORT} when running the dev server`)
})
