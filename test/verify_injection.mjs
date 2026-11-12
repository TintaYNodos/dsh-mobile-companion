import http from "node:http";import { HOST, PORT, authHeader } from "./_harness.mjs";



const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari/537.36";

const fetchHtml = () =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path: "/", headers: { ...authHeader(), "user-agent": UA, accept: "text/html" }, agent: false },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", reject);
    req.end();
  });

const html = await fetchHtml();
const count = (re) => (html.match(re) || []).length;
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

check("un solo meta viewport", count(/name=["']viewport["']/gi) === 1, String(count(/name=["']viewport["']/gi)));
check("viewport con viewport-fit", /viewport-fit=cover/.test(html));
check("hoja de estilos dentro de head", html.indexOf('id="dsh-companion-mobile"') < html.indexOf("</head>"));
check("no se inyecta javascript", !/dsh-companion[^>]*>[\s\S]{0,40}<script/i.test(html));
check("una sola hoja companion", count(/dsh-companion-mobile/g) === 1);
check("el documento conserva su estructura", /<\/body>/i.test(html) && /<\/html>/i.test(html));
check("no duplica el manifiesto original", count(/rel="manifest"/gi) <= 2, String(count(/rel="manifest"/gi)));
check("tamano razonable", html.length > 500 && html.length < 200_000, `${html.length} bytes`);

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
