#!/usr/bin/env bash
# Monta o zip de entrega da Fase 6 a partir do último commit.
#
# Uso:  ./scripts/package-delivery.sh "https://link-do-video"
#       (sem argumento, LINK-VIDEO.txt sai com um aviso para preencher)
#
# Só entram arquivos versionados no git: .env, chaves, node_modules e o
# banco ficam de fora.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${ENTREGA_NOME:-agrosmart_4esoa-2026_fase6_atividade}"  # nome do zip: passe ENTREGA_NOME (o RM fica fora do repositório)
OUT_DIR="$ROOT/entrega"
STAGE="$(mktemp -d)"
VIDEO_URL="${1:-}"

cd "$ROOT"
if [ -n "$(git status --porcelain -- docs scripts simulator web api)" ]; then
  echo "Aviso: há mudanças sem commit; o zip usa o último commit (HEAD)."
fi

mkdir -p "$STAGE/$NAME/codigo" "$OUT_DIR"
git archive HEAD | tar -x -C "$STAGE/$NAME/codigo"
cp -R "$STAGE/$NAME/codigo/docs/fase-6" "$STAGE/$NAME/entregas"
cp "$STAGE/$NAME/entregas/README.md" "$STAGE/$NAME/README.md"
sed -E -i.bak \
  -e 's#\]\(([a-z0-9-]+\.md)\)#](entregas/\1)#g' \
  -e 's#\]\((diagrams/|prints/)\)#](entregas/\1)#g' \
  -e 's#\]\(([a-z-]+\.(png|jsonl|csv))\)#](entregas/\1)#g' \
  "$STAGE/$NAME/README.md" && rm "$STAGE/$NAME/README.md.bak"
# Inside entregas/, code links must point to the sibling codigo/ folder.
for doc in "$STAGE/$NAME/entregas/"*.md; do
  sed -i.bak -e 's#](\.\./\.\./#](../codigo/#g' "$doc" && rm "$doc.bak"
done

if [ -n "$VIDEO_URL" ]; then
  printf 'Vídeo de demonstração (Fase 6 — AgroSmart):\n%s\n' "$VIDEO_URL" >"$STAGE/$NAME/LINK-VIDEO.txt"
else
  printf 'PREENCHER: cole aqui o link do vídeo (YouTube, Drive ou similar).\n' >"$STAGE/$NAME/LINK-VIDEO.txt"
fi

rm -f "$OUT_DIR/$NAME.zip"
(cd "$STAGE" && zip -qr "$OUT_DIR/$NAME.zip" "$NAME")
rm -rf "$STAGE"
echo "Zip gerado: entrega/$NAME.zip"
