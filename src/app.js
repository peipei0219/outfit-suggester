import { suggest } from "./rules.js";
import { fetchWeather, searchCity, getCurrentPosition } from "./weather.js";
import {
  CATEGORIES, SEASONS, SCENES,
  loadCloset, addItem, updateItem, removeItem, exportCloset, importCloset,
} from "./closet.js";
import {
  putPhoto, deletePhoto, getAllPhotos, resizeImage, requestPersist, blobToDataURL, dataURLToBlob,
} from "./photos.js";
import { SHOPS, toKeywords } from "./shops.js";
import { getTagger, analyzePhoto, embedPhoto } from "./tagger.js";
import { suggestName, encodeF16, decodeF16 } from "./tagger-core.js";
import { loadCompat, outfitScore, compatLevel } from "./compat-core.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
};
const svg = (paths) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = paths;
  return s;
};
const ICONS = {
  outer: '<path d="M9 3.5L4.5 6v14H9V11M15 3.5L19.5 6v14H15V11"/><path d="M9 3.5l3 5 3-5"/><path d="M12 8.5V20"/><path d="M9 20h6"/>',
  tops: '<path d="M8.5 4L4 6.5l1.8 3.6 2.2-.9V20h8V9.2l2.2.9L20 6.5 15.5 4c-.6 1.6-1.9 2.6-3.5 2.6S9.1 5.6 8.5 4z"/>',
  bottoms: '<path d="M7 3.5h10l1.2 17h-4.4L12 10l-1.8 10.5H5.8z"/><path d="M7 6.5h10"/>',
  shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.6M13 9.6C13.9 8 15 7 16.5 7H20"/><path d="M18 4.5L20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
};

const store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
const LAST_PLACE_KEY = "outfit-suggester.place.v1";
const SCENE_KEY = "outfit-suggester.scene.v1";
const AI_READY_KEY = "outfit-suggester.ai-ready.v1";

let closet = loadCloset();
let lastWeather = null; // { place, temp, weather, max, min, rainChance, feelsLike }
let lastSuggestion = null;
const photos = new Map(); // id → Blob
const photoUrls = new Map(); // id → 表示用 URL

// ---------- 相性モデル ----------
let compatModel = null;
const embedCache = new Map(); // embed（base64）→ Float32Array

function loadCompatModel() {
  return fetch("model/compat.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => { compatModel = json ? loadCompat(json) : null; })
    .catch(() => { compatModel = null; });
}

function embeddingOf(item) {
  if (!embedCache.has(item.embed)) {
    const bytes = (item.embed.length * 3) / 4 - (item.embed.endsWith("==") ? 2 : item.embed.endsWith("=") ? 1 : 0);
    embedCache.set(item.embed, decodeF16(item.embed, bytes / 2));
  }
  return embedCache.get(item.embed);
}

const scoreOutfit = (items) =>
  compatModel ? outfitScore(compatModel, items.map((i) => ({ category: i.category, embedding: embeddingOf(i) }))) : null;

// 写真から特徴（CLIP の埋め込み）を計算して服に保存する。AI モデルが端末にあるときだけ（勝手にダウンロードしない）
let embedQueue = Promise.resolve();
function queueEmbedding(id) {
  if (!store.get(AI_READY_KEY)) return;
  embedQueue = embedQueue.then(async () => {
    const blob = photos.get(id);
    const item = closet.find((i) => i.id === id);
    if (!blob || !item || item.embed) return;
    try {
      const e = await embedPhoto(blob);
      if (photos.get(id) !== blob) return; // 計算中に写真が変わった
      closet = updateItem(closet, id, { embed: encodeF16(e) });
      if (lastSuggestion) run();
    } catch {
      // 失敗しても提案は従来どおり動く
    }
  });
}

// ---------- 共通部品 ----------
function radios(container, name, options, selected) {
  container.replaceChildren(
    ...Object.entries(options).map(([value, label]) =>
      el("label", { className: "seg" },
        el("input", { type: "radio", name, value, checked: value === selected }),
        el("span", { textContent: label })
      )
    )
  );
}
function checkboxes(container, name, options) {
  container.replaceChildren(
    ...Object.entries(options).map(([value, label]) =>
      el("label", { className: "chip" },
        el("input", { type: "checkbox", name, value }),
        el("span", { textContent: label })
      )
    )
  );
}
const valueOf = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
const checkedValues = (container) => [...container.querySelectorAll("input:checked")].map((i) => i.value);

function setPhoto(id, blob) {
  if (photoUrls.has(id)) URL.revokeObjectURL(photoUrls.get(id));
  if (blob) {
    photos.set(id, blob);
    photoUrls.set(id, URL.createObjectURL(blob));
  } else {
    photos.delete(id);
    photoUrls.delete(id);
  }
}
// 写真があれば写真、なければ種類のイラスト
const tileArt = (id, category) =>
  id && photoUrls.has(id)
    ? el("img", { src: photoUrls.get(id), alt: "" })
    : el("span", { className: `art art-${category}` }, svg(ICONS[category]));

// ---------- タブ ----------
const tabs = [
  [$("tab-suggest"), $("panel-suggest")],
  [$("tab-closet"), $("panel-closet")],
];
for (const [tab] of tabs) {
  tab.addEventListener("click", () => {
    for (const [t, p] of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      p.hidden = !on;
    }
    updateThemeColor();
    window.scrollTo(0, 0);
  });
}

// ---------- 空（ヒーロー） ----------
const WEATHER_LABEL = { sunny: "晴れ", cloudy: "くもり", rainy: "雨", snowy: "雪" };
const SKY_TOP = { sunny: "#4f86d0", cloudy: "#7d8ba0", rainy: "#46566b", snowy: "#c9d5e3", hot: "#e39a4f" };

$("today").textContent = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date());

