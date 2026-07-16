(function () {
  const button = document.querySelector("#startMigration");
  const status = document.querySelector("#migrationStatus");
  const bar = document.querySelector("#migrationBar");
  const api = window.ZZStudioCloudApi;

  function localHost() { return ["localhost", "127.0.0.1", "::1"].includes(location.hostname); }
  function isFilePath(value) { return typeof value === "string" && /^(assets|outputs)\//.test(value); }
  function collect(value, paths = new Set()) {
    if (isFilePath(value)) paths.add(value);
    else if (Array.isArray(value)) value.forEach((item) => collect(item, paths));
    else if (value && typeof value === "object") Object.values(value).forEach((item) => collect(item, paths));
    return paths;
  }
  function replacePaths(value, mapping) {
    if (typeof value === "string") return mapping.get(value) || value;
    if (Array.isArray(value)) return value.map((item) => replacePaths(item, mapping));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePaths(item, mapping)]));
    return value;
  }
  function fileName(path) { return path.split("/").pop() || "image"; }

  if (!localHost()) {
    button.disabled = true;
    status.textContent = "资料搬移需要在原来的电脑上操作。请在电脑本地图片工作台打开此页面。";
    return;
  }
  if (!api.isCloud()) {
    button.disabled = true;
    status.textContent = "同步账号还没有连接。完成账号连接后，这个按钮会自动可用。";
    return;
  }

  button.onclick = async () => {
    button.disabled = true;
    try {
      status.textContent = "正在登录私人账号…";
      await api.requireSession();
      status.textContent = "正在读取电脑中的商品资料…";
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error("无法读取电脑资料，请先启动本地图片工作台。");
      const localState = await response.json();
      const paths = [...collect(localState)];
      const mapping = new Map();
      for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        status.textContent = `正在复制图片 ${index + 1} / ${paths.length}：${fileName(path)}`;
        bar.style.width = `${Math.round((index / Math.max(1, paths.length)) * 88)}%`;
        const fileResponse = await fetch(`./${path}`);
        if (!fileResponse.ok) throw new Error(`找不到图片：${fileName(path)}`);
        const blob = await fileResponse.blob();
        const file = new File([blob], fileName(path), { type: blob.type || "application/octet-stream" });
        const uploaded = await api.upload(file, file.name, "migration");
        if (!uploaded.ok) throw new Error(uploaded.error || "图片复制失败");
        mapping.set(path, uploaded.path);
      }
      status.textContent = "正在保存商品、文案和模板…";
      bar.style.width = "94%";
      const cloudState = replacePaths(localState, mapping);
      cloudState.cloudRevision = 0;
      await api.save(cloudState);
      bar.style.width = "100%";
      status.innerHTML = `复制完成：${localState.products?.length || 0}件商品、${paths.length}个图片文件已经进入同步版。现在可以在电脑和iPhone登录同一个账号使用。`;
    } catch (error) {
      status.textContent = `没有完成：${error.message}`;
      button.disabled = false;
    }
  };
})();
