# Same-Origin Reverse Proxy Reference for What-Im-Doing Telemetry

When hosting telemetry services (such as Cloudflare Workers + D1) overseas, visitors in Mainland China frequently encounter network interference (TLS SNI reset, TCP RST, or ECH handshake drops on mobile browsers like Firefox Mobile and Chrome Mobile).

Deploying a same-origin reverse proxy at `/api/activity` on your blog's CDN or web server resolves cross-origin restrictions, eliminates SNI resets, and adds micro-caching to protect your backend database quota.

---

## 1. Tencent Cloud EdgeOne Serverless Function

EdgeOne runs JavaScript at edge nodes across mainland China and globally.

### File: `site-root/edge-functions/api/activity.js`

```javascript
/**
 * EdgeOne Serverless Edge Function: /api/activity
 * Forwards requests to the upstream telemetry hub with 5s micro-caching.
 */
const UPSTREAM_HUB_URL = "https://your-hub.workers.dev/api/activity";

async function handleRequest(request) {
  // 1. Handle CORS Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 2. Only allow GET requests for the public readout
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Forward query parameters (e.g. ?brief=1)
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(UPSTREAM_HUB_URL);
  targetUrl.search = incomingUrl.search;

  try {
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "EdgeOne-Activity-Proxy/1.0",
      },
      // Micro-cache on Edge nodes for 5 seconds to reduce D1 reads
      eo: {
        cacheTtl: 5,
        cacheKey: `activity-snapshot-${targetUrl.search}`,
      },
    });

    if (!upstreamResponse.ok) {
      return new Response(
        JSON.stringify({
          error: `Upstream returned HTTP ${upstreamResponse.status}`,
          current: null,
          devices: [],
        }),
        {
          status: upstreamResponse.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        }
      );
    }

    const body = await upstreamResponse.arrayBuffer();
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/json; charset=utf-8");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    responseHeaders.set("Cache-Control", "public, max-age=5, s-maxage=5");
    responseHeaders.set("X-Proxy-By", "EdgeOne-Serverless");

    return new Response(body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Upstream gateway timeout",
        detail: String(err?.message || err),
        current: null,
        devices: [],
      }),
      {
        status: 504,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});
```

### File: `site-root/middleware.js` (Optional EdgeOne Routing)

```javascript
export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/activity" || url.pathname.startsWith("/api/activity/")) {
    // Route directly to the edge function
    return fetch(new Request(url.toString(), request));
  }
}
```

---

## 2. Nginx Reverse Proxy Configuration

Place the following block inside your Nginx `server { ... }` block for the blog site:

```nginx
location /api/activity {
    # Upstream Worker URL
    proxy_pass https://your-hub.workers.dev/api/activity;

    # SNI and Host header settings (mandatory for Cloudflare upstream)
    proxy_ssl_server_name on;
    proxy_ssl_name your-hub.workers.dev;
    proxy_ssl_protocols TLSv1.2 TLSv1.3;
    proxy_set_header Host your-hub.workers.dev;

    # Connection tuning
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_connect_timeout 5s;
    proxy_read_timeout 10s;

    # Micro-caching (5 seconds)
    proxy_cache_valid 200 5s;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;

    # CORS Headers
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Range' always;

    if ($request_method = 'OPTIONS') {
        return 204;
    }
}
```

---

## 3. Caddy Reverse Proxy Configuration

Add this block to your `Caddyfile`:

```caddy
handle /api/activity* {
    reverse_proxy https://your-hub.workers.dev {
        header_up Host {upstream_hostport}
        header_down Access-Control-Allow-Origin "*"
        header_down Access-Control-Allow-Methods "GET, OPTIONS"
    }
}
```

---

## 4. Frontend Fallback Configuration in `astro.config.mjs`

Configure multiple fallback endpoints in `astro.config.mjs` so the frontend queries the local same-origin proxy first, falling back to the remote hub if the proxy ever fails:

```javascript
import whatImDoing from "@shirone-plugins/what-im-doing";

export default defineConfig({
  integrations: [
    whatImDoing({
      // Primary: Same-origin proxy (/api/activity)
      // Fallback: Direct overseas Worker URL
      endpoint: "/api/activity, https://your-hub.workers.dev/api/activity",
      routeFilter: ["/"], // Empty or ["/"] enables capsule globally
    }),
  ],
});
```
