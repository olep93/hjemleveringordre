# Hjemleveringordre V1.2.1

Denne versjonen retter varelinjetolkingen.

## Hva var galt?

PDF-en var lesbar, men tabellcellene ble ikke nødvendigvis returnert som én ferdig tekstlinje.
Den gamle parseren krevde at hele raden allerede lå i én bestemt tekststreng.

## Ny metode

Parseren leser nå tekstfragmentenes koordinater fra MuPDF og bygger hver visuelle
tabellrad fra venstre mot høyre. Deretter identifiseres:

- EAN/PLU
- varetekst
- bestillingsnummer
- bestilt antall
- enhet
- levert antall
- pris
- linjesum

Det finnes også en ekstra fallback som deler tabellen på EAN-numrene hvis PDF-en
likevel leverer teksten i feil rekkefølge.

## Opplasting

Dette er en komplett prosjektpakke.

1. Slett alt innhold i GitHub-repositoryet.
2. Pakk ut ZIP-filen.
3. Last opp hele innholdet til roten av repositoryet.
4. Commit.
5. Vent på Vercel-deploy.

Behold eksisterende Environment Variables og Vercel Blob Store.
