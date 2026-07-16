const api = {
  async state() {
    return window.ZZStudioCloudApi.state();
  },
  async save(nextState) {
    return window.ZZStudioCloudApi.save(nextState);
  },
  async upload(file, name, type) {
    return window.ZZStudioCloudApi.upload(file, name, type);
  },
};

const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const BUILTIN_ASSET_IDS = new Set(["logo-main", "logo-with-wechat", "watermark-main", "watermark-with-wechat"]);
const TRASH_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const entityConfig = {
  product: { list: "products", label: "产品" },
  asset: { list: "assets", label: "图片素材" },
  snippet: { list: "snippets", label: "文案片段" },
  copyTemplate: { list: "copyTemplates", label: "文案模板" },
  template: { list: "templates", label: "图片模板" },
  export: { list: "exports", label: "导出记录" },
  productImage: { label: "商品图片" },
};

let state = null;
let currentView = "products";

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function mediaUrl(path) { return window.ZZStudioCloudApi.resolvePath(path); }

function normalizeState() {
  ["products", "assets", "snippets", "copyTemplates", "templates", "exports", "trash"].forEach((key) => {
    if (!Array.isArray(state[key])) state[key] = [];
  });
  const now = Date.now();
  state.trash = state.trash.filter((item) => Number(item.expiresAtMs || now + 1) > now);
}

async function persist(message = "已保存") {
  normalizeState();
  await api.save(state);
  status.textContent = message;
  render();
}

function trashItem(entityType, data, label, extra = {}) {
  const deletedAtMs = Date.now();
  state.trash.push({
    trashId: id("trash"),
    entityType,
    entityId: data?.id || extra.entityId || "",
    label,
    data: structuredClone(data),
    deletedAt: new Date(deletedAtMs).toISOString(),
    deletedAtMs,
    expiresAt: new Date(deletedAtMs + TRASH_LIFETIME).toISOString(),
    expiresAtMs: deletedAtMs + TRASH_LIFETIME,
    ...extra,
  });
}

function setView(view) {
  currentView = view;
  document.querySelectorAll(".side nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  const titles = { products: "产品库", assets: "图片素材", copy: "文案素材", templates: "图片模板", exports: "导出历史", trash: "垃圾箱", backup: "备份与恢复" };
  $("#viewTitle").textContent = titles[view];
  render();
}

function render() {
  if (!state) return;
  normalizeState();
  $("#trashCount").textContent = state.trash.length ? String(state.trash.length) : "";
  if (currentView === "products") renderProducts();
  if (currentView === "assets") renderAssets();
  if (currentView === "copy") renderCopy();
  if (currentView === "templates") renderTemplates();
  if (currentView === "exports") renderExports();
  if (currentView === "trash") renderTrash();
}

function renderProducts() {
  const query = $("#productSearch").value.trim().toLowerCase();
  const category = $("#productCategory").value;
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))];
  $("#productCategory").innerHTML = '<option value="">全部分册</option>' + categories.map((item) => `<option ${item === category ? "selected" : ""}>${esc(item)}</option>`).join("");
  const list = state.products.filter((product) => (!category || product.category === category) && (!query || [product.id, product.brand, product.name, product.specification, product.ageRange, product.productTag].join(" ").toLowerCase().includes(query)));
  $("#productGrid").innerHTML = list.length ? list.map((product) => `
    <article class="product-card">
      <div class="product-thumb"><img src="${esc(mediaUrl(product.image))}" alt=""></div>
      <div class="meta"><span>${esc(product.category)}</span><span>${esc(product.id)}</span></div>
      <h3>${esc(product.name)}</h3>
      <p>${esc(product.brand)} · ${esc(product.specification)}${product.ageRange ? ` · ${esc(product.ageRange)}` : ""} · ¥${Number(product.price || 0)}</p>
      ${product.productTag ? `<div class="product-tag-chip">${esc(product.productTag)}</div>` : ""}
      <div class="card-actions"><a class="edit" href="./card-editor.html?id=${encodeURIComponent(product.id)}&build=editor-v16">打开编辑</a><button data-copy-product="${esc(product.id)}">复制</button><button class="danger" data-delete-product="${esc(product.id)}">删除</button></div>
    </article>`).join("") : "<p>还没有符合条件的产品。</p>";
}

