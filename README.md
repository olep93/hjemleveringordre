# Hjemleveringordre V1.0

Komplett, ryddet prosjektpakke for et helt nytt GitHub-repository.

## Inneholder

- Gjestemodus som standard
- Innlogging via knappen oppe til høyre
- Testbruker:
  - Brukernavn: `Admin`
  - Passord: `midlertidigpassord`
- Roller:
  - Gjest
  - Medarbeider
  - Leder
  - Administrator
- Adminpanel med brukeropprettelse og varslingsliste
- Sletting av ordre for leder og administrator
- Resend webhook for mottak av PDF på e-post
- Firestore og Firebase Storage
- Automatisk torsdagsregel
- Manuell opplasting av PDF eller bilde
- Ordredetaljer, plukkeliste, bilder, plassering og historikk
- Varsling til e-post ved ny ordre og når ordre er klar for lasting
- PDF-parser tilpasset faktisk Obs Bygg-kundeordreformat
- Informasjonsfelt med:
  `ordre@hjemlevering.jobbverktoy.no`
- Kopier-knapp for e-postadressen

## Vercel Environment Variables

På det nye Vercel-prosjektet må disse legges inn:

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `FIREBASE_SERVICE_ACCOUNT`
- `SESSION_SECRET`
- Valgfritt: `FIREBASE_STORAGE_BUCKET`
- Valgfritt: `NOTIFICATION_FROM_EMAIL`

Anbefalt avsender:

`Hjemleveringordre <varsling@hjemlevering.jobbverktoy.no>`

## Resend webhook

Når den nye Vercel-adressen er klar, bruk:

`https://DIN-VERCEL-ADRESSE/api/resend/inbound`

Hendelse:

`email.received`

## Ren opplasting

1. Opprett et helt nytt, tomt GitHub-repository.
2. Pakk ut ZIP-filen.
3. Last opp innholdet i den utpakkede mappen til roten av repositoryet.
4. Opprett et nytt Vercel-prosjekt fra repositoryet.
5. Legg inn miljøvariablene.
6. Deploy.
7. Kontroller:
   `/api/resend/inbound`
8. Oppdater webhook-URL i Resend dersom Vercel-adressen er ny.

## Test av eksempelordren

Parseren er tilpasset PDF-en med kundeordre 1549 og skal hente:

- Kundeordre 1549
- Transportordre Ordresen
- 500 M – 48X98 IMP K-VIRKE
- 15 Stk – INFRA STØP B20 20KG
- 200 M – 28X120 IMP TERRASSEB
