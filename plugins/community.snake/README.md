# Snake

A game of Snake that plays itself, in colour tiles. Every 10 seconds the snake moves a couple of tiles towards the food (red) by the shortest safe path. It grows each time it eats; when it boxes itself in, it flashes red and starts again. The game carries on between turns in the rotation.

Settings:
- Tiles it moves every 10 seconds: 1 to 4.
- Snake colour.

Notes:
- Split-flap tiles take a moment to flip, so this is a slow, calm Snake.
- Nothing is fetched: it runs on your device.
- This is a script plugin (Rattleboard 0.8.0 or later) with no network access at all.
