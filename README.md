# Hjemleveringordre V2.7.1

Komplett pakke med alt fra V2.6.

Nytt:
- valg av transporttype ved ferdigstilling
- Standard kranbil til bakkeplan
- Kranbil stor
- Varebil
- transporttype vises som egen linje i transportørmailen
- stor og tydelig melding om at mailen ikke kan besvares
- alle henvendelser henvises til obsbygg.tonsberg@coop.no

TypeScript-feilen `Property 'transportType' does not exist on type 'Order'`
er rettet med en eksplisitt WaypointOrder-type.
