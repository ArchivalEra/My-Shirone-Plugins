/**
 * What-Im-Doing Fleet Provisioning UI Template
 */

export function renderAdminHtml() {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>What-Im-Doing Fleet Manager</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0284c7;
      --success: #4ade80;
      --danger: #f87171;
      --code-bg: #0b1120;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans", sans-serif;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    header { text-align: center; margin-bottom: 24px; width: 100%; max-width: 760px; }
    h1 { font-size: 1.5rem; margin-bottom: 6px; }
    p.subtitle { color: var(--text-muted); font-size: 0.875rem; }
    .container { width: 100%; max-width: 760px; display: flex; flex-direction: column; gap: 20px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .card h2 { font-size: 1.1rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
    .form-group { margin-bottom: 14px; }
    label { display: block; font-size: 0.825rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
    input, select {
      width: 100%;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      color: var(--text);
      font-size: 0.9rem;
      outline: none;
    }
    input:focus, select:focus { border-color: var(--primary); }
    .btn {
      background: var(--primary);
      color: #000;
      font-weight: 600;
      font-size: 0.875rem;
      padding: 10px 18px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn:hover { background: var(--primary-hover); color: #fff; }
    .btn-danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
      padding: 4px 10px;
      font-size: 0.75rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-danger:hover { background: var(--danger); color: #000; }
    .btn-copy {
      background: #334155;
      color: #f8fafc;
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      float: right;
    }
    .btn-copy:hover { background: var(--primary); color: #000; }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8rem;
      overflow-x: auto;
      color: #38bdf8;
      margin-top: 8px;
    }
    .device-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .device-info { display: flex; flex-direction: column; gap: 2px; }
    .device-title { font-weight: 600; font-size: 0.9rem; }
    .device-meta { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; }
    .tag {
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
      background: #1e293b;
      border: 1px solid var(--border);
      margin-left: 6px;
    }
  </style>
</head>
<body>
  <header>
    <h1>What-Im-Doing Fleet Manager</h1>
    <p class="subtitle">Protected by Cloudflare Zero Trust Access · Cloudflare D1 Backend</p>
    <div style="margin-top: 10px; display: inline-flex; align-items: center; gap: 8px; font-size: 0.8rem; background: var(--card-bg); padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);">
      <span>🔑 Admin Key:</span>
      <input type="password" id="adminKey" placeholder="Optional (if ADMIN_KEY is set)" style="width: 220px; padding: 4px 8px; font-size: 0.8rem;" onchange="saveAdminKey()" />
    </div>
  </header>

  <div class="container">
    <div class="card">
      <h2>➕ Register New Device</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label>Device ID (Slug: a-z0-9_-)</label>
          <input type="text" id="devId" placeholder="e.g. debian-desktop" />
        </div>
        <div class="form-group">
          <label>Device Name (Human readable)</label>
          <input type="text" id="devName" placeholder="e.g. Debian 13 开发工作站" />
        </div>
      </div>

      <div class="form-group">
        <label>Device Type</label>
        <select id="devType">
          <option value="desktop">🖥️ Desktop (台式主机)</option>
          <option value="laptop">💻 Laptop (便携笔记本)</option>
          <option value="server">🖧 Server / Gateway (服务器 / 网关)</option>
          <option value="mobile">📱 Mobile (移动终端)</option>
          <option value="other">📦 Other</option>
        </select>
      </div>

      <button class="btn" onclick="registerDevice()">Generate Device Token & Enroll</button>

      <div id="provisionResult" style="margin-top: 16px; display: none;">
        <label>Client Configuration File (Save to <code>~/.config/what-im-doing.json</code>):</label>
        <button class="btn-copy" onclick="copyConfig()">Copy Config</button>
        <pre id="configCode"></pre>
      </div>
    </div>

    <div class="card">
      <h2>📋 Enrolled Fleet in D1 (<span id="fleetCount">0</span>)</h2>
      <div id="deviceList">Loading fleet...</div>
    </div>

    <div class="card">
      <h2>🌐 Live <code>GET /api/activity</code> Raw Snapshot Output</h2>
      <button class="btn-copy" onclick="loadSnapshot()">Refresh Snapshot</button>
      <pre id="snapshotOutput">Loading snapshot...</pre>
    </div>
  </div>

  <script>
    function getAdminHeaders(extra = {}) {
      const headers = { ...extra };
      const key = localStorage.getItem("wid_admin_key") || "";
      if (key) {
        headers["x-admin-key"] = key;
        headers["Authorization"] = "Bearer " + key;
      }
      return headers;
    }

    function saveAdminKey() {
      const val = document.getElementById("adminKey").value.trim();
      localStorage.setItem("wid_admin_key", val);
      loadFleet();
      loadSnapshot();
    }

    async function loadFleet() {
      try {
        const res = await fetch("/admin/devices", { headers: getAdminHeaders() });
        const data = await res.json();
        const listEl = document.getElementById("deviceList");
        listEl.innerHTML = "";
        const devices = data.devices || [];
        document.getElementById("fleetCount").innerText = devices.length;

        if (devices.length === 0) {
          listEl.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>No devices enrolled yet.</p>";
          return;
        }

        const now = Date.now();
        for (const dev of devices) {
          const isOffline = (now - dev.last_seen) > 120000;
          const div = document.createElement("div");
          div.className = "device-row";
          div.innerHTML = \`
            <div class="device-info">
              <div class="device-title">
                \${isOffline ? "⚪" : "🟢"} \${dev.name}
                <span class="tag">\${dev.type}</span>
                <span class="tag" style="color: \${isOffline ? 'var(--text-muted)' : 'var(--success)'};">\${isOffline ? 'OFFLINE' : 'ACTIVE'}</span>
              </div>
              <div class="device-meta">
                ID: \${dev.id} | Token: \${dev.token.slice(0, 10)}... | Last seen: \${new Date(dev.last_seen).toLocaleString()}
              </div>
            </div>
            <button class="btn-danger" onclick="deleteDevice('\${dev.id}')">Revoke</button>
          \`;
          listEl.appendChild(div);
        }
      } catch (err) {
        document.getElementById("deviceList").innerText = "Error loading fleet: " + err.message;
      }
    }

    async function loadSnapshot() {
      try {
        const res = await fetch("/api/activity");
        const data = await res.json();
        document.getElementById("snapshotOutput").innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById("snapshotOutput").innerText = "Error loading snapshot: " + err.message;
      }
    }

    async function registerDevice() {
      const id = document.getElementById("devId").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const name = document.getElementById("devName").value.trim();
      const type = document.getElementById("devType").value;

      if (!id || !name) {
        alert("Please provide both Device ID and Name");
        return;
      }

      const res = await fetch("/admin/devices", {
        method: "POST",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id, name, type })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to register");
        return;
      }

      const clientConfig = {
        endpoint: window.location.origin + "/api/activity/report",
        deviceId: id,
        deviceName: name,
        deviceType: type,
        token: data.device.token
      };

      document.getElementById("configCode").innerText = JSON.stringify(clientConfig, null, 2);
      document.getElementById("provisionResult").style.display = "block";
      loadFleet();
      loadSnapshot();
    }

    async function deleteDevice(id) {
      if (!confirm("Revoke and remove device '" + id + "'?")) return;
      const res = await fetch("/admin/devices/" + id, { method: "DELETE", headers: getAdminHeaders() });
      if (res.ok) {
        loadFleet();
        loadSnapshot();
      } else {
        alert("Failed to delete device");
      }
    }

    function copyConfig() {
      const text = document.getElementById("configCode").innerText;
      navigator.clipboard.writeText(text).then(() => alert("Copied config to clipboard!"));
    }

    document.getElementById("adminKey").value = localStorage.getItem("wid_admin_key") || "";
    loadFleet();
    loadSnapshot();
  </script>
</body>
</html>`;
}
