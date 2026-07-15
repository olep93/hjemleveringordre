# Hjemleveringordre V2.1 – robust Klikk & Hent-parser

Komplett pakke med alt fra V2.0.1.

## Ny skannemotor

- bildet auto-roteres fra EXIF
- bildet nedskaleres, gjøres grått, normaliseres og skjerpes før OCR
- dersom første lesing er svak, prøves en 90-graders variant
- parseren finner kunde, ordre, telefon, adresse, GTIN, produktheader, modell,
  antall og enhet
- kategorier som Konstruksjonsvirke og Terrasse ignoreres
- skanningen har kontrollert timeout og gir en tydelig feilmelding

Produktnavnet tas fra overskriften direkte over GTIN-raden. Modell brukes som
hjelpetekst. Alle felter kan fortsatt korrigeres før ordren opprettes.

Last opp hele pakken til roten av GitHub-repositoryet. Behold Vercel-prosjekt,
miljøvariabler, Blob Store, Firebase og Resend.
