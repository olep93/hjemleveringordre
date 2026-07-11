# Hjemleveringordre v1.1.1 – PDF-parser hotfix

## Hva er rettet?

Feilen:

`Invalid number: ... (charCode 6)`

kom fra `pdf-parse`, ikke fra Vercel Blob. Enkelte Coop-genererte PDF-er inneholder binære kontrolltegn/objekter som den gamle parseren ikke håndterte riktig.

Denne versjonen:

- fjerner `pdf-parse`
- bruker Mozilla PDF.js (`pdfjs-dist`)
- leser tekst med koordinater fra PDF-en
- bygger tabellradene i riktig venstre-til-høyre-rekkefølge
- matcher Obs Bygg-formatet med EAN, varetekst, best.nr., antall, enhet, pris og sum

## Opplasting til GitHub

Du trenger ikke slette hele repositoryet.

Erstatt disse filene:

- `package.json`
- `next.config.ts`
- `src/lib/orders/parse-order-pdf.ts`

Commit. Vercel installerer den nye PDF-parseren og deployer automatisk.

## Test

Etter deploy:

1. Åpne kundeordre 1549.
2. Trykk `Tolk originaldokument på nytt`.
3. Forventet plukkliste:
   - 500 M – 48X98 IMP K-VIRKE
   - 15 Stk – INFRA STØP B20 20KG
   - 200 M – 28X120 IMP TERRASSEB
