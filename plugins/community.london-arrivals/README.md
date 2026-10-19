# London arrivals

The next arrivals at a Transport for London stop or station (Tube, bus, DLR, Overground, Elizabeth line, trams), soonest first, with how many minutes away each one is. The corner shows how those lines are running: green for good service, yellow for minor delays, orange or red for severe delays and closures, with a line saying which.

Settings:
- TfL stop id: the stop's NaPTAN id. Stations look like `940GZZLUOXC` (Oxford Circus); bus stops like `490008660N`. Search for a stop at https://api.tfl.gov.uk/StopPoint/Search/oxford%20circus and use its `id`.
- Name on the card (optional): otherwise the station's own name.
- Only this line (optional): like `victoria`, `elizabeth` or a bus route like `73`.

Notes:
- Data: the TfL Unified API (Powered by TfL Open Data; contains OS data © Crown copyright and database rights). No key needed at this rate: two requests a minute.
- This is a script plugin (Rattleboard 0.8.0 or later). It only contacts api.tfl.gov.uk.
