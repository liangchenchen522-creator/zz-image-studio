(async function () {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#photoCanvas");
  const ctx = canvas.getContext("2d");
  const status = $("#status");
  const controls = ["outputSize","outputName","showLogo","watermarkSelect","opacity","logoSize","showText","watermarkText","textColor","textSize","textShadow","positionMode","angle","spacing","margin"];
  let state;
  let photo = null;
  let photoPath = "";
  let originalName = "";
  let watermark = null;
  let watermarkPath = "";

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function readableError(error) {
    const message = String(error?.message || error || "未知错误");
    if (/bucket not found|nosuchbucket/i.test(message)) return "私人图片仓库暂时无法使用，请刷新页面后重试";
    if (/failed to fetch|fetch failed|network|load failed/i.test(message)) return "网络连接中断，请检查网络后重试";
    if (/payload too large|file size|maximum.*size|too large/i.test(message)) return "图片文件过大，请选择“最长边 2048”或先在手机中缩小图片";
    if (/mime|format|decode|unsupported/i.test(message)) return "当前照片格式暂不兼容，请先在手机中截屏或另存为 JPG/PNG 后再上传";
    return message;
  }

  function safeName(value) {
    return String(value || "实拍图-水印版").replace(/[\\/:*?"<>|]+/g, "-").replace(/^\s+|\s+$/g, "").slice(0, 80) || "实拍图-水印版";
  }

  function imageSource(path) {
    return window.ZZStudioCloudApi.resolvePath(path);
  }

  function loadImage(path) {
    return new Promise((resolve, reject) => {
      if (!path) return resolve(null);
      const image = new Image();
      const source = imageSource(path);
      if (/^https?:/i.test(source)) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片加载失败，请重新上传。"));
      image.src = source;
    });
  }

  async function loadPhotoFile(file) {
    if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name || "")) {
      throw new Error("请选择手机照片、PNG、JPG、WEBP 或 HEIC 图片。");
    }
    if (file.size > 50 * 1024 * 1024) {
      throw new Error("图片超过 50MB，请先在手机相册中截屏或缩小后再上传。");
    }
    const localUrl = URL.createObjectURL(file);
    try {
      return await loadImage(localUrl);
    } catch (error) {
      const isApplePhoto = /\.(heic|heif)$/i.test(file.name || "") || /hei[cf]/i.test(file.type || "");
      if (isApplePhoto) throw new Error("这张照片是 iPhone 高效格式，当前浏览器无法读取。请先在相册中截屏，或另存为 JPG 后上传。");
      throw error;
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  }

  function draftFromControls() {
    return {
      photoPath,
      originalName,
      outputSize: $("#outputSize").value,
      outputName: $("#outputName").value,
      showLogo: $("#showLogo").checked,
      watermarkPath: $("#watermarkSelect").value,
      opacity: Number($("#opacity").value),
      logoSize: Number($("#logoSize").value),
      showText: $("#showText").checked,
      watermarkText: $("#watermarkText").value,
      textColor: $("#textColor").value,
      textSize: Number($("#textSize").value),
      textShadow: $("#textShadow").checked,
      positionMode: $("#positionMode").value,
      angle: Number($("#angle").value),
      spacing: Number($("#spacing").value),
      margin: Number($("#margin").value),
      updatedAt: new Date().toISOString()
    };
  }

  function restoreDraft(draft = {}) {
    controls.forEach((id) => {
      const element = $(`#${id}`);
      if (!(id in draft) || draft[id] == null) return;
      if (element.type === "checkbox") element.checked = Boolean(draft[id]);
      else element.value = draft[id];
    });
    photoPath = draft.photoPath || "";
    originalName = draft.originalName || "";
  }

  function populateWatermarks() {
    const choices = (state.assets || []).filter((asset) => ["logo", "watermark"].includes(asset.type) && asset.path);
    $("#watermarkSelect").innerHTML = choices.map((asset) => `<option value="${String(asset.path).replace(/"/g, "&quot;")}">${asset.name}</option>`).join("");
    const draftPath = state.photoDraft?.watermarkPath;
    if (draftPath && choices.some((asset) => asset.path === draftPath)) $("#watermarkSelect").value = draftPath;
    if (!$("#watermarkSelect").value && choices[0]) $("#watermarkSelect").value = choices[0].path;
    watermarkPath = $("#watermarkSelect").value;
  }

  function outputDimensions() {
    if (!photo) return [0, 0];
    const limit = $("#outputSize").value;
    if (limit === "original") return [photo.naturalWidth, photo.naturalHeight];
    const maxSide = Number(limit);
    const scale = Math.min(1, maxSide / Math.max(photo.naturalWidth, photo.naturalHeight));
    return [Math.round(photo.naturalWidth * scale), Math.round(photo.naturalHeight * scale)];
  }

  function watermarkMetrics() {
    const logoWidth = canvas.width * Number($("#logoSize").value) / 100;
    const logoHeight = watermark ? logoWidth * watermark.naturalHeight / watermark.naturalWidth : 0;
    const fontSize = canvas.width * Number($("#textSize").value) / 100;
    const text = $("#watermarkText").value.trim();
    ctx.font = `700 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const textWidth = text ? ctx.measureText(text).width : 0;
    const gap = watermark && text && $("#showLogo").checked && $("#showText").checked ? fontSize * .42 : 0;
    return { logoWidth, logoHeight, fontSize, text, textWidth, gap, width: Math.max($("#showLogo").checked ? logoWidth : 0, $("#showText").checked ? textWidth : 0), height: ($("#showLogo").checked ? logoHeight : 0) + gap + ($("#showText").checked && text ? fontSize * 1.2 : 0) };
  }

  function drawMark(x, y, metrics) {
    const showLogo = $("#showLogo").checked && watermark;
    const showText = $("#showText").checked && metrics.text;
    if (!showLogo && !showText) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Number($("#angle").value) * Math.PI / 180);
    ctx.globalAlpha = Number($("#opacity").value) / 100;
    let cursorY = -metrics.height / 2;
    if (showLogo) {
      ctx.drawImage(watermark, -metrics.logoWidth / 2, cursorY, metrics.logoWidth, metrics.logoHeight);
      cursorY += metrics.logoHeight + metrics.gap;
    }
    if (showText) {
      ctx.font = `700 ${metrics.fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = $("#textColor").value;
      if ($("#textShadow").checked) {
        ctx.lineWidth = Math.max(2, metrics.fontSize * .1);
        ctx.strokeStyle = $("#textColor").value.toLowerCase() === "#ffffff" ? "#243027" : "#ffffff";
        ctx.strokeText(metrics.text, 0, cursorY);
      }
      ctx.fillText(metrics.text, 0, cursorY);
    }
    ctx.restore();
  }

  function render() {
    ["opacity","logoSize","spacing","margin"].forEach((id) => { $(`#${id}Value`).textContent = `${$("#" + id).value}%`; });
    if (!photo) {
      canvas.hidden = true;
      $("#emptyPreview").hidden = false;
      $("#canvasInfo").textContent = "等待上传照片";
      return;
    }
    const [width, height] = outputDimensions();
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(photo, 0, 0, width, height);
    const metrics = watermarkMetrics();
    const mode = $("#positionMode").value;
    const margin = width * Number($("#margin").value) / 100;
    if (mode === "repeat") {
      const stepX = Math.max(metrics.width * 1.35, width * Number($("#spacing").value) / 100);
      const stepY = Math.max(metrics.height * 1.8, stepX * .72);
      let row = 0;
      for (let y = -stepY / 2; y < height + stepY; y += stepY) {
        const offset = row++ % 2 ? stepX / 2 : 0;
        for (let x = -stepX / 2 + offset; x < width + stepX; x += stepX) drawMark(x, y, metrics);
      }
    } else if (mode === "center") {
      drawMark(width / 2, height / 2, metrics);
    } else if (mode === "corners") {
      const halfW = metrics.width / 2;
      const halfH = metrics.height / 2;
      [[margin + halfW, margin + halfH],[width - margin - halfW, margin + halfH],[margin + halfW, height - margin - halfH],[width - margin - halfW, height - margin - halfH]].forEach(([x,y]) => drawMark(x,y,metrics));
    } else {
      drawMark(width - margin - metrics.width / 2, height - margin - metrics.height / 2, metrics);
    }
    canvas.hidden = false;
    $("#emptyPreview").hidden = true;
    $("#canvasInfo").textContent = `${width} × ${height} PNG`;
  }

  async function refreshWatermark() {
    watermarkPath = $("#watermarkSelect").value;
    try { watermark = await loadImage(watermarkPath); render(); }
    catch (error) { watermark = null; setStatus(error.message, true); render(); }
  }

  async function saveDraft(message = "实拍图草稿已同步保存。") {
    state.photoDraft = draftFromControls();
    await window.ZZStudioCloudApi.save(state);
    setStatus(message);
  }

  function dataUrlToPngBlob(dataUrl) {
    const base64 = dataUrl.split(",")[1] || "";
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
    return new Blob([buffer], { type: "image/png" });
  }

  function downloadPng(data, filename) {
    const link = document.createElement("a");
    link.href = data;
    link.download = `${filename}.png`;
    link.click();
  }

  async function exportPng() {
    if (!photo) return setStatus("请先上传一张实拍照片。", true);
    try {
      render();
      const data = canvas.toDataURL("image/png");
      const filename = safeName($("#outputName").value || originalName.replace(/\.[^.]+$/, "") + "-水印版");
      const imageBlob = dataUrlToPngBlob(data);
      const imageFile = new File([imageBlob], `${filename}.png`, { type: "image/png" });
      let sharePromise = null;
      if (navigator.share && navigator.canShare?.({ files: [imageFile] })) {
        setStatus("系统分享窗口已打开，请选择“存储图像”保存到相册。 ");
        sharePromise = navigator.share({ files: [imageFile], title: filename })
          .then(() => "shared")
          .catch((error) => error?.name === "AbortError" ? "cancelled" : "fallback");
      }
      let archiveError = null;
      try {
        state.photoDraft = draftFromControls();
        const archived = await window.ZZStudioCloudApi.exportPng(data, filename);
        state.exports = state.exports || [];
        state.exports.push({ id: `photo-export-${Date.now()}`, productCode: "实拍图", brand: filename, width: canvas.width, height: canvas.height, price: 0, path: archived.path, createdAt: new Date().toISOString(), type: "photo" });
        await window.ZZStudioCloudApi.save(state);
      } catch (error) {
        archiveError = error;
      }
      const shareResult = sharePromise ? await sharePromise : "fallback";
      if (shareResult === "fallback") downloadPng(data, filename);
      if (archiveError) {
        setStatus(`图片已经生成，但云端归档失败：${readableError(archiveError)}。如果系统分享窗口已打开，仍可选择“存储图像”。`, true);
      } else if (shareResult === "cancelled") setStatus("图片已归档，但你取消了系统分享；需要时可以再次点击导出。 ");
      else if (shareResult === "shared") setStatus("导出完成。如果刚才选择了“存储图像”，现在可以在相册中查看。 ");
      else setStatus(`已下载：${filename}.png；如果未进入相册，请使用 Safari 再试。`);
    } catch (error) {
      setStatus(`导出失败：${readableError(error)}`, true);
    }
  }

  $("#photoInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setStatus("正在读取手机中的照片…");
      photo = await loadPhotoFile(file);
      originalName = file.name;
      if (!$("#outputName").value || $("#outputName").value === "实拍图-水印版") $("#outputName").value = `${file.name.replace(/\.[^.]+$/, "")}-水印版`;
      render();
      setStatus("照片已读取，正在同步保存…");
      let uploaded;
      try {
        uploaded = await window.ZZStudioCloudApi.upload(file, file.name, "photo");
        if (!uploaded.ok) throw new Error(uploaded.error || "上传失败");
      } catch (error) {
        photoPath = "";
        setStatus(`照片已读取，可以继续加水印和导出；但云端同步失败：${readableError(error)}。`, true);
        return;
      }
      photoPath = uploaded.path;
      await saveDraft("照片已上传并同步保存。现在可以调整水印。 ");
    } catch (error) { setStatus(`读取失败：${readableError(error)}`, true); }
    finally { event.target.value = ""; }
  });

  $("#watermarkInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setStatus("正在上传自定义水印…");
      const uploaded = await window.ZZStudioCloudApi.upload(file, file.name, "watermark");
      if (!uploaded.ok) throw new Error(uploaded.error || "上传失败");
      state.assets = state.assets || [];
      state.assets.push({ id: `watermark-${Date.now()}`, name: file.name.replace(/\.[^.]+$/, ""), type: "watermark", path: uploaded.path, createdAt: new Date().toISOString() });
      populateWatermarks();
      $("#watermarkSelect").value = uploaded.path;
      await refreshWatermark();
      await saveDraft("自定义水印已上传并保存到素材库。 ");
    } catch (error) { setStatus(`水印上传失败：${readableError(error)}`, true); }
  });

  controls.forEach((id) => $(`#${id}`).addEventListener("input", () => id === "watermarkSelect" ? refreshWatermark() : render()));
  $("#saveDraft").addEventListener("click", () => saveDraft().catch((error) => setStatus(error.message, true)));
  $("#exportPng").addEventListener("click", exportPng);
  $("#clearPhoto").addEventListener("click", async () => { photo = null; photoPath = ""; originalName = ""; render(); await saveDraft("当前实拍照片已从草稿中清空，原素材仍保留在私人云端。 "); });
  $("#fitPreview").addEventListener("click", () => $("#photoCanvas").scrollIntoView({ block: "center", behavior: "smooth" }));

  try {
    state = await window.ZZStudioCloudApi.state();
    populateWatermarks();
    restoreDraft(state.photoDraft || {});
    populateWatermarks();
    await refreshWatermark();
    if (photoPath) photo = await loadImage(photoPath);
    render();
    setStatus(photo ? "已恢复上次的实拍图草稿。" : "可以上传实拍照片开始制作。 ");
  } catch (error) {
    setStatus(`读取资料失败：${readableError(error)}。请刷新页面后重试。`, true);
  }
})();
