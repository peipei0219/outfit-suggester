import { suggest } from "./rules.js";
import { fetchWeather, searchCity, getCurrentPosition } from "./weather.js";
import {
  CATEGORIES, SEASONS, SCENES,
  loadCloset, addItem, removeItem, exportCloset, importCloset,
} from "./closet.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

let closet = loadCloset();
let lastWeather = null; // 取得した天気（最高・最低気温、降水確率）
let lastSuggestion = null;

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
  });
}

// ---------- 天気 ----------
const LAST_PLACE_KEY = "outfit-suggester.place.v1";
const status = (msg, isError = false) => {
  $("weather-status").textContent = msg;
  $("weather-status").classList.toggle("error", isError);
};
const WEATHER_LABEL = { sunny: "晴れ", cloudy: "くもり", rainy: "雨", snowy: "雪" };

async function applyWeather(place) {
  status(`${place.name}の天気を取得中…`);
  try {
    const w = await fetchWeather(place.lat, place.lon);
    lastWeather = w;
    $("temp").value = w.temp;
    $("weather").value = w.weather;
    status(
      `${place.name}: ${WEATHER_LABEL[w.weather]} ${w.temp}℃（体感 ${w.feelsLike}℃）／最高 ${w.max}℃・最低 ${w.min}℃／降水確率 ${w.rainChance}%`
    );
    try { localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(place)); } catch {}
    run();
  } catch (e) {
    status(e.message, true);
  }
}

$("use-location").addEventListener("click", async () => {
  status("現在地を取得中…");
  try {
    const pos = await getCurrentPosition();
    await applyWeather({ name: "現在地", ...pos });
  } catch (e) {
    status(e.message, true);
  }
});

$("city-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("city").value.trim();
  const list = $("city-results");
  list.replaceChildren();
  if (!q) return;
  status("検索中…");
  try {
    const results = await searchCity(q);
    if (!results.length) {
      status("見つかりませんでした。別の地名で試してください", true);
      return;
    }
    status("");
    if (results.length === 1) {
      applyWeather(results[0]);
      return;
    }
    for (const r of results) {
      const b = el("button", { type: "button", className: "secondary", textContent: r.name });
      b.addEventListener("click", () => {
        list.replaceChildren();
        applyWeather(r);
      });
      list.append(el("li", {}, b));
    }
  } catch (err) {
    status(err.message, true);
  }
});

// ---------- 提案 ----------
const SLOT_LABEL = { outer: "アウター", tops: "トップス", bottoms: "ボトムス" };

function render(s) {
  const result = $("result");
  const list = el("ul", { className: "outfit" });
  for (const key of ["outer", "tops", "bottoms"]) {
    const slot = s[key];
    list.append(
      el("li", {},
        el("span", { className: "slot", textContent: SLOT_LABEL[key] }),
        el("span", { className: "name", textContent: slot.name }),
        el("span", {
          className: slot.owned ? "tag owned" : "tag",
          textContent: slot.owned ? "手持ち" : "おすすめ",
        })
      )
    );
  }
  if (s.items.length) {
    list.append(
      el("li", {},
        el("span", { className: "slot", textContent: "小物" }),
        el("span", { className: "name", textContent: s.items.join("、") })
      )
    );
  }
  const tips = s.tips.map((t) => el("p", { className: "tip", textContent: `💡 ${t}` }));
  const shuffle = el("button", { type: "button", className: "secondary", textContent: "🎲 別の候補" });
  shuffle.addEventListener("click", run);
  const hint = closet.length
    ? []
    : [el("p", { className: "hint", textContent: "クローゼットに服を登録すると、手持ちの服から提案します。" })];

  result.replaceChildren(el("h2", { textContent: `${s.band}日のコーデ候補` }), list, ...tips, ...hint, shuffle);
  result.hidden = false;
}

function run() {
  const temp = Number($("temp").value);
  if (!Number.isFinite(temp)) return;
  // 手入力で気温を変えたら、取得済みの最高・最低気温は使わない
  const w = lastWeather && lastWeather.temp === temp ? lastWeather : null;
  lastSuggestion = suggest({
    temp,
    weather: $("weather").value,
    scene: $("scene").value,
    closet,
    range: w ? { max: w.max, min: w.min } : undefined,
    rainChance: w?.rainChance,
    prev: lastSuggestion,
  });
  render(lastSuggestion);
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});

// ---------- クローゼット ----------
function chips(container, options, name) {
  container.replaceChildren(
    ...Object.entries(options).map(([value, label]) =>
      el("label", { className: "chip" },
        el("input", { type: "checkbox", name, value }),
        el("span", { textContent: label })
      )
    )
  );
}
$("item-category").replaceChildren(
  ...Object.entries(CATEGORIES).map(([value, label]) => el("option", { value, textContent: label }))
);
chips($("item-seasons"), SEASONS, "season");
chips($("item-scenes"), SCENES, "scene");

const checked = (container) =>
  [...container.querySelectorAll("input:checked")].map((i) => i.value);

function renderCloset() {
  $("closet-count").textContent = closet.length || "";
  const list = $("closet-list");
  if (!closet.length) {
    list.replaceChildren(el("p", { className: "hint", textContent: "まだ服が登録されていません。" }));
    return;
  }
  const groups = Object.entries(CATEGORIES).map(([cat, label]) => {
    const items = closet.filter((i) => i.category === cat);
    if (!items.length) return null;
    return el("div", { className: "group" },
      el("h3", { textContent: `${label}（${items.length}）` }),
      el("ul", { className: "items" },
        ...items.map((i) => {
          const del = el("button", {
            type: "button",
            className: "icon",
            textContent: "✕",
            title: "削除",
            ariaLabel: `${i.name}を削除`,
          });
          del.addEventListener("click", () => {
            if (!confirm(`「${i.name}」を削除しますか？`)) return;
            closet = removeItem(closet, i.id);
            renderCloset();
          });
          const meta = [
            i.seasons.map((s) => SEASONS[s].replace(/（.*）/, "")).join("・"),
            i.scenes.map((s) => SCENES[s]).join("・"),
          ].join(" / ");
          return el("li", {},
            el("div", {}, el("strong", { textContent: i.name }), el("small", { textContent: meta })),
            del
          );
        })
      )
    );
  });
  list.replaceChildren(...groups.filter(Boolean));
}

$("item-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const seasons = checked($("item-seasons"));
  const scenes = checked($("item-scenes"));
  const error = $("item-error");
  if (!seasons.length || !scenes.length) {
    error.textContent = "季節とシーンをそれぞれ1つ以上選んでください";
    return;
  }
  error.textContent = "";
  closet = addItem(closet, {
    name: $("item-name").value,
    category: $("item-category").value,
    seasons,
    scenes,
  });
  $("item-form").reset();
  $("item-name").focus();
  renderCloset();
});

$("export").addEventListener("click", () => {
  const blob = new Blob([exportCloset(closet)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "closet.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$("import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const { items, count } = importCloset(closet, await file.text());
    closet = items;
    renderCloset();
    $("backup-status").textContent = `${count}件の服を読み込みました`;
  } catch (err) {
    $("backup-status").textContent = `読み込めませんでした: ${err.message}`;
  }
});

// ---------- 起動 ----------
renderCloset();
try {
  const place = JSON.parse(localStorage.getItem(LAST_PLACE_KEY) ?? "null");
  if (place) applyWeather(place);
} catch {}
