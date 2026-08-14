(function () {
  const config = window.zzStudioCloudConfig || {};
  const signedUrls = new Map();
  let client = null;
  let session = null;
  let authPromise = null;

  function cloudRequested() { return config.cloudEnabled === true; }
  function cloudConfigured() { return cloudRequested() && Boolean(config.supabaseUrl && config.supabaseAnonKey); }
  function safeName(value, fallback = "file") {
    return String(value || fallback).replace(/[^0-9A-Za-z._\-\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || fallback;
  }
  function localUrl(path) {
    if (!path) return "";
    if (/^(data:|blob:|https?:)/.test(path)) return path;
    return `./${path}`;
  }
  function storagePath(path) { return String(path || "").replace(/^cloud:\/\//, ""); }
  function resolvePath(path) {
    if (!String(path || "").startsWith("cloud://")) return localUrl(path);
    return signedUrls.get(storagePath(path)) || "";
  }
  function dataUrlToBlob(dataUrl) {
    const [head, body] = dataUrl.split(",");
    const mime = head.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
    const bytes = atob(body);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: mime });
  }
  async function loadSdk() {
    if (window.supabase?.createClient) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = resolve;
      script.onerror = () => reject(new Error("登录组件加载失败，请检查网络。"));
      document.head.appendChild(script);
    });
  }
  async function getClient() {
    if (!cloudConfigured()) {
      if (cloudRequested()) throw new Error("云端账号尚未连接，请先完成账号设置。 ");
      return null;
    }
    if (!client) {
      await loadSdk();
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }
  function removeAuthScreen() { document.querySelector(".cloud-auth-screen")?.remove(); }
  function showAccountBadge() {
    if (!session?.user || document.querySelector(".cloud-account-badge")) return;
    const badge = document.createElement("div");
    badge.className = "cloud-account-badge";
    badge.innerHTML = `<span>已同步 · ${session.user.email || "私人账号"}</span><button type="button">退出</button>`;
    badge.querySelector("button").onclick = async () => { await client.auth.signOut(); location.reload(); };
    document.body.appendChild(badge);
  }
  function showLogin() {
    if (document.querySelector(".cloud-auth-screen")) return;
    const screen = document.createElement("div");
    screen.className = "cloud-auth-screen";
    screen.innerHTML = `<section class="cloud-auth-card"><div class="cloud-auth-brand"><img src="./zz-logo-icon.png" alt=""><div><strong>ZZ图片工作台</strong><span>电脑与iPhone同步版</span></div></div><h1>登录后继续制作</h1><p>商品、图片和版式只会显示在你的私人账号中。第一次使用请先点“创建账号”。</p><form class="cloud-auth-form"><label>邮箱<input name="email" type="email" autocomplete="username" required></label><label>密码<input name="password" type="password" minlength="8" autocomplete="current-password" required></label><div class="cloud-auth-actions"><button type="submit" name="action" value="login">登录图片工作台</button><button type="submit" name="action" value="signup" class="secondary">第一次使用，创建账号</button></div></form><p class="cloud-auth-help">这里的账号只用于图片工作台，不是 Supabase 后台登录账号。</p><p class="cloud-auth-status" role="status"></p></section>`;
    document.body.appendChild(screen);
    const form = screen.querySelector("form");
    const status = screen.querySelector(".cloud-auth-status");
    form.onsubmit = async (event) => {
      event.preventDefault();
      const action = event.submitter?.value || "login";
      const values = Object.fromEntries(new FormData(form).entries());
      const email = values.email.trim();
      const password = values.password;
      status.textContent = action === "signup" ? "正在创建私人账号…" : "正在登录…";
      const result = action === "signup"
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      const { data, error } = result;
      if (error) {
        const message = error.message || "";
        if (/failed to fetch|fetch failed|network|load failed/i.test(message)) {
          status.textContent = "账号服务器暂时无法连接。这不是密码错误，请稍后重试或联系管理员恢复同步服务。";
        } else if (action === "signup" && /already|registered|exists/i.test(message)) {
          status.textContent = "这个邮箱已经创建过账号，请直接点“登录图片工作台”。";
        } else if (action === "login") {
          status.textContent = "登录失败。请检查邮箱和密码；如果是第一次使用，请先创建账号。";
        } else {
          status.textContent = `创建失败：${error.message || "请稍后再试"}`;
        }
        return;
      }
      if (!data.session) {
        status.textContent = "账号已创建。请打开邮箱完成确认，然后回到这里登录。";
        return;
      }
      session = data.session;
      removeAuthScreen();
      showAccountBadge();
      document.dispatchEvent(new CustomEvent("zz-cloud-authenticated"));
    };
  }
  async function requireSession() {
    if (!cloudRequested()) return null;
    if (authPromise) return authPromise;
    authPromise = (async () => {
      const supabase = await getClient();
      const { data } = await supabase.auth.getSession();
      session = data.session;
      if (!session) {
        showLogin();
        await new Promise((resolve) => document.addEventListener("zz-cloud-authenticated", resolve, { once: true }));
      }
      showAccountBadge();
      return session;
    })();
    return authPromise;
  }
  function collectCloudPaths(value, paths = new Set()) {
    if (typeof value === "string" && value.startsWith("cloud://")) paths.add(storagePath(value));
    else if (Array.isArray(value)) value.forEach((item) => collectCloudPaths(item, paths));
    else if (value && typeof value === "object") Object.values(value).forEach((item) => collectCloudPaths(item, paths));
    return paths;
  }
  async function signPaths(paths) {
    if (!paths.length) return;
    const supabase = await getClient();
    for (let start = 0; start < paths.length; start += 100) {
      const batch = paths.slice(start, start + 100);
      const { data, error } = await supabase.storage.from(config.storageBucket).createSignedUrls(batch, 3600);
      if (error) throw error;
      data.forEach((item, index) => { if (item.signedUrl) signedUrls.set(batch[index], item.signedUrl); });
    }
  }
  function emptyState() {
    return {
      products: [],
      assets: [
        { id: "logo-main", name: "纯图标Logo（不带微信号）", type: "logo", path: "zz-logo-icon.png", createdAt: new Date().toISOString() },
        { id: "logo-with-wechat", name: "横版Logo（带微信号）", type: "logo", path: "zz-logo-with-wechat.png", createdAt: new Date().toISOString() },
        { id: "watermark-main", name: "纯图标水印（不带微信号）", type: "watermark", path: "zz-watermark-icon.png", createdAt: new Date().toISOString() },
        { id: "watermark-with-wechat", name: "横版水印（带微信号）", type: "watermark", path: "zz-logo-with-wechat.png", createdAt: new Date().toISOString() }
      ],
      snippets: [], copyTemplates: [],
      templates: [
        { id: "wechat-portrait", name: "微信竖版", width: 1080, height: 1440, background: "#f7f2e9", watermarkOpacity: 7 },
        { id: "wechat-square", name: "朋友圈方图", width: 1080, height: 1080, background: "#f7f2e9", watermarkOpacity: 7 },
        { id: "wechat-long", name: "微信长图", width: 1080, height: 1920, background: "#f7f2e9", watermarkOpacity: 7 }
      ],
      exports: [], trash: []
    };
  }
  async function localState() {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取本机资料");
    return response.json();
  }
  async function state() {
    if (!cloudRequested()) return localState();
    await requireSession();
    const { data, error } = await client.from("studio_workspaces").select("state,revision").eq("owner_id", session.user.id).maybeSingle();
    if (error) throw error;
    const next = data?.state || emptyState();
    await signPaths([...collectCloudPaths(next)]);
    next.cloudRevision = Number(data?.revision || 0);
    return next;
  }
  async function save(nextState) {
    if (!cloudRequested()) {
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextState) });
      if (!response.ok) throw new Error("保存失败");
      return { ok: true };
    }
    await requireSession();
    const expectedRevision = Number(nextState.cloudRevision || 0);
    const revision = expectedRevision + 1;
    const cleanState = structuredClone(nextState);
    cleanState.cloudRevision = revision;
    const payload = { owner_id: session.user.id, name: config.workspaceName, state: cleanState, revision, updated_at: new Date().toISOString() };
    if (expectedRevision === 0) {
      const { error } = await client.from("studio_workspaces").insert(payload);
      if (error?.code === "23505") throw new Error("另一台设备已经建立了同步资料。请刷新页面后再继续，避免覆盖。 ");
      if (error) throw error;
    } else {
      const { data, error } = await client.from("studio_workspaces").update(payload).eq("owner_id", session.user.id).eq("revision", expectedRevision).select("revision").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("另一台设备刚刚保存了新内容。请刷新页面后继续，系统没有覆盖对方的修改。 ");
    }
    nextState.cloudRevision = revision;
    return { ok: true };
  }
  async function uploadBlob(blob, name, folder) {
    await requireSession();
    const originalExtension = String(name || "file").split(".").pop().toLowerCase();
    const extension = /^[a-z0-9]{1,8}$/.test(originalExtension) ? originalExtension : "bin";
    // Supabase Storage object keys are safest when limited to portable ASCII.
    // The original Chinese product/export name remains in the product state;
    // only the private internal storage key is replaced with an opaque id.
    const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${session.user.id}/${folder}/${Date.now()}-${uniqueId}.${extension}`;
    const { error } = await client.storage.from(config.storageBucket).upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false });
    if (error) throw error;
    await signPaths([path]);
    return `cloud://${path}`;
  }
  async function upload(file, name, type) {
    if (!cloudRequested()) {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const response = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, name, type }) });
      return response.json();
    }
    return { ok: true, path: await uploadBlob(file, name || file.name, "uploads") };
  }
  async function uploadData(data, name, type) {
    if (!cloudRequested()) {
      const response = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, name, type }) });
      return response.json();
    }
    return { ok: true, path: await uploadBlob(dataUrlToBlob(data), name, "uploads") };
  }
  async function exportPng(data, filename) {
    if (!cloudRequested()) {
      return fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, filename }) }).then((response) => response.json());
    }
    return { ok: true, path: await uploadBlob(dataUrlToBlob(data), `${filename}.png`, "exports") };
  }
  async function publishAppFile(file, path) {
    await requireSession();
    const objectPath = `${session.user.id}/${path}`;
    const { error } = await client.storage.from("studio-app").upload(objectPath, file, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "300",
      upsert: true
    });
    if (error) throw error;
    return { ok: true, path: objectPath };
  }

  window.ZZStudioCloudApi = {
    state, save, upload, uploadData, exportPng, resolvePath,
    publishAppFile,
    isCloud: cloudRequested,
    isConfigured: cloudConfigured,
    requireSession,
    getUser: () => session?.user || null
  };
})();
