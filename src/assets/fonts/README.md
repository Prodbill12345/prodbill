# Polices des documents clients (C-REDESIGN-PHASE1-PDF)

Embarquées par `@react-pdf/renderer` via `src/lib/pdf/fonts.ts`. Licence SIL
Open Font License 1.1 (fichiers `OFL-*.txt`).

Source : dépôt officiel Google Fonts (`google/fonts`, `ofl/spacegrotesk` et
`ofl/dmsans`), polices variables converties en instances statiques — react-pdf
ne gère pas les axes variables.

| Fichier | Instance | Usage |
|---|---|---|
| `DMSans-Regular/Medium/Bold.ttf` | wght 400/500/700, opsz 14 | Texte courant, libellés, mentions |
| `SpaceGrotesk-Medium/Bold.ttf` | wght 500/700, **`tnum` figé** | Titres, numéro, montants |

Les chiffres tabulaires (`tnum`) sont figés dans les glyphes par défaut de
Space Grotesk (react-pdf n'applique pas les features OpenType) : tous les
chiffres ont la même chasse, les colonnes de montants s'alignent.

Aucune des deux polices ne contient U+202F (espace fine insécable produite
par `Intl.NumberFormat("fr-FR")`) : la normalisation en espace simple des
helpers `euros()` / `qte()` reste nécessaire.

⚠️ `--update-name-table` est indispensable : sans lui, toutes les instances
gardent le nom PostScript de la police variable et le moteur PDF les
dédoublonne — toutes les graisses sortent en Regular.

Régénération :

```sh
fonttools varLib.instancer --update-name-table -o DMSans-Regular.ttf "DMSans[opsz,wght].ttf" wght=400 opsz=14
fonttools varLib.instancer --update-name-table -o tmp.ttf "SpaceGrotesk[wght].ttf" wght=700
pyftfeatfreeze -f tnum tmp.ttf SpaceGrotesk-Bold.ttf
```