function updateThemeColor() {
  const sky = $("sky");
  const onSuggest = !$("panel-suggest").hidden;
  const color = onSuggest ? SKY_TOP[sky.dataset.heat === "hot" && sky.dataset.sky === "sunny" ? "hot" : sky.dataset.sky] : getComputedStyle(document.body).backgroundColor;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", color);
}

function updateSky(temp, weather, s) {
  const sky = $("sky");
  sky.dataset.sky = weather;
  sky.dataset.heat = s.bandKey === "hot" || s.bandKey === "warm" ? "hot" : s.bandKey === "freezing" ? "cold" : "";
  $("temp-big").textContent = temp;
  $("verdict").textContent = s.verdict;

  const line = $("weather-status");
  line.classList.remove("error");
  const fetched = lastWeather && lastWeather.temp === temp && lastWeather.weather === weather;
  if (fetched) {
    const w = lastWeather;
    $("place").textContent = w.place;
    line.replaceChildren(
      el("span", { textContent: `${WEATHER_LABEL[w.weather]}　体感 ${w.feelsLike}°` }),
      el("span", { textContent: `最高 ${w.max}° / 最低 ${w.min}°` }),
      el("span", { textContent: `降水 ${w.rainChance}%` })
    );
  } else {
    $("place").textContent = lastWeather ? `${lastWeather.place}（手入力）` : "";
    line.replaceChildren(
      el("span", { textContent: `${WEATHER_LABEL[weather]}　手入力の条件で提案しています` })
    );
  }
  updateThemeColor();
}

function skyMessage(msg, isError = false) {
  const line = $("weather-status");
  line.textContent = msg;
  line.classList.toggle("error", isError);
}

// ---------- 天気 ----------
async function applyWeather(place) {
  skyMessage(`${place.name}の天気を取得しています…`);
  try {
    const w = await fetchWeather(place.lat, place.lon);
    lastWeather = { ...w, place: place.name };
    $("temp").value = w.temp;
    document.querySelector(`input[name="weather"][value="${w.weather}"]`).checked = true;
    store.set(LAST_PLACE_KEY, place);
    run();
  } catch (e) {
    skyMessage(`${e.message}。時間をおいてもう一度お試しください`, true);
  }
}

$("use-location").addEventListener("click", async () => {
  skyMessage("現在地を確認しています…");
  try {
    const pos = await getCurrentPosition();
    await applyWeather({ name: "現在地", ...pos });
  } catch (e) {
    skyMessage(e.message, true);
  }
});