function renderAssets() {
  const labels = { product: "商品主图", logo: "Logo", watermark: "水印", decoration: "装饰元素" };
  $("#assetGrid").innerHTML = state.assets.map((asset) => {
    const protectedAsset = BUILTIN_ASSET_IDS.has(asset.id);
    return `<article class="asset-card"><div class="asset-image"><img src="${esc(mediaUrl(asset.path))}" alt=""></div><div class="meta"><span>${labels[asset.type] || asset.type}</span></div><h3>${esc(asset.name)}</h3><div class="card-actions"><button data-rename-asset="${asset.id}">重命名</button>${protectedAsset ? "" : `<button class="danger" data-delete-asset="${asset.id}">删除</button>`}</div></article>`;
  }).join("");
}

function renderCopy() {
  const cards = [...state.snippets.map((item) => ({ ...item, kind: "snippet" })), ...state.copyTemplates.map((item) => ({ ...item, kind: "copyTemplate" }))];
  $("#copyGrid").innerHTML = cards.map((card) => `<article class="copy-card"><h3>${esc(card.name)} <small>· ${card.kind === "snippet" ? "文案片段" : "整套模板"}</small></h3><p>${esc(card.content)}</p><div class="card-actions"><button data-edit-copy="${card.kind}:${card.id}">编辑</button><button class="danger" data-delete-copy="${card.kind}:${card.id}">删除</button></div></article>`).join("");
}

function renderTemplates() {
  $("#templateGrid").innerHTML = state.templates.map((template) => `<article class="template-card"><strong>${esc(template.name)}</strong><span>${template.width} × ${template.height}</span><div class="card-actions"><button data-edit-template="${template.id}">修改</button><button class="danger" data-delete-template="${template.id}">删除</button></div></article>`).join("");
}

function renderExports() {
  $("#exportGrid").innerHTML = state.exports.length ? [...state.exports].reverse().map((item) => `<article class="export-card"><h3>${esc(item.productCode)} · ${esc(item.brand)} · ${item.width}×${item.height}</h3><p>¥${Number(item.price || 0)} · ${new Date(item.createdAt).toLocaleString("zh-CN")} · <a href="${esc(mediaUrl(item.path))}" target="_blank">查看成品</a></p><div class="card-actions"><button class="danger" data-delete-export="${item.id}">删除记录</button></div></article>`).join("") : "<p>还没有导出记录。</p>";
}

function trashThumbnail(item) {
  const data = item.data || {};
  const path = item.entityType === "product" ? data.image : item.entityType === "asset" ? data.path : item.entityType === "export" ? data.path : item.entityType === "productImage" ? data.path : "";
  return path ? `<img src="${esc(mediaUrl(path))}" alt="">` : `<span class="trash-icon">↩</span>`;
}

function renderTrash() {
  const now = Date.now();
  $("#trashGrid").innerHTML = state.trash.length ? [...state.trash].reverse().map((item) => {
    const remaining = Math.max(1, Math.ceil((Number(item.expiresAtMs) - now) / 86400000));
    const typeLabel = entityConfig[item.entityType]?.label || "内容";
    return `<article class="trash-card"><div class="trash-thumb">${trashThumbnail(item)}</div><div class="trash-copy"><h3>${esc(item.label || "未命名内容")}</h3><p>${typeLabel} · 删除于 ${new Date(item.deletedAt).toLocaleString("zh-CN")}<br>还可恢复 ${remaining} 天</p></div><div class="trash-actions"><button class="restore-item" data-restore-trash="${item.trashId}">恢复</button><button class="purge-item" data-purge-trash="${item.trashId}">永久删除</button></div></article>`;
  }).join("") : "<p>垃圾箱是空的。以后删除的内容会在这里保留 7 天。</p>";
}

