# Hjemleveringordre V3.0 – stabil felles typemodell

Komplett ren pakke basert på V2.8.3.

## Viktigste endring

Ordresiden og administratorredigeringen bruker nå nøyaktig samme typer fra:

`src/types/order.ts`

Felles modeller:

- `Order`
- `OrderItem`
- `OrderPhoto`
- `BlobReference`
- `OrderEvent`
- `OrderStatus`
- `FulfillmentMethod`
- `TransportType`
- `DashboardOrder`

Dette retter konflikten der to forskjellige typer med navnet `Order` hadde
ulike definisjoner av `photos.url`, `uploadedBy` og `createdAt`.

`url`, `filename`, `uploadedBy` og relaterte bildefelt aksepterer nå både
`null` og manglende verdi, slik eldre Firestore-ordre også gjør.

## I tillegg

- `NotificationItem` eksporteres korrekt fra e-postmodulen.
- dashboardet bruker den felles ordremodellen via `DashboardOrder`.
- alle funksjoner fra V2.8.3 er beholdt.

## Opplasting

Dette er laget som en ren V3-pakke. Siden repositoryet tømmes, lastes hele det
utpakkede innholdet opp i roten av `main`.
