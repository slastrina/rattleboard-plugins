# Planes near the airport

Shows the aircraft near an airport right now, lowest first, with their callsign, type and altitude:

```
MEL DEPARTURES
QLK1942 E190 1,100 FT
QFA401  B738 3,200 FT
VOZ825  B38M 5,900 FT
```

- **Show**: *Departures* lists aircraft climbing faster than 300 ft/min (just taken off), *Arrivals* those descending faster than 300 ft/min, *All airborne* everything in the air. Aircraft on the ground are always left out.
- **Latitude / Longitude / Radius**: where to look. The defaults are Melbourne Airport (-37.6733, 144.8433) and 5 nautical miles. Set **Airport name on the card** to match (for example `SYD` with -33.9461, 151.1772).
- **Ignore aircraft above**: leaves out traffic passing high overhead (10,000 ft by default; clear it for no limit).
- A callsign that isn't broadcast falls back to the registration. Up to four aircraft are shown; the card is redrawn as the list changes, at most once a minute.
- On a Compact board (3×15) the rows are wider than the board, so they wrap; Standard and Large boards show them as a table.

Needs Rattleboard 0.7.0 or later (it uses `pick.where`, `pick.sort`, `pick.fields` and status lists).

## Data

Data: adsb.lol (ODbL). Aircraft positions come from [adsb.lol](https://adsb.lol), a free, community-fed ADS-B exchange, under the Open Database License (ODbL 1.0). No account or key.

It fetches once a minute (the minimum Rattleboard allows for a plugin), which is well within adsb.lol's fair-use limits. Please don't lower it if you copy this plugin.
