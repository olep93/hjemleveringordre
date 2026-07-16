# Hjemleveringordre v2.9.1

- Parseren kombinerer nå ordinær radtolking og flat PDF-tolking, slik at korte ÅPEN PLU-linjer ikke forsvinner når de er delt mellom PDF-kolonner.
- Kjente PLU-er 20032 (Byggevarer), 29034 (Frakt) og 90646 (Vinduer) tas med som egne plukkbare varelinjer.
- Fraktlinjen er nå plukkbar og inngår i antall varelinjer.
- Transportørens e-post lagres eksplisitt fra administratorpanelet med egen lagreknapp.
- Mottakeren styres kun av den globale administratorinnstillingen og kan ikke overstyres fra ordre eller klient.
- Testmodus beholdes i administratorpanelet og er aktiv som sikker standard dersom innstillingen ikke finnes.
