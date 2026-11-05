// Open-Meteo（APIキー不要）から天気を取得する
// https://open-meteo.com/en/docs

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

// WMO 天気コード → アプリの天気区分
export function codeToWeather(code) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snowy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rainy";
  if ([2, 3, 45, 48].includes(code)) return "cloudy";
  return "sunny";
}

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,apparent_temperature,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "1",
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`天気の取得に失敗しました (${res.status})`);
  const data = await res.json();
  const c = data.current;
  const d = data.daily;
  return {
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    weather: codeToWeather(c.weather_code),
    max: Math.round(d.temperature_2m_max[0]),
    min: Math.round(d.temperature_2m_min[0]),
    rainChance: d.precipitation_probability_max[0] ?? 0,
  };
}

export async function searchCity(name) {
  const params = new URLSearchParams({ name, count: "5", language: "ja", format: "json" });
  const res = await fetch(`${GEOCODING_URL}?${params}`);
  if (!res.ok) throw new Error(`地名の検索に失敗しました (${res.status})`);
  const data = await res.json();
  return (data.results ?? []).map((r) => ({
    name: [r.name, r.admin1].filter(Boolean).join("・"),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("この端末では位置情報が使えません"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "位置情報の利用が許可されていません。地名で検索してください"
              : "現在地を取得できませんでした。地名で検索してください"
          )
        ),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  });
}
