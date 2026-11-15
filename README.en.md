中文版: [README.md](README.md)

# animal-vision · Down on the floor, through other eyes

A 3D kid's bedroom laid out like a real family home, with scanned furniture, toys and surface materials, and the camera on the floor at toy height. Like a toy in *Toy Story*, you look up at the bed, the red ball on the rug, the sunflowers on the windowsill. Then you swap eyes: dog, cat, honeybee, eagle, pit viper.

![Human on the left, dog on the right](assets/cover.jpg)

## Open it and play

```bash
git clone https://github.com/TTNAN/animal-vision.git
```

Live: `https://TTNAN.github.io/animal-vision/`.

To run locally you need a static server (models and textures load over HTTP, so double-clicking `index.html` won't work). The bundled `dist/app.js` is committed, so nothing to install:

```bash
cd animal-vision
python3 -m http.server 8000
# then open http://localhost:8000
```

The first load downloads about 12 MB of models and textures.

| Action | Desktop | Phone |
| --- | --- | --- |
| Look around | Drag | One-finger drag |
| Crawl | W A S D / arrow keys | Pad, bottom left |
| Switch eyes | 1–6 or the bottom bar | Bottom bar |
| Lights off | N | "Lights off" |
| Snapshot | "Snapshot" | Same |

## Six little quests

The About panel jumps straight to each one:

1. 🔴 **Where did the red ball go?** To a dog, the red ball on the green rug is only a brightness difference, and the red and green blocks merge.
2. 🌻 **The sunflower's UV bullseye.** To a bee, the petals are bright at the tips and dark at the centre, a runway to the nectar.
3. 👁 **Who can read the bottom of the eye chart?** All six at once; the eagle's fovea works like a telephoto lens.
4. 🐹 **Find the hamster in the dark.** We see black; the pit viper's heat pits light up the hamster, the hot cocoa and the radiator.
5. 🌙 **Lights off: what does the cat see?** We see almost nothing; the cat still sees the room.
6. ↔️ **How wide can a view be?** Turn on True field and the bee's and dog's views open up.

Plus "peek out from under the bed": set height to "Own height" and crawl under as the cat.

![Six pairs of eyes on the same rug](assets/grid.jpg)

| Dog · rug | Cat · lights off |
| --- | --- |
| ![](assets/shots/dog.jpg) | ![](assets/shots/cat-night.jpg) |
| **Bee · flowers** | **Pit viper · find the hamster** |
| ![](assets/shots/bee.jpg) | ![](assets/shots/snake.jpg) |

## Six pairs of eyes

| Eyes | Colour | Acuity | Field | At night |
| --- | --- | --- | --- | --- |
| Human | Trichromat, ~420 / 530 / 560 nm | 20/20, the reference | ~200° | Reference |
| Dog | Dichromat, ~429 / 555 nm, red and green merge | ~20/75 | ~240–250° | Tapetum, better than us |
| Cat | Dichromat, ~450 / 555 nm, washed out | ~20/100–20/200 | ~200° | Needs ~1/6 of our light |
| Honeybee | UV / blue / green, blind to red; false colour | Each facet ~1.5–2° | Nearly 360° | Poor |
| Eagle | Tetrachromat, oil droplets saturate colour | ~20/5, magnified fovea | 200°+ | Worse than us |
| Pit viper | Dichromat eyes + heat-sensing pits | Blurry heat image | ~170° (illustrative) | Heat needs no light |

## Why these things are in the room

Each object exposes one difference:

- **Red ball and red/green blocks on a green rug**: red–green discrimination.
- **Sunflowers and flowers on the sill**: carry a UV map; only the bee sees the bullseye.
- **Eye chart on the toy chest** and book spines: acuity.
- **Hamster cage, hot cocoa, radiator, lamp, window glass**: every object has a temperature for the viper's heat view.
- **Under the bed, toy chest, doorway, rug, flowers, hamster cage**: six camera spots, all places a toy would sit.
- Wardrobe, desk, nightstand, a train circling its track, ceiling fan, glow stars, rocket, dinosaur: so it reads as a real kid's room first.

## The science: what this is not

This is an **approximation**. No screen can give you another animal's experience; it can translate published measurements into a picture we can read.

- **Dichromacy** (dog, cat, the viper's eyes) is simulated in linear light with dichromat matrices tuned to each species' cone peaks, preserving luminance.
- **Acuity** becomes a per-species blur radius; the eagle is sharpened and magnified at the centre to suggest the deep fovea.
- **Screens cannot show UV.** UV is a separate painted map in the scene (the bullseye shape is typical of such patterns, not measured data), and the bee view uses **false colour**: green→red, blue→green, UV→blue.
- **The bee's hex mosaic** shows the scale of compound-eye resolution; real ommatidia are not a regular grid.
- **Heat** is rendered from a temperature set on each object, then blurred; viper fields and resolution vary a lot by species, so this is illustrative.
- **Very wide fields** can only be squeezed onto a flat screen; True field caps at about 230°, beyond which it turns into a tiny-planet swirl.
- Night mode's colour loss, noise and gain are illustrative, not measured sensitivity curves per species.

If something disagrees with the literature, please open an issue, ideally with a source.

## Hacking on it

```bash
npm install
npm run dev      # rebuild on change and serve locally
npm run build    # writes dist/app.js
npm run capture  # regenerate the screenshots in assets/ (needs Chrome)
```

```text
animal-vision/
├── index.html          # page shell, Chinese first, EN toggle top right
├── style.css
├── dist/app.js         # bundled code (what index.html loads)
├── src/
│   ├── main.js         # rendering, movement, collision, split views, quests, URL params
│   ├── room.js         # room, furniture, toys, lights, camera spots, animation
│   ├── textures.js     # procedural textures (eye chart, UV petals, leaves…)
│   ├── vision.js       # per-species parameters and the shader
│   └── i18n.js         # Chinese/English copy and quests
├── tools/capture.mjs   # screenshot script
├── assets/models/      # scanned models (GLB)
├── assets/tex/         # PBR materials and the window panorama
└── assets/             # README images
```

**How it renders**: each frame, cube cameras at the eye position capture all directions (normal colour, UV and temperature), and a shader projects, blurs, recolours and adds mosaic or heat per species. One position feeds all six eyes, so split and grid views show the same instant.

**Share a view** with URL parameters, e.g. `index.html?sp=bee&view=flower&mode=split`: `sp` (human/dog/cat/bee/eagle/snake), `view` (door/rug/bed/chest/flower/hamster), `mode` (single/split/grid), `h` (toy/baby/own), `night=1`, `fov=1`, `lang=en`.

## Assets

Furniture, toys, floor, walls, fabrics and the outdoor panorama are from [Poly Haven](https://polyhaven.com), CC0. The bed, window, radiator, hamster cage, sunflowers, blocks and train are built in code.

## Versions

- **v3**: scanned models, PBR materials and real daylight; the room is laid out like a real home.
- **v2**: 3D kid's room, toy-height camera, six eyes (new: pit viper heat), split and grid views, lights off, true field, six quests, six camera spots.
- **v1**: one AI-generated living-room photo with five filters (commit `6f52ccd`).

MIT License