$("open-search").addEventListener("click", () => {
  const form = $("city-form");
  form.hidden = !form.hidden;
  $("open-search").setAttribute("aria-expanded", !form.hidden);
  if (!form.hidden) $("city").focus();
  else $("city-results").replaceChildren();
});

$("city-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("city").value.trim();
  const list = $("city-results");
  list.replaceChildren();
  if (!q) return;
  skyMessage("検索しています…");
  const choose = (place) => {
    list.replaceChildren();
    $("city-form").hidden = true;
    $("open-search").setAttribute("aria-expanded", "false");
    $("city").value = "";
    applyWeather(place);
  };
  try {
    const results = await searchCity(q);
    if (!results.length) {
      skyMessage(`「${q}」は見つかりませんでした。市区町村名で試してください`, true);
      return;
    }
    if (results.length === 1) return choose(results[0]);
    skyMessage("場所を選んでください");
    for (const r of results) {
      const b = el("button", { type: "button", className: "glass", textContent: r.name });
      b.addEventListener("click", () => choose(r));
      list.append(el("li", {}, b));
    }
  } catch (err) {
    skyMessage(err.message, true);
  }
});

// ---------- 条件 ----------
radios($("scenes"), "scene", SCENES, store.get(SCENE_KEY, "casual"));
radios($("weathers"), "weather", WEATHER_LABEL, "cloudy");

$("scenes").addEventListener("change", () => {
  store.set(SCENE_KEY, valueOf("scene"));
  run();
});
$("weathers").addEventListener("change", run);
$("temp").addEventListener("input", run);
for (const b of document.querySelectorAll(".step")) {
  b.addEventListener("click", () => {
    const t = $("temp");
    t.value = Math.max(-30, Math.min(45, (Number(t.value) || 0) + Number(b.dataset.step)));
    run();
  });
}
$("form").addEventListener("submit", (e) => e.preventDefault());

// ---------- 提案 ----------
const SLOT_LABEL = { outer: "アウター", tops: "トップス", bottoms: "ボトムス" };

function shopSection(s) {
  const keywords = [
    ...new Set(["outer", "tops", "bottoms"].filter((k) => !s[k].owned).flatMap((k) => toKeywords(s[k].name))),
  ];
  if (!keywords.length) return null;
  return el("details", { className: "shops" },
    el("summary", { textContent: "手持ちにない服を探す" }),
    el("ul", {},
      ...keywords.map((q) =>
        el("li", {},
          el("span", { className: "shop-q", textContent: q }),
          el("span", { className: "shop-links" },
            ...SHOPS.map((shop) =>
              el("a", {
                className: `shop-link shop-${shop.key}`,
                href: shop.url(q),
                target: "_blank",
                rel: "noopener",
                textContent: shop.label,
              })
            )
          )
        )
      )
    )
  );
}

function render(s, animate = false) {
  const shuffle = el("button", { type: "button", className: "shuffle", ariaLabel: "別の候補を見る" },
    svg(ICONS.shuffle), el("span", { textContent: "別の候補" }));
  shuffle.addEventListener("click", () => run(true));

  const items = el("ul", { className: `look-items${animate ? " swap" : ""}` },
    ...["outer", "tops", "bottoms"].map((key) => {
      const slot = s[key];
      const none = toKeywords(slot.name).length === 0; // 「なし」
      return el("li", { className: `look-item${none ? " is-none" : ""}` },
        el("span", { className: "tile" }, tileArt(slot.owned ? slot.id : null, key)),
        el("span", { className: "look-text" },
          el("span", { className: "slot", textContent: SLOT_LABEL[key] }),
          el("span", { className: "name", textContent: slot.name })
        ),
        slot.owned ? el("span", { className: "owned", textContent: "手持ち" }) : null
      );
    })
  );

  const extras = s.items.length
    ? el("div", { className: "extras" },
        el("span", { className: "slot", textContent: "持ち物" }),
        el("ul", {}, ...s.items.map((i) => el("li", { textContent: i }))))
    : null;

  const tips = s.tips.length ? el("ul", { className: "tips" }, ...s.tips.map((t) => el("li", { textContent: t }))) : null;

  const COMPAT_LABEL = { good: "相性 ◎", ok: "相性 ○", poor: "相性 △" };
  const level = s.compat && compatModel ? compatLevel(compatModel, s.compat.score) : null;
  const badge = level ? el("span", { className: `compat compat-${level}`, textContent: COMPAT_LABEL[level] }) : null;
  const withPhotos = closet.filter((i) => photoUrls.has(i.id));
  const hint = !closet.length
    ? el("p", { className: "hint" }, "クローゼットに服を登録すると、手持ちの服から選びます。")
    : level
      ? el("p", { className: "hint" }, "手持ちの服の組み合わせから、AI が相性の良いものを選んでいます。")
      : compatModel && withPhotos.length >= 2 && !closet.some((i) => i.embed)
        ? el("p", { className: "hint" }, "服の登録で「写真から自動入力」を一度使うと、手持ちの服どうしの相性で組み合わせを選べるようになります。")
        : null;

  $("result").replaceChildren(
    ...[
      el("div", { className: "look-head" }, el("h2", {}, "今日のコーデ", badge), shuffle),
      items, extras, tips, hint, shopSection(s),
    ].filter(Boolean)
  );
}

