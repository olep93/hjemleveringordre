# Hjemleveringordre V2.8.4

Komplett pakke med alt fra V2.8.3.

Build-feilen er rettet:

`NotificationItem` var deklarert lokalt i `src/lib/notifications.ts`, men ikke
eksportert. Waypoint-ruten importerer nå en type som faktisk er eksportert.

Endringen er:

`type NotificationItem = ...`

til:

`export type NotificationItem = ...`

Du trenger ikke tømme GitHub-repositoryet. Last opp hele pakken og erstatt filer
med samme navn.
