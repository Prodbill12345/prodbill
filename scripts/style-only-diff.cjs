#!/usr/bin/env node
// scripts/style-only-diff.cjs — preuve « habillage seul » : compare l'AST de chaque fichier (base git vs
// copie de travail) après avoir remplacé toute chaîne qui n'est qu'une liste
// de classes CSS (Tailwind) par un marqueur. Sortie : fichiers dont l'AST
// diffère encore (= changement hors style) + nb de chaînes neutralisées.
// Usage : node scripts/style-only-diff.cjs <commit de base> <fichier listant les chemins>
// Code de sortie 1 si un fichier change autrement que par ses classes / styles.
const ts = require(process.cwd() + "/node_modules/typescript");
const { execFileSync } = require("child_process");
const fs = require("fs");
const [base, listFile] = process.argv.slice(2);
const files = fs.readFileSync(listFile, "utf8").split("\n").filter(Boolean);

const SINGLE = new Set("flex grid block inline hidden truncate uppercase lowercase capitalize italic relative absolute fixed sticky underline grow shrink border rounded transition group peer contents invisible visible resize-none antialiased tabular-nums whitespace-nowrap".split(" "));
const isClassToken = (t) => t.includes("-") || t.includes(":") || SINGLE.has(t) || /^\[.*\]$/.test(t);
function looksLikeClasses(text) {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(isClassToken);
}
function normalize(src, name) {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let n = 0;
  const tr = (ctx) => (root) => {
    const visit = (node) => {
      if (ts.isJsxAttribute(node) && node.name.getText() === "style") return undefined; // style inline : habillage
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeClasses(node.text)) {
        n++; return ts.factory.createStringLiteral("§CLS§");
      }
      if (ts.isTemplateExpression(node)) {
        // `classes ${x} classes` : neutralise les fragments purement « classes »
        const head = looksLikeClasses(node.head.text) ? "§" : node.head.text;
        const spans = node.templateSpans.map((s, i) => {
          const last = i === node.templateSpans.length - 1;
          const txt = looksLikeClasses(s.literal.text) || s.literal.text.trim() === "" ? "§" : s.literal.text;
          const lit = last ? ts.factory.createTemplateTail(txt, txt) : ts.factory.createTemplateMiddle(txt, txt);
          return ts.factory.createTemplateSpan(ts.visitNode(s.expression, visit), lit);
        });
        n++;
        return ts.factory.createTemplateExpression(ts.factory.createTemplateHead(head, head), spans);
      }
      if (ts.isJsxText(node) && node.text.trim() === "") return undefined;
      return ts.visitEachChild(node, visit, ctx);
    };
    return ts.visitNode(root, visit);
  };
  const out = ts.transform(sf, [tr]).transformed[0];
  const printed = ts.createPrinter({ removeComments: true }).printFile(out);
  return { printed, n };
}
let bad = 0;
for (const f of files) {
  let oldSrc;
  try { oldSrc = execFileSync("git", ["show", `${base}:${f}`], { encoding: "utf8" }); } catch { console.log(`NOUVEAU  ${f}`); continue; }
  const a = normalize(oldSrc, f), b = normalize(fs.readFileSync(f, "utf8"), f);
  if (a.printed === b.printed) console.log(`OK       ${f}  (${b.n} chaînes de style neutralisées)`);
  else {
    bad++;
    const la = a.printed.split("\n"), lb = b.printed.split("\n");
    const i = la.findIndex((l, k) => l !== lb[k]);
    console.log(`DIFFÈRE  ${f}\n   avant : ${la[i]?.trim()}\n   après : ${lb[i]?.trim()}`);
  }
}
console.log(bad ? `\n${bad} fichier(s) avec changement hors style` : "\nAucun changement hors style.");
process.exit(bad ? 1 : 0);
