# Hjemleveringordre V2.6 – åpne og generiske PLU-er

Dette er en komplett pakke med alt fra V2.5.

## Korte PLU-numre

Korte varenummer behandles som PLU og søkes aldri opp på Obsbygg.no.

Følgende kjente åpne PLU-er normaliseres:

- `20032` → `BYGGEVARER`
- `29034` → `FRAKT`
- `90646` → `VINDUER`

## «ÅPEN PLU»-prefiks

Prefikset fjernes automatisk fra vareteksten:

- `ÅPEN PLU BYGGEVARER` → `BYGGEVARER`
- `ÅPEN PLU FRAKT` → `FRAKT`
- `ÅPEN PLU VINDUER` → `VINDUER`

Dersom kundeordre-PDF-en allerede bare viser `BYGGEVARER` eller `VINDUER`,
beholdes teksten uendret.

## Kommentarlinjer

Fritekst mellom PLU-linjen og neste varelinje beholdes som linjekommentar.

Fra testordren:

- `20032 BYGGEVARER`
  - `500 m med 19x173 df 60 Bas`
  - `Må bestilles evt`
- `90646 VINDUER`
  - `Tilbud #11465313`

Kommentarene følger varen i plukklisten, e-postene og historikken.

## Opplasting

Last opp hele det utpakkede innholdet til roten av GitHub-repositoryet.
Behold Vercel-prosjekt, miljøvariabler, Blob Store, Firebase og Resend.
