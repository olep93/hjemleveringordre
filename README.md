# Hjemleveringordre V1.9 – forbedret Klikk & Hent-skanner og generiske PLU

Komplett versjon med alt fra V1.8.

## Klikk & Hent-skanner

Når et bilde velges, limes inn eller tas med kamera, kjøres OCR automatisk.

Skanneren forsøker å hente:

- ordrenummer
- kundenavn
- adresse og poststed
- telefon
- GTIN/EAN
- varenavn fra produktoverskriften
- modell som alternativ hjelpetekst
- enhet og antall

Kategorier som `Konstruksjonsvirke` og `Terrasse` ignoreres.

Eksempel:

- overskrift: `48x98 K-Virke Imp C24`
- GTIN: `7040431878659`
- modell: `MOELVEN KVIRKE 48X98 FURU C24 IMP L`
- antall: `130 Meter`

Skanneren fyller inn redigerbare felt. Brukeren skal kontrollere resultatet før
ordren opprettes.

## Generiske PLU-linjer

Korte PLU-er som:

- `20032 BYGGEVARER`
- `90646 VINDUER`

blir ikke søkt opp på Obsbygg.no.

Appen beholder:

- PLU-nummer
- varetekst
- kommentaren i de etterfølgende radene

Eksempel:

`90646 VINDUER`

Kommentar:

`Tilbud #11465313`

Kommentaren vises i plukklisten og følger med i e-postvarsler.

## Opplasting

Slett innholdet i GitHub-repositoryet og last opp hele den utpakkede pakken til
roten. Behold Vercel-prosjekt, miljøvariabler, Blob Store, Firebase og Resend.

Første Vercel-bygg installerer den nye avhengigheten `tesseract.js`.
