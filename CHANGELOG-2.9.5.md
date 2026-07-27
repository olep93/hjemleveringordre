# Hjemleveringordre 2.9.5

## Klikk & Hent – mobilkamera og OCR

- Kameraopplastinger behandles som bilder, ikke som tekstbaserte PDF-er.
- Støtter JPG, JPEG, PNG, WEBP og mobilbilder der MIME-type mangler.
- Leser og korrigerer EXIF-retning automatisk.
- Beskjærer den tomme nederdelen av ordrelappen før OCR for bedre hastighet og presisjon.
- Forstørrer, gråtoner, normaliserer og skjerper originalbildet før lesing.
- Bruker automatisk tabelltolkning først og «sparse text»-reserve ved svakt resultat.
- OCR kjøres på originalfilen som sendes fra kameraet, ikke på forhåndsvisningen i nettleseren.
- Bedre feilmeldinger når bildet er tomt, ugyldig eller ikke lesbart.
- Litt lengre tidsgrense i klienten for mobilbilder.

Alle tidligere endringer fra 2.9.4 er beholdt.
