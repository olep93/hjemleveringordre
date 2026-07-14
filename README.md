# Hjemleveringordre V2.0.1 – full administratorredigering

Komplett pakke med alt fra V1.9.2.

Administrator kan nå tilbakestille en ordre til «Må plukkes», endre all
ordreinformasjon, endre Waypoint-mottaker, legge til/redigere/slette varelinjer,
endre EAN/PLU, antall, enhet, radtekst og linjekommentar, samt endre avhuking.

Standard Waypoint-adresse er `marcus@waypointlarvik.no`.

Alle administratorendringer registreres i historikken.

Last opp hele pakken til roten av GitHub-repositoryet. Behold Vercel-prosjekt,
miljøvariabler, Blob Store, Firebase og Resend.


## TypeScript-fiks V2.0.1

Den lokale `OrderItem`-typen i ordre-API-et er synkronisert med resten av
varelinjemodellen. Dette retter build-feilen ved `item.identifierType`.

Følgende felt er lagt til i API-typen:

- `identifierType`
- `rawDescription`
- `lineComment`
- `bestNumber`
- `deliveredQuantity`
- `price`
- `lineTotal`
