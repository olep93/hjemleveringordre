# Hjemleveringordre V2.8.5

Komplett pakke med alt fra V2.8.4.

Build-feilen skyldtes at ordretypen og administrator-editoren hadde to ulike
definisjoner av `photos`.

Den faktiske ordretypen tillater:

- `url?: string | null`
- `filename?: string`
- `uploadedBy?: string`
- `createdAt?: string`

Administrator-editoren forventet derimot at `url` aldri kunne være `null`.

Photo-typen i administrator-editoren er nå synkronisert, slik at
`<AdminOrderEditor order={order} />` bygger korrekt.

Du trenger ikke tømme GitHub-repositoryet. Last opp hele pakken og erstatt filer
med samme navn.
