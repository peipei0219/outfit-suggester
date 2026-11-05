import { suggest } from "./rules.js";

const form = document.getElementById("form");
const result = document.getElementById("result");

function render(s) {
  result.innerHTML = `
    <h2>${s.band}日のコーデ候補</h2>
    <ul>
      <li><strong>アウター:</strong> ${s.outer}</li>
      <li><strong>トップス:</strong> ${s.tops}</li>
      <li><strong>ボトムス:</strong> ${s.bottoms}</li>
      <li><strong>小物:</strong> ${s.items.join("、")}</li>
    </ul>
    <button type="button" id="shuffle">別の候補</button>
  `;
  document.getElementById("shuffle").addEventListener("click", run);
}

function run() {
  render(
    suggest({
      temp: Number(document.getElementById("temp").value),
      weather: document.getElementById("weather").value,
      scene: document.getElementById("scene").value,
    })
  );
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});
