# Hjemleveringordre V2.8.1

Komplett pakke med alt fra V2.7.1.

Nytt i ferdigstillingsdialogen:

- transporttype viser en rød advarsel tilpasset valget
- Standard kranbil til bakkeplan:
  Standard levering leveres normalt kun til bakkeplan og løftes rett av bil.
- Kranbil stor:
  Ekstrakostnad utenfor standard leveringsvilkår.
- Varebil:
  Innbæring må eventuelt avtales direkte med Waypoint.

Det er også lagt inn en egen utvidbar knapp:
Kommentar til transportør

Kommentaren lagres på ordren, kan redigeres av administrator og vises som egen
linje i mailen til transportøren.


## Buildfix V2.8.1

Ruten for sletting av enkeltbilder bruker nå den eksisterende eksporten:

`deletePrivateBlobs([pathname])`

Dette retter Turbopack-feilen:

`Export deletePrivateBlob doesn't exist in target module`
