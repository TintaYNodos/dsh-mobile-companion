import fs from "node:fs";
import path from "node:path";
import { MOBILE_STYLES } from "../src/mobile-styles.mjs";
import { queryBattery, collectSystemStats } from "../src/system-stats.mjs";
import { persistSatelliteNote } from "../src/sync.mjs";
import { config } from "../src/config.mjs";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

// 1. CSS en modo paisaje
const destructiveRule = /#root[^}]*flex-direction:\s*column/i.test(MOBILE_STYLES) ||
  /#app[^}]*flex-direction:\s*column/i.test(MOBILE_STYLES);
check("CSS landscape: no fuerza flex-direction column en root/app", !destructiveRule);
check("CSS landscape: define reglas para >= 600px", MOBILE_STYLES.includes("@media (min-width: 600px)"));

// 2. Bateria en system-stats
const battery = queryBattery();
const stats = collectSystemStats();
check("collectSystemStats incluye campo battery", "battery" in stats);
if (battery !== null) {
  check("battery contiene percent valido", typeof battery.percent === "number" && battery.percent >= 0 && battery.percent <= 100, `percent=${battery.percent}`);
  check("battery contiene plugged booleano", typeof battery.plugged === "boolean", `plugged=${battery.plugged}`);
  check("battery contiene charging booleano", typeof battery.charging === "boolean", `charging=${battery.charging}`);
  check("battery contiene status de texto", typeof battery.status === "string" && battery.status.length > 0, `status=${battery.status}`);
} else {
  check("PC sin bateria devuelve null correctamente", battery === null);
}

// Comprobar cache de 30 segundos
const t1 = Date.now();
const b1 = queryBattery();
const t2 = Date.now();
check("segunda llamada de bateria usa cache rapido", (t2 - t1) < 50, `delta=${t2 - t1}ms`);

// 3. Absorcion satelite
const testSatId = "test_sat_" + Date.now();
const testPayload = {
  satelliteId: testSatId,
  title: "Sesion de Planificacion Satelital",
  summary: "Resumen de pruebas unitarias de absorcion",
  messages: [
    { role: "user", content: "Analizar el despliegue", timestamp: Date.now() },
    { role: "assistant", content: "Despliegue verificado y aprobado.", timestamp: Date.now() }
  ]
};

const absorbResult = await persistSatelliteNote(testPayload);
check("absorbSatellite retorna ok y absorbedId", absorbResult.ok === true && typeof absorbResult.absorbedId === "string", `id=${absorbResult.absorbedId}`);

const satDir = path.join(config.syncDir, "satellite_notes");
const jsonFile = path.join(satDir, `${absorbResult.absorbedId}.json`);
const mdFile = path.join(satDir, `${absorbResult.absorbedId}.md`);

check("archivo JSON de satelite guardado", fs.existsSync(jsonFile));
check("archivo MD de satelite guardado", fs.existsSync(mdFile));

if (fs.existsSync(jsonFile)) {
  const jsonContent = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  check("JSON contiene satelliteId correcto", jsonContent.satelliteId === testSatId);
  check("JSON contiene los mensajes", Array.isArray(jsonContent.messages) && jsonContent.messages.length === 2);
  check("JSON contiene resumen", jsonContent.summary === "Resumen de pruebas unitarias de absorcion");
  fs.unlinkSync(jsonFile);
}

if (fs.existsSync(mdFile)) {
  const mdContent = fs.readFileSync(mdFile, "utf8");
  check("MD contiene titulo", mdContent.includes("Sesion de Planificacion Satelital"));
  check("MD contiene resumen", mdContent.includes("Resumen de pruebas unitarias de absorcion"));
  check("MD contiene roles", mdContent.includes("### Usuario") && mdContent.includes("### Asistente"));
  fs.unlinkSync(mdFile);
}

// 4. Pestaña Satelite en offline.html
const offlineHtml = fs.readFileSync(path.join(config.root, "offline.html"), "utf8");
check("offline.html contiene pestaña Satelite", offlineHtml.includes('id="tabSatellite"') && offlineHtml.includes("Satélite"));
check("offline.html contiene banner requerido", offlineHtml.includes("Modo Satélite · Planificación y Notas de Campo (Herramientas de PC en espera)"));
check("offline.html contiene deepseek-chat", offlineHtml.includes("deepseek-chat"));
check("offline.html contiene deepseek-reasoner", offlineHtml.includes("deepseek-reasoner"));
check("offline.html se comunica con window.AndroidCompanion", offlineHtml.includes("window.AndroidCompanion") && offlineHtml.includes("startSatelliteQuery"));
check("offline.html no contiene emojis", !/\p{Extended_Pictographic}/u.test(offlineHtml));

// 5. Verificacion HTTP del endpoint /dsh-companion/absorb-satellite en el servidor vivo
try {
  const { HOST, PORT, authHeader } = await import("./_harness.mjs");
  const httpPayload = {
    satelliteId: "http_sat_" + Date.now(),
    title: "Prueba Absorcion HTTP",
    messages: [{ role: "user", content: "Mensaje HTTP satelite" }],
    summary: "Prueba de endpoint"
  };
  const res = await fetch(`http://${HOST}:${PORT}/dsh-companion/absorb-satellite`, {
    method: "POST",
    headers: { ...authHeader(), "content-type": "application/json" },
    body: JSON.stringify(httpPayload)
  });
  check("POST /dsh-companion/absorb-satellite responde 200", res.status === 200, `status=${res.status}`);
  const data = await res.json();
  check("POST /dsh-companion/absorb-satellite retorna ok y absorbedId", data.ok === true && typeof data.absorbedId === "string", JSON.stringify(data));

  // Limpiar archivo creado por la prueba HTTP
  if (data.absorbedId) {
    const fJson = path.join(config.syncDir, "satellite_notes", `${data.absorbedId}.json`);
    const fMd = path.join(config.syncDir, "satellite_notes", `${data.absorbedId}.md`);
    try { if (fs.existsSync(fJson)) fs.unlinkSync(fJson); } catch {}
    try { if (fs.existsSync(fMd)) fs.unlinkSync(fMd); } catch {}
  }
} catch (err) {
  check("prueba HTTP absorb-satellite", false, err.message);
}

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length} pruebas correctas`);
if (checks.some((c) => !c)) process.exitCode = 1;
