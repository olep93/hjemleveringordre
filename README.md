# Hjemleveringordre V2.8.3

Komplett pakke med alt fra V2.8.2.

Denne versjonen retter TypeScript-feilen i Waypoint-mailruten:

`unknown[] | undefined` kunne ikke sendes til `formatOrderItemsHtml`.

Ruten bruker nå den samme `NotificationItem`-typen som e-postformateringen,
og sender en tom liste dersom eldre ordre mangler varelinjer.

Du trenger ikke tømme GitHub-repositoryet. Last opp hele innholdet fra denne
pakken og velg å erstatte filer med samme navn.