function run(animate = false) {
  const temp = Math.round(Number($("temp").value));
  if (!Number.isFinite(temp)) return;
  const weather = valueOf("weather");
  const w = lastWeather && lastWeather.temp === temp && lastWeather.weather === weather ? lastWeather : null;
  lastSuggestion = suggest({
    temp,
    weather,
    scene: valueOf("scene"),
    closet,
    range: w ? { max: w.max, min: w.min } : undefined,
    rainChance: w?.rainChance,
    prev: lastSuggestion,
    scoreOutfit: compatModel ? scoreOutfit : undefined,
  });
  updateSky(temp, weather, lastSuggestion);
  render(lastSuggestion, animate === true);
}

// ---------- クローゼット ----------
radios($("item-category"), "category", CATEGORIES, "tops");
checkboxes($("item-seasons"), "season", SEASONS);
checkboxes($("item-scenes"), "item-scene", SCENES);

function openAddForm(open) {
  $("item-form").hidden = !open;
  $("toggle-add").setAttribute("aria-expanded", open);
  $("toggle-add").hidden = open;
  if (open) $("item-name").focus();
}
$("toggle-add").addEventListener("click", () => openAddForm(true));
$("cancel-add").addEventListener("click", () => openAddForm(false));

function renderCloset() {
  $("closet-count").textContent = closet.length || "";
  $("closet-summary").textContent = closet.length
    ? Object.entries(CATEGORIES)
        .map(([cat, label]) => `${label} ${closet.filter((i) => i.category === cat).length}`)
        .join("　")
    : "";
  const list = $("closet-list");
  if (!closet.length) {
    list.replaceChildren(
      el("div", { className: "empty" },
        el("p", { className: "empty-title", textContent: "まだ服がありません" }),
        el("p", { className: "hint", textContent: "よく着る服から登録すると、提案に「手持ち」の服が並びます。写真は後からでも追加できます。" })
      )
    );
    return;
  }
  const groups = Object.entries(CATEGORIES).map(([cat, label]) => {
    const items = closet.filter((i) => i.category === cat);
    if (!items.length) return null;
    return el("section", { className: "shelf" },
      el("h2", {}, label, el("span", { className: "count", textContent: items.length })),
      el("ul", { className: "tiles" },
        ...items.map((i) => {
          const has = photoUrls.has(i.id);
          const photoBtn = el("button", {
            type: "button",
            className: "tile-photo",
            ariaLabel: `${i.name}の写真を${has ? "変更" : "追加"}`,
          }, tileArt(i.id, cat), has ? null : el("span", { className: "add-photo" }, svg(ICONS.camera), "写真を追加"));
          photoBtn.addEventListener("click", () => {
            replaceTarget = i.id;
            $("replace-photo").click();
          });
          const del = el("button", { type: "button", className: "tile-del", ariaLabel: `${i.name}を削除` }, svg(ICONS.close));
          del.addEventListener("click", () => {
            if (!confirm(`「${i.name}」を削除しますか？`)) return;
            closet = removeItem(closet, i.id);
            setPhoto(i.id, null);
            deletePhoto(i.id).catch(() => {});
            renderCloset();
          });
          return el("li", { className: "tile-card" },
            photoBtn,
            del,
            el("strong", { textContent: i.name }),
            el("small", { textContent: i.seasons.map((s) => SEASONS[s].replace(/（.*）/, "")).join("、") }),
            el("small", { textContent: i.scenes.map((s) => SCENES[s]).join("、") })
          );
        })
      )
    );
  });
  list.replaceChildren(...groups.filter(Boolean));
}

