# Hjemleveringordre V2.8.2

Komplett pakke med alt fra V2.8.1.

Vercel-feilen `Cannot find name 'main'` kom fra en gammel fil i roten av
GitHub-repositoryet:

`parse-click-collect.ts`

Den gamle filen inneholdt JSX-kode, men hadde `.ts`-filtype. Den er ikke den
aktive parseren under `src/lib/orders`.

Denne pakken inneholder derfor en trygg kompatibilitetsfil i roten som
overskriver den gamle filen og bare videresender eksportene til riktig parser:

`src/lib/orders/parse-click-collect.ts`

Det anbefales fortsatt å slette alt gammelt innhold i repositoryet før hele
pakken lastes opp, slik at utdaterte filer ikke blir liggende igjen.
