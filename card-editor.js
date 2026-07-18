(async function () {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#cardCanvas");
  const ctx = canvas.getContext("2d");
  const status = $("#editorStatus");
  const params = new URLSearchParams(location.search);
  const requestedId = params.get("id");
  const isNew = params.has("new");

  const state = await window.ZZStudioCloudApi.state()
    .catch((error) => {
      status.textContent = error.message;
      throw error;
    });

  const BUILTIN_SETTINGS = {
    imageScale: 100,
    imageY: 0,
    imageGap: 18,
    imageLayout: "auto",
    watermarkOpacity: 7,
    watermarkSize: 84,
    logoSize: 76,
    categorySize: 22,
    brandSize: 25,
    tagSize: 20,
    ageSize: 20,
    safetySize: 18,
    originalSize: 19,
    priceSize: 58,
    priceMetaSize: 18,
    footerSize: 20,
    decorationSize: 110,
    titleSize: 47,
    descriptionSize: 23,
    titleColor: "#28322b",
    textColor: "#566058",
    textAlign: "left",
    lineHeight: 1.7,
    showLogo: true,
    showWatermark: true,
    showOriginalName: true,
    showSafetyNote: true,
    showProductTag: true,
    showAgeRange: true,
    showPrice: true,
    showFooter: true,
    showDecoration: false,
    showDivider: true,
    dividerColor: "#e6ded1",
    dividerWidth: 100,
    dividerThickness: 2,
    enableSnapping: true,
    showCenterGuides: true,
    showSafeGuides: false,
    snapThreshold: 12,
    backgroundColor: "#f7f2e9",
    logoPath: "zz-logo-icon.png",
    watermarkPath: "zz-watermark-icon.png",
    decorationPath: "",
  };

  function layoutFromRecord(record = {}) {
    return {
      version: 1,
      templateId: record.templateId || "wechat-portrait",
      canvasWidth: record.canvasWidth || 1080,
      canvasHeight: record.canvasHeight || 1440,
      settings: { ...BUILTIN_SETTINGS, ...(record.settings || {}) },
      elementOffsets: structuredClone(record.elementOffsets || {}),
      savedAt: new Date().toISOString(),
    };
  }

  if (!state.editorDefaults) {
    const latestExport = [...(state.exports || [])].reverse().find((item) => state.products.some((productItem) => productItem.id === item.productId));
    const sourceProduct = latestExport
      ? state.products.find((productItem) => productItem.id === latestExport.productId)
      : [...state.products].reverse().find((productItem) => productItem.settings);
    state.editorDefaults = layoutFromRecord(sourceProduct || {});
    await window.ZZStudioCloudApi.save(state);
  }

  const inheritedLayout = state.editorDefaults || layoutFromRecord();
  const defaults = {
    id: `ITEM-${Date.now().toString().slice(-6)}`,
    category: "商品分册",
    brand: "",
    specification: "",
    ageRange: "",
    productTag: "",
    name: "新商品",
    originalName: "",
    price: 0,
    updatedAt: new Date().toISOString().slice(0, 10),
    description: "",
    safetyNote: "",
    image: "",
    images: [],
    templateId: inheritedLayout.templateId || "wechat-portrait",
    canvasWidth: inheritedLayout.canvasWidth || 1080,
    canvasHeight: inheritedLayout.canvasHeight || 1440,
    elementOffsets: structuredClone(inheritedLayout.elementOffsets || {}),
    settings: { ...BUILTIN_SETTINGS, ...(inheritedLayout.settings || {}) },
  };

  let product = isNew
    ? structuredClone(defaults)
    : state.products.find((item) => item.id === requestedId) || structuredClone(state.products[0] || defaults);
  let originalId = product.id;
  let saveTimer = null;
  let drag = null;
  let draggedImageIndex = null;
  let hitboxes = {};
  let viewTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  let activeGuides = { vertical: null, horizontal: null };
  let selectedElementKey = null;
  let editorCanvasZoom = 100;
  let editorZoomMode = "fit";
  const canvasPointers = new Map();
  let pinchGesture = null;

  const elementLabels = {
    logo: "左上角Logo",
    category: "右上角分类",
    image: "商品图片区",
    title: "品牌、规格与商品标题",
    productTag: "商品标签",
    ageRange: "适用年龄",
    original: "原文名称",
    divider: "中间分隔线",
    description: "具体介绍",
    safetyNote: "安全提示",
    price: "参考价格",
    footer: "底部询价条",
    decoration: "装饰元素",
  };

  const fieldIds = [
    "category", "productCode", "brand", "specification", "ageRange", "productTag", "productName", "originalName",
    "price", "updatedAt", "description", "safetyNote", "imageScale", "imageY", "imageGap",
    "imageLayout", "watermarkOpacity", "watermarkSize", "titleSize", "descriptionSize",
    "logoSize", "categorySize", "brandSize", "tagSize", "ageSize", "safetySize", "originalSize", "priceSize", "priceMetaSize",
    "footerSize", "decorationSize",
    "titleColor", "textColor", "textAlign", "lineHeight", "canvasWidth", "canvasHeight",
    "backgroundColor", "showLogo", "showWatermark", "showOriginalName", "showSafetyNote", "showProductTag", "showAgeRange", "showPrice",
    "showFooter", "showDecoration", "showDivider", "dividerColor", "dividerWidth",
    "dividerThickness", "enableSnapping", "showCenterGuides", "showSafeGuides", "snapThreshold",
  ];
  const fields = Object.fromEntries(fieldIds.map((id) => [id, $(`#${id}`)]));
  const imageCache = new Map();

  function value(id) {
    const element = fields[id];
    return element.type === "checkbox" ? element.checked : element.value.trim();
  }

  function safeName(input, fallback = "product") {
    return String(input ?? "")
      .replace(/[\\/:*?"<>|\s]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || fallback;
  }

  function exportFileName() {
    const brandName = safeName(value("brand"), "");
    const productName = safeName(value("productName"), "");
    return [brandName, productName].filter(Boolean).join("-") || safeName(value("productCode"), "商品图片");
  }

  function imageUrl(path) {
    return window.ZZStudioCloudApi.resolvePath(path);
  }

  function getImage(path) {
    if (!path) return null;
    if (!imageCache.has(path)) {
      const image = new Image();
      const source = imageUrl(path);
      // Supabase signed URLs are on a different origin. Request them in CORS
      // mode before assigning src so the canvas remains exportable.
      if (/^https?:/i.test(source)) image.crossOrigin = "anonymous";
      image.onload = () => render();
      image.src = source;
      imageCache.set(path, image);
    }
    return imageCache.get(path);
  }

  function normalizeProductImages() {
    const saved = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    if (!saved.length && product.image) saved.push(product.image);
    product.images = saved;
    product.image = product.images[0] || "";
  }

  function currentSettings() {
    return {
      imageScale: Number(value("imageScale")),
      imageY: Number(value("imageY")),
      imageGap: Number(value("imageGap")),
      imageLayout: value("imageLayout"),
      watermarkOpacity: Number(value("watermarkOpacity")),
      watermarkSize: Number(value("watermarkSize")),
      logoSize: Number(value("logoSize")),
      categorySize: Number(value("categorySize")),
      brandSize: Number(value("brandSize")),
      tagSize: Number(value("tagSize")),
      ageSize: Number(value("ageSize")),
      safetySize: Number(value("safetySize")),
      originalSize: Number(value("originalSize")),
      priceSize: Number(value("priceSize")),
      priceMetaSize: Number(value("priceMetaSize")),
      footerSize: Number(value("footerSize")),
      decorationSize: Number(value("decorationSize")),
      titleSize: Number(value("titleSize")),
      descriptionSize: Number(value("descriptionSize")),
      titleColor: value("titleColor"),
      textColor: value("textColor"),
      textAlign: value("textAlign"),
      lineHeight: Number(value("lineHeight")),
      showLogo: value("showLogo"),
      showWatermark: value("showWatermark"),
      showOriginalName: value("showOriginalName"),
      showSafetyNote: value("showSafetyNote"),
      showProductTag: value("showProductTag"),
      showAgeRange: value("showAgeRange"),
      showPrice: value("showPrice"),
      showFooter: value("showFooter"),
      showDecoration: value("showDecoration"),
      showDivider: value("showDivider"),
      dividerColor: value("dividerColor"),
      dividerWidth: Number(value("dividerWidth")),
      dividerThickness: Number(value("dividerThickness")),
      enableSnapping: value("enableSnapping"),
      showCenterGuides: value("showCenterGuides"),
      showSafeGuides: value("showSafeGuides"),
      snapThreshold: Number(value("snapThreshold")),
      backgroundColor: value("backgroundColor"),
      logoPath: $("#logoAssetSelect")?.value || "zz-logo-icon.png",
      watermarkPath: $("#watermarkAssetSelect")?.value || "zz-watermark-icon.png",
      decorationPath: $("#decorationAssetSelect")?.value || "",
    };
  }

  function applyProduct() {
    normalizeProductImages();
    fields.category.value = product.category || "";
    fields.productCode.value = product.id || "";
    fields.brand.value = product.brand || "";
    fields.specification.value = product.specification || "";
    fields.ageRange.value = product.ageRange || "";
    fields.productTag.value = product.productTag || "";
    fields.productName.value = product.name || "";
    fields.originalName.value = product.originalName || "";
    fields.price.value = product.price || 0;
    fields.updatedAt.value = product.updatedAt || "";
    fields.description.value = product.description || "";
    fields.safetyNote.value = product.safetyNote || "";

    const saved = { ...BUILTIN_SETTINGS, ...(product.settings || {}) };

    Object.entries(saved).forEach(([key, setting]) => {
      if (!fields[key]) return;
      if (fields[key].type === "checkbox") fields[key].checked = Boolean(setting);
      else fields[key].value = setting;
    });

    const template = state.templates.find((item) => item.id === product.templateId) || state.templates[0];
    fields.canvasWidth.value = product.canvasWidth || template?.width || 1080;
    fields.canvasHeight.value = product.canvasHeight || template?.height || 1440;
    if ($("#logoAssetSelect")) {
      $("#logoAssetSelect").value = saved.logoPath;
      if (!$("#logoAssetSelect").value) $("#logoAssetSelect").value = "zz-logo-icon.png";
    }
    if ($("#watermarkAssetSelect")) {
      $("#watermarkAssetSelect").value = saved.watermarkPath;
      if (!$("#watermarkAssetSelect").value) $("#watermarkAssetSelect").value = "zz-watermark-icon.png";
    }
    if ($("#decorationAssetSelect")) $("#decorationAssetSelect").value = saved.decorationPath;
    renderImageList();
  }

  function syncProduct() {
    normalizeProductImages();
    product = {
      ...product,
      id: value("productCode"),
      category: value("category"),
      brand: value("brand"),
      specification: value("specification"),
      ageRange: value("ageRange"),
      productTag: value("productTag"),
      name: value("productName"),
      originalName: value("originalName"),
      price: Number(value("price") || 0),
      updatedAt: value("updatedAt"),
      description: value("description"),
      safetyNote: value("safetyNote"),
      image: product.images[0] || "",
      images: [...product.images],
      canvasWidth: Math.max(480, Number(value("canvasWidth")) || 1080),
      canvasHeight: Math.max(480, Number(value("canvasHeight")) || 1440),
      settings: currentSettings(),
      elementOffsets: product.elementOffsets || {},
      updatedAtIso: new Date().toISOString(),
    };
  }

  function upsertCurrentProduct() {
    const index = state.products.findIndex((item) => item.id === originalId);
    if (index >= 0) state.products[index] = product;
    else state.products.push(product);
    originalId = product.id;
  }

  async function saveCurrentLayoutAsDefault(message = "当前完整布局已设为新产品默认版式。") {
    syncProduct();
    upsertCurrentProduct();
    state.editorDefaults = layoutFromRecord(product);
    await window.ZZStudioCloudApi.save(state);
    status.textContent = message;
  }

  function restoreSavedDefaultLayout() {
    const layout = state.editorDefaults || layoutFromRecord();
    product.templateId = layout.templateId || "wechat-portrait";
    product.canvasWidth = layout.canvasWidth || 1080;
    product.canvasHeight = layout.canvasHeight || 1440;
    product.elementOffsets = structuredClone(layout.elementOffsets || {});
    product.settings = { ...BUILTIN_SETTINGS, ...(layout.settings || {}) };
    selectedElementKey = null;
    activeGuides = { vertical: null, horizontal: null };
    applyProduct();
    render();
    if (editorZoomMode === "fit") requestAnimationFrame(fitEditorCanvasToViewport);
    scheduleSave();
  }

  async function saveProduct(message = "草稿已自动保存。") {
    syncProduct();
    upsertCurrentProduct();
    await window.ZZStudioCloudApi.save(state);
    status.textContent = message;
    history.replaceState(null, "", `?id=${encodeURIComponent(product.id)}`);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    status.textContent = "正在自动保存…";
    saveTimer = setTimeout(() => saveProduct(), 650);
  }

  function rounded(x, y, width, height, radius, fill, stroke = "", lineWidth = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function font(size, weight = 400, family = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif') {
    ctx.font = `${weight} ${size}px ${family}`;
  }

  function wrap(text, maxWidth, maxLines = 99) {
    const lines = [];
    const paragraphs = String(text || "").replace(/\r/g, "").split("\n");
    for (const paragraph of paragraphs) {
      if (lines.length >= maxLines) break;
      if (!paragraph) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const character of paragraph) {
        if (ctx.measureText(current + character).width <= maxWidth) current += character;
        else {
          if (current) lines.push(current);
          current = character;
          if (lines.length >= maxLines) break;
        }
      }
      if (current && lines.length < maxLines) lines.push(current);
    }
    return lines;
  }

  function offset(key) {
    return product.elementOffsets?.[key] || { x: 0, y: 0 };
  }

  function box(key, x, y, width, height) {
    const saved = offset(key);
    const result = { x: x + saved.x, y: y + saved.y, w: width, h: height };
    hitboxes[key] = result;
    return result;
  }

  function contain(image, x, y, width, height, scale = 1, offsetY = 0) {
    if (!image?.complete || !image.naturalWidth) return;
    const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight) * scale;
    const drawWidth = image.naturalWidth * ratio;
    const drawHeight = image.naturalHeight * ratio;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2 + offsetY, drawWidth, drawHeight);
  }

  function guideColor(type) {
    if (type === "center") return "#00a8c6";
    if (type === "safe") return "#e0a122";
    return "#d842a5";
  }

  function drawGuide(axis, valueAt, type, strong = false, label = "") {
    ctx.save();
    ctx.strokeStyle = guideColor(type);
    ctx.lineWidth = strong ? 2.5 : 1.4;
    ctx.globalAlpha = strong ? 0.95 : 0.38;
    ctx.setLineDash(strong ? [10, 5] : [7, 8]);
    ctx.beginPath();
    if (axis === "vertical") {
      ctx.moveTo(valueAt, 34);
      ctx.lineTo(valueAt, 1406);
    } else {
      ctx.moveTo(42, valueAt);
      ctx.lineTo(1038, valueAt);
    }
    ctx.stroke();
    if (strong && label) {
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      font(14, 700);
      const labelWidth = ctx.measureText(label).width + 20;
      const labelX = axis === "vertical" ? Math.min(valueAt + 8, 1030 - labelWidth) : 50;
      const labelY = axis === "vertical" ? 44 : Math.max(42, valueAt - 31);
      rounded(labelX, labelY, labelWidth, 25, 8, guideColor(type));
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(label, labelX + 10, labelY + 18);
    }
    ctx.restore();
  }

  function drawEditorGuides() {
    if (value("showCenterGuides")) {
      drawGuide("vertical", 540, "center", false);
      drawGuide("horizontal", 720, "center", false);
    }
    if (value("showSafeGuides")) {
      [78, 1002].forEach((position) => drawGuide("vertical", position, "safe", false));
      [68, 1362].forEach((position) => drawGuide("horizontal", position, "safe", false));
    }
    if (activeGuides.vertical) drawGuide("vertical", activeGuides.vertical.value, activeGuides.vertical.type, true, activeGuides.vertical.label);
    if (activeGuides.horizontal) drawGuide("horizontal", activeGuides.horizontal.value, activeGuides.horizontal.type, true, activeGuides.horizontal.label);
    if (selectedElementKey && hitboxes[selectedElementKey]) {
      const selected = hitboxes[selectedElementKey];
      ctx.save();
      ctx.strokeStyle = "#00a8c6";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(selected.x, selected.y, selected.w, selected.h);
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#00a8c6";
      [[selected.x, selected.y], [selected.x + selected.w, selected.y], [selected.x, selected.y + selected.h], [selected.x + selected.w, selected.y + selected.h]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  function guideTargets(movingKey) {
    const x = [];
    const y = [];
    if (value("showCenterGuides")) {
      x.push({ value: 540, type: "center", label: "画布左右居中" });
      y.push({ value: 720, type: "center", label: "画布上下居中" });
    }
    if (value("showSafeGuides")) {
      x.push({ value: 78, type: "safe", label: "左安全边距" }, { value: 1002, type: "safe", label: "右安全边距" });
      y.push({ value: 68, type: "safe", label: "上安全边距" }, { value: 1362, type: "safe", label: "下安全边距" });
    }
    Object.entries(hitboxes).forEach(([key, target]) => {
      if (key === movingKey || key.startsWith("photo-")) return;
      x.push(
        { value: target.x, type: "align", label: "左边缘对齐" },
        { value: target.x + target.w / 2, type: "align", label: "中心对齐" },
        { value: target.x + target.w, type: "align", label: "右边缘对齐" },
      );
      y.push(
        { value: target.y, type: "align", label: "上边缘对齐" },
        { value: target.y + target.h / 2, type: "align", label: "中线对齐" },
        { value: target.y + target.h, type: "align", label: "下边缘对齐" },
      );
    });
    return { x, y };
  }

  function snappedDragOffset(point) {
    const rawDeltaX = point.x - drag.startX;
    const rawDeltaY = point.y - drag.startY;
    activeGuides = { vertical: null, horizontal: null };
    if (!value("enableSnapping")) return { x: drag.base.x + rawDeltaX, y: drag.base.y + rawDeltaY };

    const threshold = Number(value("snapThreshold"));
    const proposed = {
      x: drag.startBox.x + rawDeltaX,
      y: drag.startBox.y + rawDeltaY,
      w: drag.startBox.w,
      h: drag.startBox.h,
    };
    const xAnchors = [proposed.x, proposed.x + proposed.w / 2, proposed.x + proposed.w];
    const yAnchors = [proposed.y, proposed.y + proposed.h / 2, proposed.y + proposed.h];
    let bestX = null;
    let bestY = null;
    drag.targets.x.forEach((target) => xAnchors.forEach((anchor) => {
      const difference = target.value - anchor;
      if (Math.abs(difference) <= threshold && (!bestX || Math.abs(difference) < Math.abs(bestX.difference))) bestX = { difference, target };
    }));
    drag.targets.y.forEach((target) => yAnchors.forEach((anchor) => {
      const difference = target.value - anchor;
      if (Math.abs(difference) <= threshold && (!bestY || Math.abs(difference) < Math.abs(bestY.difference))) bestY = { difference, target };
    }));
    if (bestX) activeGuides.vertical = bestX.target;
    if (bestY) activeGuides.horizontal = bestY.target;
    return {
      x: drag.base.x + rawDeltaX + (bestX?.difference || 0),
      y: drag.base.y + rawDeltaY + (bestY?.difference || 0),
    };
  }

  function imageSlots(layout, count, x, y, width, height, gap) {
    const safeCount = Math.max(1, count);
    if (layout === "single") return [{ x, y, w: width, h: height }];
    if (layout === "two-columns") {
      return [
        { x, y, w: (width - gap) / 2, h: height },
        { x: x + (width + gap) / 2, y, w: (width - gap) / 2, h: height },
      ];
    }
    if (layout === "two-rows") {
      return [
        { x, y, w: width, h: (height - gap) / 2 },
        { x, y: y + (height + gap) / 2, w: width, h: (height - gap) / 2 },
      ];
    }
    if (layout === "four-grid") {
      const cellWidth = (width - gap) / 2;
      const cellHeight = (height - gap) / 2;
      return [0, 1, 2, 3].map((index) => ({
        x: x + (index % 2) * (cellWidth + gap),
        y: y + Math.floor(index / 2) * (cellHeight + gap),
        w: cellWidth,
        h: cellHeight,
      }));
    }
    if (safeCount === 1) return [{ x, y, w: width, h: height }];
    if (safeCount === 2) return imageSlots("two-columns", 2, x, y, width, height, gap);
    if (safeCount === 3) {
      const leftWidth = (width - gap) * 0.58;
      const rightWidth = width - gap - leftWidth;
      const rightHeight = (height - gap) / 2;
      return [
        { x, y, w: leftWidth, h: height },
        { x: x + leftWidth + gap, y, w: rightWidth, h: rightHeight },
        { x: x + leftWidth + gap, y: y + rightHeight + gap, w: rightWidth, h: rightHeight },
      ];
    }
    const columns = safeCount <= 4 ? 2 : Math.ceil(Math.sqrt(safeCount));
    const rows = Math.ceil(safeCount / columns);
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const cellHeight = (height - gap * (rows - 1)) / rows;
    return Array.from({ length: safeCount }, (_, index) => ({
      x: x + (index % columns) * (cellWidth + gap),
      y: y + Math.floor(index / columns) * (cellHeight + gap),
      w: cellWidth,
      h: cellHeight,
    }));
  }

  function drawProductImages(container, showEditorControls) {
    const paths = product.images || [];
    const layout = value("imageLayout");
    const capacity = layout === "single" ? 1 : layout.startsWith("two-") ? 2 : layout === "four-grid" ? 4 : paths.length;
    const visiblePaths = paths.slice(0, capacity || paths.length);
    const gap = Number(value("imageGap"));
    const inner = { x: container.x + 28, y: container.y + 24, w: container.w - 56, h: container.h - 48 };
    const slots = imageSlots(layout, visiblePaths.length || 1, inner.x, inner.y, inner.w, inner.h, gap);

    if (!visiblePaths.length) {
      ctx.fillStyle = "#a0a49e";
      ctx.textAlign = "center";
      font(24, 600);
      ctx.fillText("请上传商品图片", container.x + container.w / 2, container.y + container.h / 2);
      ctx.textAlign = "left";
      return;
    }

    visiblePaths.forEach((path, index) => {
      const slot = slots[index];
      if (!slot) return;
      rounded(slot.x, slot.y, slot.w, slot.h, 18, "#ffffff", "#eee8dd", 1.5);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(slot.x + 2, slot.y + 2, slot.w - 4, slot.h - 4, 16);
      ctx.clip();
      contain(getImage(path), slot.x + 10, slot.y + 10, slot.w - 20, slot.h - 20, Number(value("imageScale")) / 100, Number(value("imageY")));
      ctx.restore();
      if (showEditorControls) {
        hitboxes[`photo-${index}`] = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
        rounded(slot.x + 12, slot.y + 12, 56, 44, 14, "rgba(64,89,67,.92)");
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        font(22, 800);
        ctx.fillText(String(index + 1), slot.x + 40, slot.y + 42);
        const removeBox = { x: slot.x + slot.w - 60, y: slot.y + 12, w: 48, h: 48 };
        hitboxes[`photo-remove-${index}`] = removeBox;
        rounded(removeBox.x, removeBox.y, removeBox.w, removeBox.h, 16, "rgba(154,77,62,.94)");
        ctx.fillStyle = "#fff";
        font(27, 700);
        ctx.fillText("×", removeBox.x + removeBox.w / 2, removeBox.y + 33);
        ctx.textAlign = "left";
      }
    });
  }

  function render(showEditorControls = true) {
    syncProduct();
    const width = Math.max(480, Number(value("canvasWidth")) || 1080);
    const height = Math.max(480, Number(value("canvasHeight")) || 1440);
    const background = value("backgroundColor") || "#f7f2e9";
    canvas.width = width;
    canvas.height = height;

    // The whole 1080×1440 design is scaled with one factor. This preserves every
    // image, logo, type block and corner radius without horizontal/vertical distortion.
    const scale = Math.min(width / 1080, height / 1440);
    const offsetX = (width - 1080 * scale) / 2;
    const offsetY = (height - 1440 * scale) / 2;
    viewTransform = { scale, offsetX, offsetY };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    hitboxes = {};

    ctx.fillStyle = "#fffaf2";
    ctx.beginPath();
    ctx.ellipse(80, 80, 360, 300, 0, 0, Math.PI * 2);
    ctx.fill();
    rounded(42, 34, 996, 1372, 38, "#fffdf8", "#e6ded1", 2);

    if (value("showLogo")) {
      const logoImage = getImage($("#logoAssetSelect").value);
      const logoSize = Number(value("logoSize"));
      const logoAspect = logoImage?.naturalWidth && logoImage?.naturalHeight ? logoImage.naturalWidth / logoImage.naturalHeight : 1;
      const logoWidth = logoAspect > 1.4 ? Math.min(logoSize * logoAspect, 420) : logoSize;
      const logoBox = box("logo", 78, 68, logoWidth, logoSize);
      contain(logoImage, logoBox.x, logoBox.y, logoBox.w, logoBox.h, 1);
    }

    ctx.fillStyle = "#405943";
    ctx.textAlign = "right";
    font(Number(value("categorySize")), 700);
    const categoryText = `私享选品 · ${value("category") || "商品分册"}`;
    const categoryWidth = Math.min(600, ctx.measureText(categoryText).width + 12);
    const categoryBox = box("category", 1002 - categoryWidth, 78, categoryWidth, 44);
    ctx.fillText(categoryText, categoryBox.x + categoryBox.w, categoryBox.y + 34);
    ctx.textAlign = "left";

    const imageBox = box("image", 78, 180, 924, 510);
    rounded(imageBox.x, imageBox.y, imageBox.w, imageBox.h, 30, "#fff", "#e6ded1", 2);
    drawProductImages(imageBox, showEditorControls === true);

    if (value("showProductTag") && value("productTag")) {
      const tagText = value("productTag");
      const tagSize = Number(value("tagSize"));
      font(tagSize, 700);
      const tagWidth = Math.min(420, ctx.measureText(tagText).width + 38);
      const tagHeight = tagSize + 24;
      const tagBox = box("productTag", 78, 699, tagWidth, tagHeight);
      rounded(tagBox.x, tagBox.y, tagBox.w, tagBox.h, tagBox.h / 2, "#c9774f");
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(tagText, tagBox.x + tagBox.w / 2, tagBox.y + tagBox.h / 2 + tagSize * 0.35);
      ctx.textAlign = "left";
    }

    const titleBox = box("title", 78, 735, 900, 190);
    ctx.fillStyle = "#405943";
    font(Number(value("brandSize")), 700);
    ctx.fillText(`${value("brand") || "品牌"}  ·  ${value("specification") || "规格"}`, titleBox.x, titleBox.y + 17);
    if (value("showAgeRange") && value("ageRange")) {
      const ageText = `适用年龄 · ${value("ageRange")}`;
      font(Number(value("ageSize")), 700);
      const ageWidth = Math.min(430, ctx.measureText(ageText).width + 34);
      const ageHeight = Number(value("ageSize")) + 24;
      const ageBox = box("ageRange", 1002 - ageWidth, 715, ageWidth, ageHeight);
      rounded(ageBox.x, ageBox.y, ageBox.w, ageBox.h, ageBox.h / 2, "#edf2ea", "#c7d5c5", 1.5);
      ctx.fillStyle = "#405943";
      ctx.textAlign = "center";
      ctx.fillText(ageText, ageBox.x + ageBox.w / 2, ageBox.y + ageBox.h / 2 + Number(value("ageSize")) * 0.35);
      ctx.textAlign = "left";
    }
    ctx.fillStyle = value("titleColor");
    font(Number(value("titleSize")), 700);
    const titles = wrap(value("productName"), 900, 2);
    titles.forEach((line, index) => ctx.fillText(line, titleBox.x, titleBox.y + 85 + index * (Number(value("titleSize")) + 14)));

    const infoTop = titles.length > 1 ? 930 : 878;
    if (value("showOriginalName")) {
      ctx.fillStyle = "#7f837d";
      font(Number(value("originalSize")));
      const originalBox = box("original", 78, infoTop - 29, 900, 38);
      ctx.fillText(value("originalName"), originalBox.x, originalBox.y + 29);
    }
    const dividerY = infoTop + 42;
    if (value("showDivider")) {
      const dividerWidth = 924 * Number(value("dividerWidth")) / 100;
      const dividerThickness = Number(value("dividerThickness"));
      const dividerBox = box("divider", 540 - dividerWidth / 2, dividerY - 16, dividerWidth, Math.max(32, dividerThickness + 20));
      ctx.strokeStyle = value("dividerColor");
      ctx.lineWidth = dividerThickness;
      ctx.beginPath();
      ctx.moveTo(dividerBox.x, dividerBox.y + dividerBox.h / 2);
      ctx.lineTo(dividerBox.x + dividerBox.w, dividerBox.y + dividerBox.h / 2);
      ctx.stroke();
    }

    const showPrice = value("showPrice");
    const descriptionBottom = value("showFooter") ? 1245 : 1360;
    const hasSafetyNote = value("showSafetyNote") && Boolean(value("safetyNote"));
    const safetySize = Number(value("safetySize"));
    const safetyStep = safetySize * 1.45;
    font(safetySize, 500);
    const allSafetyLines = hasSafetyNote ? wrap(value("safetyNote"), 864, 99) : [];
    const safetyLines = allSafetyLines.slice(0, 4);
    const safetyHeight = hasSafetyNote ? Math.min(190, 54 + safetyLines.length * safetyStep) : 0;
    const safetyBaseY = descriptionBottom - safetyHeight;
    const descriptionLimit = hasSafetyNote ? safetyBaseY - 18 : descriptionBottom;
    const descriptionStartY = dividerY + 25;
    const descriptionBox = box("description", 78, descriptionStartY, showPrice ? 640 : 924, Math.max(40, descriptionLimit - descriptionStartY));
    ctx.fillStyle = value("textColor");
    font(Number(value("descriptionSize")));
    const description = value("description");
    const descriptionStep = Number(value("descriptionSize")) * Number(value("lineHeight"));
    const descriptionMaxLines = Math.max(1, Math.floor((descriptionLimit - (descriptionStartY + 25)) / descriptionStep) + 1);
    const allDescriptionLines = wrap(description, descriptionBox.w, 99);
    const descriptionLines = allDescriptionLines.slice(0, descriptionMaxLines);
    const alignment = value("textAlign");
    const anchor = alignment === "center" ? descriptionBox.x + descriptionBox.w / 2 : alignment === "right" ? descriptionBox.x + descriptionBox.w : descriptionBox.x;
    ctx.textAlign = alignment;
    descriptionLines.forEach((line, index) => ctx.fillText(line, anchor, descriptionBox.y + 25 + index * descriptionStep));
    ctx.textAlign = "left";

    if (hasSafetyNote) {
      const safetyBox = box("safetyNote", 78, safetyBaseY, 924, safetyHeight);
      rounded(safetyBox.x, safetyBox.y, safetyBox.w, safetyBox.h, 18, "#fff7e9", "#e6c796", 1.5);
      ctx.fillStyle = "#9a642a";
      font(15, 800);
      ctx.fillText("安全提示", safetyBox.x + 22, safetyBox.y + 25);
      ctx.fillStyle = "#5e5548";
      font(safetySize, 500);
      safetyLines.forEach((line, index) => ctx.fillText(line, safetyBox.x + 22, safetyBox.y + 51 + index * safetyStep));
    }

    if (showPrice) {
      const priceBox = box("price", 750, dividerY + 20, 252, 170);
      ctx.textAlign = "right";
      ctx.fillStyle = "#7c8079";
      font(Number(value("priceMetaSize")));
      ctx.fillText("人民币参考价", priceBox.x + priceBox.w, priceBox.y + 33);
      ctx.fillStyle = "#28322b";
      font(Number(value("priceSize")), 700, '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif');
      ctx.fillText(`￥${Number(value("price") || 0).toFixed(0)}`, priceBox.x + priceBox.w, priceBox.y + 100);
      ctx.fillStyle = "#85877f";
      font(Math.max(12, Number(value("priceMetaSize")) - 1));
      ctx.fillText(value("updatedAt") ? `${value("updatedAt")} 更新` : "价格以询价为准", priceBox.x + priceBox.w, priceBox.y + 137);
      ctx.textAlign = "left";
    }

    if (value("showFooter")) {
      const footerBox = box("footer", 78, 1272, 924, 90);
      rounded(footerBox.x, footerBox.y, footerBox.w, footerBox.h, 22, "#405943");
      ctx.fillStyle = "#fff";
      font(Number(value("footerSize")) + 7, 700, "ui-monospace,monospace");
      ctx.fillText(value("productCode"), footerBox.x + 28, footerBox.y + 56);
      ctx.textAlign = "right";
      ctx.fillStyle = "#e3ebe1";
      font(Number(value("footerSize")));
      ctx.fillText("微信询价：商品编号＋数量", footerBox.x + footerBox.w - 28, footerBox.y + 56);
      ctx.textAlign = "left";
    }

    const decorationPath = $("#decorationAssetSelect").value;
    if (value("showDecoration") && decorationPath) {
      const decorationSize = Number(value("decorationSize"));
      const decorationBox = box("decoration", 970 - decorationSize, 95, decorationSize, decorationSize);
      contain(getImage(decorationPath), decorationBox.x, decorationBox.y, decorationBox.w, decorationBox.h);
    }

    const watermarkPath = $("#watermarkAssetSelect").value;
    const watermarkImage = getImage(watermarkPath);
    if (value("showWatermark") && watermarkImage?.complete && watermarkImage.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = Number(value("watermarkOpacity")) / 100;
      const size = Number(value("watermarkSize"));
      const watermarkAspect = watermarkImage.naturalWidth / watermarkImage.naturalHeight;
      const watermarkWidth = watermarkAspect > 1.4 ? Math.min(size * watermarkAspect, 360) : size;
      const watermarkHeight = size;
      const watermarkStepX = watermarkAspect > 1.4 ? 430 : 300;
      for (let y = 250; y < 1240; y += 225) {
        for (let x = (y / 225) % 2 ? 125 : 270; x < 960; x += watermarkStepX) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-Math.PI / 12);
          ctx.drawImage(watermarkImage, -watermarkWidth / 2, -watermarkHeight / 2, watermarkWidth, watermarkHeight);
          ctx.restore();
        }
      }
      ctx.restore();
    }
    if (showEditorControls === true) drawEditorGuides();
    ctx.restore();

    $("#imageScaleOutput").value = `${value("imageScale")}%`;
    $("#imageYOutput").value = value("imageY");
    $("#imageGapOutput").value = value("imageGap");
    $("#watermarkOpacityOutput").value = `${value("watermarkOpacity")}%`;
    $("#watermarkSizeOutput").value = value("watermarkSize");
    $("#titleSizeOutput").value = value("titleSize");
    $("#descriptionSizeOutput").value = value("descriptionSize");
    $("#logoSizeOutput").value = value("logoSize");
    $("#categorySizeOutput").value = value("categorySize");
    $("#brandSizeOutput").value = value("brandSize");
    $("#tagSizeOutput").value = value("tagSize");
    $("#ageSizeOutput").value = value("ageSize");
    $("#safetySizeOutput").value = value("safetySize");
    $("#originalSizeOutput").value = value("originalSize");
    $("#priceSizeOutput").value = value("priceSize");
    $("#priceMetaSizeOutput").value = value("priceMetaSize");
    $("#footerSizeOutput").value = value("footerSize");
    $("#decorationSizeOutput").value = value("decorationSize");
    $("#dividerWidthOutput").value = `${value("dividerWidth")}%`;
    $("#dividerThicknessOutput").value = value("dividerThickness");
    $("#snapThresholdOutput").value = value("snapThreshold");
    $("#descriptionCount").textContent = `${value("description").length} / 建议220字以内`;
    $(".preview-head strong").textContent = `${width} × ${height} PNG · 等比例`;

    const layout = value("imageLayout");
    const layoutCapacity = layout === "single" ? 1 : layout.startsWith("two-") ? 2 : layout === "four-grid" ? 4 : Infinity;
    if (product.images.length > layoutCapacity) {
      status.textContent = `当前排版显示前 ${layoutCapacity} 张图片；可调整顺序或选择“自动排版”。`;
    } else if (allDescriptionLines.length > descriptionMaxLines || allSafetyLines.length > 4) {
      status.textContent = "提示：介绍或安全提示超出版面，请减小字号、缩短文案或隐藏其他板块。";
    } else if (selectedElementKey && elementLabels[selectedElementKey]) {
      status.textContent = `已选择：${elementLabels[selectedElementKey]}。可使用键盘方向键精细移动，Shift＋方向键移动10像素。`;
    } else {
      status.textContent = "所有内容按同一比例缩放，不会因画布尺寸改变而压扁。";
    }
  }

  function assetName(path, index) {
    return state.assets.find((asset) => asset.path === path)?.name || path.split("/").pop() || `商品图片 ${index + 1}`;
  }

  function renderImageList() {
    normalizeProductImages();
    const list = $("#productImageList");
    if (!product.images.length) {
      list.innerHTML = '<div class="product-image-empty">尚未添加图片。上传后可以在这里拖动排序。</div>';
      return;
    }
    list.innerHTML = product.images.map((path, index) => `
      <div class="product-image-item" draggable="true" data-index="${index}">
        <img src="${imageUrl(path)}" alt="商品图片 ${index + 1}" />
        <span class="product-image-copy"><strong>${index + 1}. ${assetName(path, index)}</strong><small>${index === 0 ? "首图" : "可拖动调整顺序"}</small></span>
        <span class="product-image-actions">
          <button type="button" class="drag-handle" data-index="${index}" aria-label="按住拖动排序">按住拖动</button>
          <button type="button" class="move-up" data-index="${index}" aria-label="前移" ${index === 0 ? "disabled" : ""}>前移</button>
          <button type="button" class="move-down" data-index="${index}" aria-label="后移" ${index === product.images.length - 1 ? "disabled" : ""}>后移</button>
          <button type="button" class="remove-image" data-index="${index}" aria-label="删除图片">删除</button>
        </span>
      </div>`).join("");

    list.querySelectorAll(".product-image-item").forEach((item) => {
      item.addEventListener("dragstart", () => {
        draggedImageIndex = Number(item.dataset.index);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        draggedImageIndex = null;
        list.querySelectorAll(".product-image-item").forEach((row) => row.classList.remove("dragging", "drag-over"));
      });
      item.addEventListener("dragover", (event) => {
        event.preventDefault();
        item.classList.add("drag-over");
      });
      item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        const targetIndex = Number(item.dataset.index);
        if (draggedImageIndex === null || draggedImageIndex === targetIndex) return;
        const [moved] = product.images.splice(draggedImageIndex, 1);
        product.images.splice(targetIndex, 0, moved);
        product.image = product.images[0];
        renderImageList();
        render();
        scheduleSave();
      });
      const handle = item.querySelector(".drag-handle");
      let touchSort = null;
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        touchSort = { index: Number(item.dataset.index), startY: event.clientY };
        handle.setPointerCapture(event.pointerId);
        item.classList.add("dragging");
      });
      handle.addEventListener("pointermove", (event) => {
        if (!touchSort) return;
        event.preventDefault();
        item.style.transform = `translateY(${event.clientY - touchSort.startY}px)`;
        item.style.position = "relative";
        item.style.zIndex = "5";
      });
      const finishTouchSort = (event) => {
        if (!touchSort) return;
        item.style.pointerEvents = "none";
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".product-image-item");
        item.style.pointerEvents = "";
        const targetIndex = target ? Number(target.dataset.index) : touchSort.index;
        const fromIndex = touchSort.index;
        touchSort = null;
        item.style.transform = "";
        item.style.position = "";
        item.style.zIndex = "";
        item.classList.remove("dragging");
        if (Number.isInteger(targetIndex) && targetIndex !== fromIndex) {
          const [moved] = product.images.splice(fromIndex, 1);
          product.images.splice(targetIndex, 0, moved);
          product.image = product.images[0];
          renderImageList();
          render();
          scheduleSave();
        }
      };
      handle.addEventListener("pointerup", finishTouchSort);
      handle.addEventListener("pointercancel", finishTouchSort);
    });
  }

  function moveProductImage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= product.images.length) return;
    [product.images[index], product.images[target]] = [product.images[target], product.images[index]];
    product.image = product.images[0];
    renderImageList();
    render();
    scheduleSave();
  }

  function removeProductImage(index) {
    const path = product.images[index];
    if (!path || !confirm("删除这张商品图片？它会进入垃圾箱，7天内可以恢复。")) return;
    if (!Array.isArray(state.trash)) state.trash = [];
    const deletedAtMs = Date.now();
    state.trash.push({
      trashId: `trash-${deletedAtMs.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      entityType: "productImage",
      entityId: product.id,
      label: assetName(path, index),
      data: { productId: product.id, path, index },
      deletedAt: new Date(deletedAtMs).toISOString(),
      deletedAtMs,
      expiresAt: new Date(deletedAtMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAtMs: deletedAtMs + 7 * 24 * 60 * 60 * 1000,
    });
    product.images.splice(index, 1);
    product.image = product.images[0] || "";
    renderImageList();
    render();
    scheduleSave();
  }

  function populateLibraries() {
    $("#templateSelect").innerHTML = state.templates.map((template) => `<option value="${template.id}">${template.name} · ${template.width}×${template.height}</option>`).join("");
    $("#templateSelect").value = product.templateId || state.templates[0]?.id;
    const productAssets = state.assets.filter((asset) => asset.type === "product");
    $("#productAssetSelect").innerHTML = '<option value="">选择一张图片加入当前排版</option>' + productAssets.map((asset) => `<option value="${asset.path}">${asset.name}</option>`).join("");
    const logoAssets = state.assets.filter((asset) => asset.type === "logo");
    const watermarkAssets = state.assets.filter((asset) => asset.type === "watermark");
    $("#logoAssetSelect").innerHTML = logoAssets.map((asset) => `<option value="${asset.path}">${asset.name}</option>`).join("");
    $("#watermarkAssetSelect").innerHTML = watermarkAssets.map((asset) => `<option value="${asset.path}">${asset.name}</option>`).join("");
    $("#decorationAssetSelect").innerHTML = '<option value="">尚未选择</option>' + state.assets.filter((asset) => asset.type === "decoration").map((asset) => `<option value="${asset.path}">${asset.name}</option>`).join("");
    $("#snippetSelect").innerHTML = '<option value="">选择后插入到介绍末尾</option>' + state.snippets.map((snippet) => `<option value="${snippet.id}">${snippet.name}</option>`).join("");
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadProductImages(files) {
    const uploaded = [];
    status.textContent = `正在上传 ${files.length} 张图片…`;
    for (const file of files) {
      const data = await fileToDataUrl(file);
      const output = await window.ZZStudioCloudApi.uploadData(data, file.name, "product");
      if (!output.ok) throw new Error(output.error);
      uploaded.push(output.path);
      state.assets.push({ id: `asset-${Date.now()}-${uploaded.length}`, name: file.name, type: "product", path: output.path, createdAt: new Date().toISOString() });
    }
    const onlyPlaceholder = product.images.length === 0 || (product.images.length === 1 && product.images[0] === "zz-logo-icon.png" && isNew);
    product.images = onlyPlaceholder ? uploaded : [...product.images, ...uploaded];
    product.image = product.images[0];
    populateLibraries();
    renderImageList();
    render();
    await saveProduct(`${files.length} 张商品图片已上传并保存，可拖动调整顺序。`);
  }

  function cleanCanvasData() {
    render(false);
    const data = canvas.toDataURL("image/png");
    render(true);
    return data;
  }

  function setEditorCanvasZoom(nextZoom, mode = "manual") {
    const zoom = Math.max(25, Math.min(180, Math.round(Number(nextZoom) || 100)));
    const viewport = $("#canvasScroll");
    const frame = $("#canvasFrame");
    const centerX = viewport.scrollWidth ? (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth : 0.5;
    const centerY = viewport.scrollHeight ? (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight : 0.5;
    editorCanvasZoom = zoom;
    editorZoomMode = mode;
    $("#editorCanvasZoom").value = zoom;
    $("#editorCanvasZoomOutput").value = `${zoom}%`;
    frame.style.width = `${zoom}%`;
    frame.style.marginInline = zoom <= 100 ? "auto" : "0";
    $("#editorZoomFit").classList.toggle("active", mode === "fit");
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, centerX * viewport.scrollWidth - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, centerY * viewport.scrollHeight - viewport.clientHeight / 2);
    });
  }

  function fitEditorCanvasToViewport() {
    const viewport = $("#canvasScroll");
    if (!viewport.clientWidth || !viewport.clientHeight || !canvas.width || !canvas.height) return;
    const availableWidth = Math.max(160, viewport.clientWidth - 38);
    const availableHeight = Math.max(160, viewport.clientHeight - 38);
    const fullWidthHeight = availableWidth * canvas.height / canvas.width + 28;
    const fitZoom = Math.min(100, availableHeight / fullWidthHeight * 100);
    setEditorCanvasZoom(Math.max(25, fitZoom), "fit");
  }

  function openCleanPreview() {
    const data = cleanCanvasData();
    $("#cleanPreviewImage").src = data;
    $("#previewDialogTitle").textContent = value("productName") || "未命名商品";
    $("#previewDimensions").textContent = `${canvas.width} × ${canvas.height} PNG · 不含编辑辅助线`;
    const defaultZoom = window.matchMedia("(max-width: 640px)").matches ? 92 : 70;
    $("#previewZoom").value = defaultZoom;
    $("#previewZoomOutput").value = `${defaultZoom}%`;
    $("#cleanPreviewImage").style.width = `${defaultZoom}%`;
    const dialog = $("#previewDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeCleanPreview() {
    const dialog = $("#previewDialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
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
    const data = cleanCanvasData();
    syncProduct();
    upsertCurrentProduct();
    state.editorDefaults = layoutFromRecord(product);
    const filename = exportFileName();
    // Keep the share request inside the original click gesture. iPhone Safari
    // will reject navigator.share after an awaited fetch, even though export succeeded.
    const imageBlob = dataUrlToPngBlob(data);
    const imageFile = new File([imageBlob], `${filename}.png`, { type: "image/png" });
    let sharePromise = null;
    if (navigator.share && navigator.canShare?.({ files: [imageFile] })) {
      sharePromise = navigator.share({ files: [imageFile], title: filename })
        .then(() => "shared")
        .catch((error) => error?.name === "AbortError" ? "cancelled" : "fallback");
    }
    const output = await window.ZZStudioCloudApi.exportPng(data, filename);
    if (!output.ok) throw new Error(output.error);
    state.exports.push({ id: `exp-${Date.now()}`, productId: product.id, productCode: product.id, brand: product.brand, price: product.price, width: canvas.width, height: canvas.height, path: output.path, createdAt: new Date().toISOString() });
    await window.ZZStudioCloudApi.save(state);
    const shareResult = sharePromise ? await sharePromise : "fallback";
    if (shareResult === "fallback") downloadPng(data, filename);
    status.textContent = `PNG已导出并归档：${output.path}`;
  }

  fieldIds.forEach((id) => fields[id].addEventListener("input", () => {
    render();
    if (editorZoomMode === "fit" && (id === "canvasWidth" || id === "canvasHeight")) requestAnimationFrame(fitEditorCanvasToViewport);
    scheduleSave();
  }));

  $("#templateSelect").onchange = () => {
    const template = state.templates.find((item) => item.id === $("#templateSelect").value);
    if (!template) return;
    product.templateId = template.id;
    fields.canvasWidth.value = template.width;
    fields.canvasHeight.value = template.height;
    fields.backgroundColor.value = template.background || "#f7f2e9";
    fields.watermarkOpacity.value = template.watermarkOpacity || 7;
    render();
    if (editorZoomMode === "fit") requestAnimationFrame(fitEditorCanvasToViewport);
    scheduleSave();
  };

  $("#productImageInput").onchange = (event) => {
    const files = [...(event.target.files || [])];
    if (files.length) uploadProductImages(files).catch((error) => { status.textContent = error.message; });
    event.target.value = "";
  };

  $("#productAssetSelect").onchange = (event) => {
    if (!event.target.value) return;
    const onlyPlaceholder = product.images.length === 0 || (product.images.length === 1 && product.images[0] === "zz-logo-icon.png" && isNew);
    product.images = onlyPlaceholder ? [event.target.value] : [...product.images, event.target.value];
    product.image = product.images[0];
    event.target.value = "";
    renderImageList();
    render();
    scheduleSave();
  };

  $("#productImageList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    const index = Number(button.dataset.index);
    if (button.classList.contains("move-up")) moveProductImage(index, -1);
    if (button.classList.contains("move-down")) moveProductImage(index, 1);
    if (button.classList.contains("remove-image")) removeProductImage(index);
  });

  ["logoAssetSelect", "watermarkAssetSelect"].forEach((id) => {
    $(`#${id}`).onchange = () => { render(); scheduleSave(); };
  });
  $("#decorationAssetSelect").onchange = (event) => {
    fields.showDecoration.checked = Boolean(event.target.value);
    render();
    scheduleSave();
  };
  $("#snippetSelect").onchange = (event) => {
    const snippet = state.snippets.find((item) => item.id === event.target.value);
    if (snippet) {
      fields.description.value = `${fields.description.value.trim()} ${snippet.content}`.trim();
      render();
      scheduleSave();
    }
    event.target.value = "";
  };

  $("#saveButton").onclick = () => saveProduct("产品草稿已保存到项目文件。");
  $("#saveDefaultLayout").onclick = () => saveCurrentLayoutAsDefault().catch((error) => { status.textContent = `保存默认版式失败：${error.message}`; });
  $("#previewButton").onclick = openCleanPreview;
  $("#exportButton").onclick = () => exportPng().catch((error) => { status.textContent = `导出失败：${error.message}`; });
  $("#closePreviewButton").onclick = closeCleanPreview;
  $("#closePreviewFooter").onclick = closeCleanPreview;
  $("#previewZoom").oninput = (event) => {
    const zoom = Number(event.target.value);
    $("#previewZoomOutput").value = `${zoom}%`;
    $("#cleanPreviewImage").style.width = `${zoom}%`;
  };
  $("#exportFromPreview").onclick = () => exportPng()
    .then(closeCleanPreview)
    .catch((error) => { status.textContent = `导出失败：${error.message}`; });
  $("#previewDialog").addEventListener("click", (event) => {
    if (event.target === $("#previewDialog")) closeCleanPreview();
  });
  $("#editorCanvasZoom").oninput = (event) => setEditorCanvasZoom(event.target.value, "manual");
  $("#editorZoomOut").onclick = () => setEditorCanvasZoom(editorCanvasZoom - 10, "manual");
  $("#editorZoomIn").onclick = () => setEditorCanvasZoom(editorCanvasZoom + 10, "manual");
  $("#editorZoomFit").onclick = fitEditorCanvasToViewport;
  window.addEventListener("resize", () => {
    if (editorZoomMode === "fit") requestAnimationFrame(fitEditorCanvasToViewport);
  });
  $("#resetButton").onclick = () => {
    restoreSavedDefaultLayout();
  };

  function pointerToDesign(event) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) * canvas.width / rect.width;
    const canvasY = (event.clientY - rect.top) * canvas.height / rect.height;
    return {
      x: (canvasX - viewTransform.offsetX) / viewTransform.scale,
      y: (canvasY - viewTransform.offsetY) / viewTransform.scale,
    };
  }

  canvas.addEventListener("pointerdown", (event) => {
    canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (canvasPointers.size === 2) {
      const [first, second] = [...canvasPointers.values()];
      pinchGesture = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: editorCanvasZoom };
      drag = null;
      activeGuides = { vertical: null, horizontal: null };
      canvas.classList.remove("dragging");
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    canvas.focus({ preventScroll: true });
    const point = pointerToDesign(event);
    const key = Object.keys(hitboxes).reverse().find((name) => {
      const hitbox = hitboxes[name];
      return point.x >= hitbox.x && point.x <= hitbox.x + hitbox.w && point.y >= hitbox.y && point.y <= hitbox.y + hitbox.h;
    });
    if (!key) {
      selectedElementKey = null;
      activeGuides = { vertical: null, horizontal: null };
      render();
      return;
    }
    if (key.startsWith("photo-remove-")) {
      selectedElementKey = "image";
      removeProductImage(Number(key.replace("photo-remove-", "")));
      return;
    }
    if (/^photo-\d+$/.test(key)) {
      selectedElementKey = "image";
      drag = { mode: "photo", currentIndex: Number(key.replace("photo-", "")) };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("dragging");
      return;
    }
    selectedElementKey = key;
    activeGuides = { vertical: null, horizontal: null };
    drag = {
      key,
      startX: point.x,
      startY: point.y,
      base: { ...offset(key) },
      startBox: { ...hitboxes[key] },
      targets: guideTargets(key),
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (canvasPointers.has(event.pointerId)) canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchGesture && canvasPointers.size >= 2) {
      const [first, second] = [...canvasPointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      setEditorCanvasZoom(pinchGesture.zoom * distance / Math.max(1, pinchGesture.distance), "manual");
      return;
    }
    if (!drag) return;
    const point = pointerToDesign(event);
    if (drag.mode === "photo") {
      const targetKey = Object.keys(hitboxes).find((name) => {
        if (!/^photo-\d+$/.test(name)) return false;
        const hitbox = hitboxes[name];
        return point.x >= hitbox.x && point.x <= hitbox.x + hitbox.w && point.y >= hitbox.y && point.y <= hitbox.y + hitbox.h;
      });
      if (targetKey) {
        const targetIndex = Number(targetKey.replace("photo-", ""));
        if (targetIndex !== drag.currentIndex) {
          const [moved] = product.images.splice(drag.currentIndex, 1);
          product.images.splice(targetIndex, 0, moved);
          product.image = product.images[0];
          drag.currentIndex = targetIndex;
          render();
        }
      }
      return;
    }
    product.elementOffsets[drag.key] = snappedDragOffset(point);
    render();
  });

  canvas.addEventListener("pointerup", (event) => {
    canvasPointers.delete(event.pointerId);
    if (pinchGesture) {
      if (canvasPointers.size < 2) pinchGesture = null;
      return;
    }
    if (!drag) return;
    const wasPhotoDrag = drag.mode === "photo";
    drag = null;
    activeGuides = { vertical: null, horizontal: null };
    canvas.classList.remove("dragging");
    if (wasPhotoDrag) renderImageList();
    render();
    scheduleSave();
  });

  canvas.addEventListener("pointercancel", (event) => {
    canvasPointers.delete(event.pointerId);
    if (canvasPointers.size < 2) pinchGesture = null;
    if (!drag) return;
    drag = null;
    activeGuides = { vertical: null, horizontal: null };
    canvas.classList.remove("dragging");
    render();
  });

  document.addEventListener("keydown", (event) => {
    if (!selectedElementKey || !hitboxes[selectedElementKey]) return;
    if (!/^Arrow(Up|Down|Left|Right)$/.test(event.key)) return;
    const active = document.activeElement;
    if (active && (active.matches("input, textarea, select, button") || active.isContentEditable)) return;
    if ($("#previewDialog").open) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const saved = { ...offset(selectedElementKey) };
    if (event.key === "ArrowLeft") saved.x -= step;
    if (event.key === "ArrowRight") saved.x += step;
    if (event.key === "ArrowUp") saved.y -= step;
    if (event.key === "ArrowDown") saved.y += step;
    product.elementOffsets[selectedElementKey] = saved;
    activeGuides = { vertical: null, horizontal: null };
    render();
    scheduleSave();
    status.textContent = `正在移动：${elementLabels[selectedElementKey] || "已选板块"}（${saved.x.toFixed(0)}, ${saved.y.toFixed(0)}）`;
  });

  normalizeProductImages();
  populateLibraries();
  applyProduct();
  render();
  requestAnimationFrame(fitEditorCanvasToViewport);
})();