$("item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const seasons = checkedValues($("item-seasons"));
  const scenes = checkedValues($("item-scenes"));
  const error = $("item-error");
  if (!seasons.length || !scenes.length) {
    error.textContent = "着る季節とシーンをそれぞれ1つ以上選んでください";
    return;
  }
  error.textContent = "";
  const category = valueOf("category");
  const res = addItem(closet, {
    name: $("item-name").value, category, seasons, scenes,
    ...(pendingEmbedding && pendingPhoto ? { embed: encodeF16(pendingEmbedding) } : {}),
  });
  closet = res.items;
  const photo = pendingPhoto;
  // 写真の保存を待たずにフォームを空にして、続けて入力できるようにする
  $("item-form").reset();
  lastAiName = null;
  document.querySelector(`input[name="category"][value="${category}"]`).checked = true; // 種類は続けて登録しやすいよう残す
  clearPendingPhoto();
  $("item-name").focus();
  renderCloset();
  if (photo) {
    try {
      await savePhoto(res.added.id, photo);
      renderCloset();
      queueEmbedding(res.added.id); // 自動入力を使わなかった場合も、モデルがあれば特徴を計算
    } catch (err) {
      error.textContent = `服は追加しました。写真は保存できませんでした（${err.message}）`;
    }
  }
  if (lastSuggestion) run();
});

// ---------- 写真 ----------
let pendingPhoto = null; // 登録フォームで選んだ写真（縮小済み）
let replaceTarget = null; // 写真を変更する服の id

async function savePhoto(id, blob) {
  await putPhoto(id, blob);
  setPhoto(id, blob);
  requestPersist();
}

function clearPendingPhoto() {
  pendingPhoto = null;
  const preview = $("item-photo-preview");
  if (preview.src) URL.revokeObjectURL(preview.src);
  preview.hidden = true;
  preview.removeAttribute("src");
  $("item-photo-label").hidden = false;
  showAiBox();
}

// ---------- AI で自動入力 ----------
let aiPick = { garment: null, color: null };
let pendingEmbedding = null; // 登録フォームの写真の特徴（自動入力のときに計算したもの）
let lastAiName = null; // AI が入れた名前（ユーザーが書き換えていなければ上書きしてよい）

const aiStatus = (msg) => { $("ai-status").textContent = msg; };
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(0);

async function showAiBox() {
  pendingEmbedding = null;
  const box = $("ai-box");
  $("ai-result").replaceChildren();
  aiPick = { garment: null, color: null };
  const available = pendingPhoto && (await getTagger());
  box.hidden = !available;
  if (available) {
    aiStatus(
      store.get(AI_READY_KEY)
        ? "写真は端末の外に送信されません。"
        : "初回のみAIモデルをダウンロードします（Wi-Fi推奨）。写真は端末の外に送信されません。"
    );
  }
}

function applyAi() {
  const { garment, color } = aiPick;
  if (!garment) return;
  document.querySelector(`input[name="category"][value="${garment.category}"]`).checked = true;
  for (const box of $("item-seasons").querySelectorAll("input")) box.checked = garment.seasons.includes(box.value);
  const name = $("item-name");
  if (!name.value.trim() || name.value === lastAiName) {
    name.value = lastAiName = suggestName(garment, color);
  }
  for (const b of $("ai-result").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", b.dataset.key === garment.key || b.dataset.key === color?.key);
  }
}

