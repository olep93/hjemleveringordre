# Hjemleveringordre v1.1.2 – TypeScript-fiks

Feilen kom av at `pdfjs-dist/legacy/build/pdf.mjs` ikke eksporterer typen `TextItem`
fra selve runtime-modulen.

Denne hotfixen:
- fjerner importen av `TextItem`
- bruker en lokal TypeScript type guard
- endrer ikke selve PDF-tolkingen

## Gjør dette

Erstatt kun:

`src/lib/orders/parse-order-pdf.ts`

Commit, så deployer Vercel automatisk.
