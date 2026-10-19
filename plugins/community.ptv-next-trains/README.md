# PTV next trains

The next departures from your station or stop in Melbourne and Victoria, live from Public Transport Victoria, with the expected time (the live estimate when PTV has one), minutes to go and platform:

```
FLINDERS ST
8:42    3 MIN PLAT 2
8:45    6 MIN PLAT 8
8:51   12 MIN PLAT 2
```

- Up to three departures, soonest first. The minutes count down on the board as time passes (at most one change a minute), and the list is fetched again every minute.
- **Only this route id** and **Only this direction id** (both optional) narrow it to one line and one direction, for example only trains towards the city. Leave them blank for everything. Route and direction ids are in the API's answers (`route_id`, `direction_id`); `/v3/directions/route/{route_id}` lists a route's directions by name.
- Works for trams, buses and V/Line too: set **Mode** to match the stop.
- When nothing is listed (late at night, or a filter that matches nothing) the card says so.

Needs Rattleboard 0.7.0 or later (signed requests, `pick.where`/`pick.sort`/`pick.fields` and status lists).

## Setting it up

PTV's Timetable API is free, but every request has to carry your own developer ID and be signed with your own key. Rattleboard does the signing for you (HMAC-SHA1 of the request, as PTV's documentation describes); you only need to get the two values and paste them in.

### 1. Ask PTV for a developer ID and key

1. Send an email to **APIKeyRequest@ptv.vic.gov.au** with this subject line exactly: **PTV Timetable API – request for key**. The body can be a sentence saying what you'll use it for (for example, "A departure board for my home station").
2. PTV replies by email with a **developer ID** (a number, also called the user ID or `devid`) and an **API key** (a long code of letters, digits and dashes). It can take a few days when they're busy. Your address is added to PTV's API mailing list, and PTV doesn't offer technical support for the API.
3. Keep the key private: it's what proves requests are yours.

The process and terms are on Victoria's [Public transport timetable API](https://www.vic.gov.au/public-transport-timetable-api) page (see "Download instructions on how to register for an API key and calculate a signature").

**Keys are disabled after 3 months of non-use**, so if you take this plugin out of the rotation for a long time and it stops working with "The server refused access", ask PTV for a new key.

### 2. Find your stop id

Every station and stop has a number. The default, **1071**, is Flinders Street Station. To find yours:

- **On the PTV website**: search for the station at [ptv.vic.gov.au](https://www.ptv.vic.gov.au) and open its stop page. The number in the page address is the stop id (for example `.../stop/1071/flinders-street-station/`).
- **With the API itself**: search by name, for trains only (`route_types=0`; 1 is tram, 2 bus, 3 V/Line, 4 night bus):
  `https://timetableapi.ptv.vic.gov.au/v3/search/Richmond?route_types=0&devid=YOURID&signature=...`
  The answer's `stops` list has each match's `stop_id`. The request has to be signed like any other; a quick way is to add this plugin with the stop left at 1071 first to check your ID and key work, then change it.

Choose the matching **Mode** (Train, Tram, Bus, V/Line or Night bus): the same number can be a different stop in another mode.

### 3. Paste them into Rattleboard

1. Install the plugin from **Settings → Sources → Community plugins** and click **Add to rotation**.
2. In **Settings → Sources**, open the new source:
   - **PTV developer ID (devid)**: the number from PTV's email.
   - **Stop id** and **Name on the card**: your station.
   - **Key**: paste the API key into the **PTV API key** field. It's kept in your computer's credential store (Keychain on a Mac, Credential Manager on Windows), never in the settings file, and it's never shown on the board or in logs.
3. The preview should show your station within a few seconds. "The server refused access" means the developer ID or key isn't right (or the key was disabled).

## Attribution

Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.
