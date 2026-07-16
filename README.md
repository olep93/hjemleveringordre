# Hjemleveringordre V2.4 – testmodus i administrasjonspanelet

Dette er en komplett pakke med alt fra V2.2 og V2.3.

## Test mode

Administratorer kan nå styre e-postmodusen direkte fra
administrasjonspanelet.

### Testmodus på

- ferdigstillingsmail sendes bare til jobb-e-posten til den innloggede brukeren
- Waypoint/transportøren mottar ingenting
- emnet merkes med `[TEST]`
- original kundeordre og plukkebilder følger som vedlegg

### Testmodus av

- ferdigstillingsmail sendes til Waypoint/transportøren
- jobb-e-posten til innlogget bruker settes i kopifeltet
- original kundeordre og plukkebilder følger som vedlegg

Standard transportøradresse er:

`marcus@waypointlarvik.no`

Adressen kan redigeres i samme panel.

Innstillingen lagres i Firestore under:

`appSettings/email`

Standardverdien er alltid testmodus på dersom innstillingen ikke finnes.
Dette hindrer utilsiktet utsending til transportøren.

## Opplasting

Last opp hele det utpakkede innholdet til roten av GitHub-repositoryet.
Behold Vercel-prosjekt, miljøvariabler, Blob Store, Firebase og Resend.
