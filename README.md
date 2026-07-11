# Hjemleveringordre V1.1 – Vercel Blob

Komplett erstatningspakke som bruker:

- Firestore til ordredata, brukere, status og historikk
- Vercel Blob Private til original-PDF-er og bilder
- Resend til mottak og varslinger
- Vercel til drift

Firebase Storage brukes ikke lenger.

## Hva må slettes fra GitHub?

For å unngå gamle filer og duplikater:

1. Slett hele `src`-mappen i GitHub.
2. Slett disse rotfilene dersom de finnes:
   - `package.json`
   - `next.config.js`
   - `next.config.mjs`
   - `next.config.cjs`
   - `next.config.ts`
   - `tsconfig.json`
   - `next-env.d.ts`
   - `.env.example`
   - `README.md`
3. Behold `.gitignore`, eller erstatt den med filen i pakken.
4. Last deretter opp alt innhold fra denne pakken til roten av repositoryet.

Ikke slett Vercel-prosjektet, Blob Store, Firebase-prosjektet eller Resend-oppsettet.

## Environment Variables i Vercel

Disse skal beholdes:

- `FIREBASE_SERVICE_ACCOUNT`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `SESSION_SECRET`
- `BLOB_STORE_ID`
- `BLOB_WEBHOOK_PUBLIC_KEY`

`VERCEL_OIDC_TOKEN` opprettes automatisk av Vercel ved deploy/runtime.

Denne kan slettes etter deploy:

- `FIREBASE_STORAGE_BUCKET`

## Viktig om eksisterende ordre

Gamle ordre som peker til Firebase Storage kan fortsatt vises og slettes, men den gamle PDF-en kan ikke tolkes på nytt etter overgang til Blob.

For ren testing:

1. Logg inn som Admin.
2. Slett gamle testordre.
3. Send PDF-en på nytt til:
   `ordre@hjemlevering.jobbverktoy.no`

Da lagres den nye PDF-en i Vercel Blob og «Tolk originaldokument på nytt» fungerer.

## Test etter deploy

1. Åpne:
   `/api/resend/inbound`
2. Bekreft at svaret viser:
   - `"configured": true`
   - `"storage": "Vercel Blob private"`
3. Slett en gammel testordre.
4. Send kundeordre 1549 på nytt.
5. Kontroller at:
   - overskriften er kundeordrenummer og navn
   - varelinjene vises
   - original PDF kan åpnes
   - ny tolking fungerer
   - bilder kan lastes opp
