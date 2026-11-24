#!/usr/bin/env bash
# Gera o PNG de cada diagrama Mermaid (.mmd) desta pasta com o Chrome sem janela.
# Uso: bash docs/fase-7/diagrams/renderizar.sh   (precisa de internet para baixar o Mermaid)
# Passo 1: o Mermaid desenha o SVG numa página local e o Chrome devolve o SVG pronto.
# Passo 2: o Chrome fotografa o SVG no tamanho exato, com o dobro de pixels.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
MERMAID="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"
if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  EXTRA=""
else
  CHROME="$(command -v google-chrome || command -v chromium)"
  EXTRA="--no-sandbox"   # Linux do GitHub Actions
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for MMD in "$AQUI"/*.mmd; do
  NOME="$(basename "$MMD" .mmd)"
  python3 - "$MMD" "$TMP/$NOME.html" "$MERMAID" <<'EOF'
import html, json, sys
fonte = open(sys.argv[1], encoding="utf-8").read()
pagina = f"""<!doctype html><meta charset="utf-8"><body>
<script src="{sys.argv[3]}"></script>
<textarea id="saida"></textarea>
<script>
mermaid.initialize({{ startOnLoad: false, theme: "default", securityLevel: "strict",
  flowchart: {{ curve: "basis", padding: 12 }} }});
mermaid.render("diagrama", {json.dumps(fonte)}).then(({{ svg }}) => {{
  const caixa = document.createElement("div");
  caixa.innerHTML = svg;
  document.body.appendChild(caixa);
  const el = caixa.querySelector("svg");
  const vb = el.viewBox.baseVal;
  el.setAttribute("width", Math.ceil(vb.width));
  el.setAttribute("height", Math.ceil(vb.height));
  el.removeAttribute("style");
  el.setAttribute("style", "background:#ffffff");
  document.getElementById("saida").textContent = new XMLSerializer().serializeToString(el);
}}).catch((erro) => {{ document.getElementById("saida").textContent = "ERRO " + erro; }});
</script>"""
open(sys.argv[2], "w", encoding="utf-8").write(pagina)
EOF
  "$CHROME" --headless=new $EXTRA --disable-gpu --no-first-run --user-data-dir="$TMP/perfil" \
    --virtual-time-budget=15000 --dump-dom "file://$TMP/$NOME.html" > "$TMP/$NOME.dom" 2>/dev/null
  TAMANHO="$(python3 - "$TMP/$NOME.dom" "$TMP/$NOME.svg" <<'EOF'
import html, re, sys
dom = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r'<textarea id="saida">(.*?)</textarea>', dom, re.S)
svg = html.unescape(m.group(1)) if m else ""
if not svg.startswith("<svg"):
    sys.exit(f"falhou: {svg[:200]}")
open(sys.argv[2], "w", encoding="utf-8").write(svg)
w = re.search(r'width="(\d+)"', svg).group(1)
h = re.search(r'height="(\d+)"', svg).group(1)
print(f"{w},{h}")
EOF
)"
  "$CHROME" --headless=new $EXTRA --disable-gpu --no-first-run --user-data-dir="$TMP/perfil" \
    --hide-scrollbars --force-device-scale-factor=2 --window-size="$TAMANHO" \
    --screenshot="$AQUI/$NOME.png" "file://$TMP/$NOME.svg" > /dev/null 2>&1
  echo "$NOME.png ($TAMANHO px, dobro de pixels)"
done