function openForm(title, fields, onSave) {
  $("#dialogTitle").textContent = title;
  $("#dialogFields").innerHTML = fields.map((field) => `<label class="dialog-field">${field.label}${field.type === "textarea" ? `<textarea name="${field.name}">${esc(field.value || "")}</textarea>` : `<input name="${field.name}" type="${field.type || "text"}" value="${esc(field.value || "")}">`}</label>`).join("");
  const dialog = $("#formDialog");
  dialog.showModal();
  $("#miniForm").onsubmit = (event) => {
    event.preventDefault();
    onSave(Object.fromEntries(new FormData(event.currentTarget).entries()));
    dialog.close();
  };
}

function restoreTrashRecord(item) {
  if (item.entityType === "productImage") {
    const product = state.products.find((entry) => entry.id === item.data.productId);
    if (!product) return { ok: false, message: "原产品也已被删除，请先恢复产品。" };
    product.images = Array.isArray(product.images) ? product.images : [product.image].filter(Boolean);
    const index = Math.min(Number(item.data.index || 0), product.images.length);
    if (!product.images.includes(item.data.path)) product.images.splice(index, 0, item.data.path);
    product.image = product.images[0] || "";
    return { ok: true };
  }
  const config = entityConfig[item.entityType];
  if (!config?.list) return { ok: false, message: "这条记录无法识别。" };
  const list = state[config.list];
  if (list.some((entry) => entry.id === item.data.id)) return { ok: false, message: "同编号内容已经存在，请先重命名或删除现有内容。" };
  list.push(structuredClone(item.data));
  return { ok: true };
}

document.querySelectorAll(".side nav button").forEach((button) => { button.onclick = () => setView(button.dataset.view); });
$("#productSearch").oninput = renderProducts;
$("#productCategory").onchange = renderProducts;

$("#productGrid").onclick = async (event) => {
  const copy = event.target.closest("[data-copy-product]");
  const del = event.target.closest("[data-delete-product]");
  if (copy) {
    const product = state.products.find((item) => item.id === copy.dataset.copyProduct);
    const next = structuredClone(product);
    next.id = `${product.id}-COPY-${state.products.length + 1}`;
    next.name = `${product.name} 副本`;
    next.createdAt = new Date().toISOString();
    state.products.push(next);
    await persist("产品已复制。");
  }
  if (del && confirm("确认删除这件产品？它会进入垃圾箱，7天内可恢复。")) {
    const product = state.products.find((item) => item.id === del.dataset.deleteProduct);
    trashItem("product", product, `${product.brand} ${product.name}`.trim());
    state.products = state.products.filter((item) => item.id !== product.id);
    await persist("产品已移入垃圾箱，可在7天内恢复。");
  }
};

$("#assetUpload").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const name = $("#assetName").value.trim() || file.name;
  const type = $("#assetType").value;
  status.textContent = "正在上传素材…";
  const output = await api.upload(file, name, type);
  if (!output.ok) { status.textContent = output.error; return; }
  state.assets.push({ id: id("asset"), name, type, path: output.path, createdAt: new Date().toISOString() });
  await persist("素材已上传。");
  event.target.value = "";
};

$("#assetGrid").onclick = async (event) => {
  const rename = event.target.closest("[data-rename-asset]");
  const del = event.target.closest("[data-delete-asset]");
  if (rename) {
    const asset = state.assets.find((item) => item.id === rename.dataset.renameAsset);
    const name = prompt("新素材名称", asset.name);
    if (name) { asset.name = name; await persist("素材已重命名。"); }
  }
  if (del && confirm("删除这条素材记录？它会进入垃圾箱，图片文件不会立即清除。")) {
    const asset = state.assets.find((item) => item.id === del.dataset.deleteAsset);
    trashItem("asset", asset, asset.name);
    state.assets = state.assets.filter((item) => item.id !== asset.id);
    await persist("素材已移入垃圾箱。");
  }
};

$("#addSnippet").onclick = () => openForm("新建文案", [{ label: "名称", name: "name" }, { label: "文案内容", name: "content", type: "textarea" }], async (values) => {
  state.snippets.push({ id: id("snip"), name: values.name, type: "general", content: values.content });
  await persist("文案已保存。");
});