function renderAi(result) {
  const group = (title, options, kind) =>
    el("div", { className: "ai-group" },
      el("span", { className: "ai-label", textContent: title }),
      el("div", { className: "ai-options" },
        ...options.map((o) => {
          const b = el("button", { type: "button", className: "ai-option", ariaPressed: "false" },
            el("span", { textContent: o.ja }), el("small", { textContent: `${Math.round(o.p * 100)}%` }));
          b.dataset.key = o.key;
          b.addEventListener("click", () => {
            aiPick[kind] = o;
            if (kind === "color" && !aiPick.garment) aiPick.garment = result.garments[0];
            applyAi();
          });
          return b;
        })
      )
    );
  $("ai-result").replaceChildren(group("種類", result.garments, "garment"), group("色", result.colors, "color"));
}

$("ai-run").addEventListener("click", async () => {
  const btn = $("ai-run");
  const photo = pendingPhoto;
  if (!photo) return;
  btn.disabled = true;
  aiStatus("AIモデルを準備しています…");
  try {
    const result = await analyzePhoto(photo, ({ loaded, total }) =>
      aiStatus(`AIモデルを読み込み中… ${mb(loaded)} / ${mb(total)} MB`)
    );
    if (photo !== pendingPhoto) return; // 判定中に写真が変わった
    store.set(AI_READY_KEY, true);
    pendingEmbedding = result.embedding;
    renderAi(result);
    if (result.confident) {
      aiPick = { garment: result.garments[0], color: result.colors[0] };
      applyAi();
      aiStatus("AIが入力しました。違っていたら候補をタップするか、直接直してください。");
    } else {
      aiStatus("はっきり判定できませんでした。近い候補をタップしてください。");
    }
  } catch (err) {
    aiStatus(`判定できませんでした（${err.message}）。通信環境を確認してもう一度お試しください。`);
  } finally {
    btn.disabled = false;
  }
});

$("item-photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    pendingPhoto = await resizeImage(file);
    const preview = $("item-photo-preview");
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(pendingPhoto);
    preview.hidden = false;
    $("item-photo-label").hidden = true;
    $("item-error").textContent = "";
    showAiBox();
  } catch (err) {
    $("item-error").textContent = err.message;
  }
});

$("replace-photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  const id = replaceTarget;
  replaceTarget = null;
  if (!file || !id) return;
  try {
    await savePhoto(id, await resizeImage(file));
    closet = updateItem(closet, id, { embed: undefined }); // 古い写真の特徴は使わない
    renderCloset();
    queueEmbedding(id);
    if (lastSuggestion) run();
  } catch (err) {
    alert(`写真を保存できませんでした: ${err.message}`);
  }
});

// ---------- バックアップ ----------
$("export").addEventListener("click", async () => {
  const dataUrls = new Map();
  for (const [id, blob] of photos) dataUrls.set(id, await blobToDataURL(blob));
  const blob = new Blob([exportCloset(closet, dataUrls)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "closet.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $("backup-status").textContent = `${closet.length}着を書き出しました`;
});

$("import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const { items, count, photos: incoming } = importCloset(closet, await file.text());
    closet = items;
    let failed = 0;
    for (const [id, dataURL] of incoming) {
      try {
        await savePhoto(id, await dataURLToBlob(dataURL));
      } catch {
        failed++;
      }
    }
    renderCloset();
    if (lastSuggestion) run();
    $("backup-status").textContent =
      `${count}着を読み込みました` + (failed ? `（写真${failed}枚は保存できませんでした）` : "");
  } catch (err) {
    $("backup-status").textContent = `読み込めませんでした: ${err.message}`;
  }
});

// ---------- 起動 ----------
renderCloset();
run();
Promise.all([getAllPhotos(), loadCompatModel()])
  .then(([all]) => {
    for (const [id, blob] of all) setPhoto(id, blob);
    renderCloset();
    if (lastSuggestion) run();
    for (const item of closet) if (photos.has(item.id) && !item.embed) queueEmbedding(item.id);
  })
  .catch(() => {}); // IndexedDB が使えない環境では写真なしで動かす

const lastPlace = store.get(LAST_PLACE_KEY);
if (lastPlace) applyWeather(lastPlace);
else skyMessage("「現在地の天気」で今日の天気に合わせて提案します");