$("#copyGrid").onclick = async (event) => {
  const del = event.target.closest("[data-delete-copy]");
  const edit = event.target.closest("[data-edit-copy]");
  const target = (del || edit)?.dataset[del ? "deleteCopy" : "editCopy"];
  if (!target) return;
  const [kind, key] = target.split(":");
  const property = kind === "snippet" ? "snippets" : "copyTemplates";
  const item = state[property].find((entry) => entry.id === key);
  if (edit) openForm("编辑文案", [{ label: "名称", name: "name", value: item.name }, { label: "文案内容", name: "content", type: "textarea", value: item.content }], async (values) => { Object.assign(item, values); await persist("文案已更新。"); });
  if (del && confirm("删除这条文案？它会进入垃圾箱，7天内可恢复。")) {
    trashItem(kind, item, item.name);
    state[property] = state[property].filter((entry) => entry.id !== key);
    await persist("文案已移入垃圾箱。");
  }
};

$("#addTemplate").onclick = () => openForm("自定义尺寸", [{ label: "模板名称", name: "name" }, { label: "宽度", name: "width", type: "number", value: 1080 }, { label: "高度", name: "height", type: "number", value: 1440 }], async (values) => {
  state.templates.push({ id: id("tpl"), name: values.name, width: Number(values.width), height: Number(values.height), background: "#f7f2e9", watermarkOpacity: 7 });
  await persist("尺寸模板已保存。");
});

$("#templateGrid").onclick = async (event) => {
  const edit = event.target.closest("[data-edit-template]");
  const del = event.target.closest("[data-delete-template]");
  const key = (edit || del)?.dataset[edit ? "editTemplate" : "deleteTemplate"];
  if (!key) return;
  const template = state.templates.find((item) => item.id === key);
  if (edit) openForm("修改尺寸", [{ label: "模板名称", name: "name", value: template.name }, { label: "宽度", name: "width", type: "number", value: template.width }, { label: "高度", name: "height", type: "number", value: template.height }], async (values) => { Object.assign(template, { name: values.name, width: Number(values.width), height: Number(values.height) }); await persist("模板已更新。"); });
  if (del && confirm("删除这个尺寸模板？它会进入垃圾箱，7天内可恢复。")) {
    trashItem("template", template, template.name);
    state.templates = state.templates.filter((item) => item.id !== key);
    await persist("模板已移入垃圾箱。");
  }
};

$("#exportGrid").onclick = async (event) => {
  const del = event.target.closest("[data-delete-export]");
  if (!del || !confirm("删除这条导出记录？成品图片会保留，并可在垃圾箱恢复记录。")) return;
  const item = state.exports.find((entry) => entry.id === del.dataset.deleteExport);
  trashItem("export", item, `${item.brand || "商品"} ${item.productCode || "导出图片"}`);
  state.exports = state.exports.filter((entry) => entry.id !== item.id);
  await persist("导出记录已移入垃圾箱。");
};

$("#trashGrid").onclick = async (event) => {
  const restore = event.target.closest("[data-restore-trash]");
  const purge = event.target.closest("[data-purge-trash]");
  const trashId = (restore || purge)?.dataset[restore ? "restoreTrash" : "purgeTrash"];
  if (!trashId) return;
  const item = state.trash.find((entry) => entry.trashId === trashId);
  if (restore) {
    const result = restoreTrashRecord(item);
    if (!result.ok) { alert(result.message); return; }
    state.trash = state.trash.filter((entry) => entry.trashId !== trashId);
    await persist("内容已恢复。");
  }
  if (purge && confirm("永久删除后将无法从垃圾箱恢复，确认继续？")) {
    state.trash = state.trash.filter((entry) => entry.trashId !== trashId);
    await persist("记录已永久删除。");
  }
};

$("#downloadBackup").onclick = () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  link.download = `zz-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

$("#restoreInput").onchange = async (event) => {
  try {
    const next = JSON.parse(await event.target.files[0].text());
    if (!next.products || !next.templates) throw new Error();
    state = next;
    normalizeState();
    await persist("备份已恢复。");
  } catch {
    status.textContent = "恢复失败：JSON备份格式不正确。";
  }
};

api.state().then((loadedState) => {
  state = loadedState;
  normalizeState();
  status.textContent = `已读取 ${state.products.length} 件产品、${state.assets.length} 个素材。`;
  render();
}).catch((error) => { status.textContent = `无法连接本地数据服务：${error.message}`; });
