<div align="center">

<img src="assets/logo.svg" width="88" alt="">

# Animal Vision · 动物之眼

**One world, six eyes.**

Drag the line to see how a dog, a cat, a honeybee, an eagle and a mouse see the same scene you do.

**[Try it live →](https://ttnan.github.io/animal-vision)** · [中文](README.md)

</div>

![Dark theme](assets/cover.jpg)

<details>
<summary>Light theme</summary>

![Light theme](assets/cover-light.jpg)

</details>

## Contents

- [What it does](#what-it-does)
- [The six eyes](#the-six-eyes)
- [How the images are made](#how-the-images-are-made)
- [Limits](#limits)
- [Tips](#tips)
- [Run locally](#run-locally)
- [Project layout](#project-layout)
- [Photos and fonts](#photos-and-fonts)

## What it does

- **Drag to compare**: human on the left, animal on the right. Drag the divider anywhere, or nudge it with the arrow keys.
- **Six eyes**: human, dog, cat, honeybee, eagle and mouse, each with its own colour vision, sharpness and low-light ability.
- **Three kinds of light**: as shot, dusk and night. As the light fades, human eyes lose colour first and then drown in noise, while cats and dogs still see.
- **All six**: every eye side by side on one photo.
- **Eagle loupe**: an eagle out-resolves your screen, so it gets a movable 3× loupe.
- **Quick swap**: the `+` at the bottom left of the photo changes the sample or uploads your own, and on a phone you can take a selfie straight away.
- **Your own photo**: drop, paste or choose one. It's processed on your GPU in the browser and never uploaded.
- **Save image**: export a labelled comparison in one click.
- **Atlas**: all six eyes on one scale, comparing cone peaks, acuity and low-light gain. Click a row to switch to that eye.
- **Dark and light themes**: dark by default. The button at the top right switches to a warm, paper-like light theme, and your choice is remembered after a refresh.
- **中文 / English**: the page follows your browser language, and you can switch at any time.
- **Samples**: six 4K CC0 photos (portrait, orchard, sunflower, valley, night street and cat), each with a suggested eye. It opens on the portrait: what you look like to your pet.

| Dog: red apples vanish into leaves | Bee: false colour and facets |
|---|---|
| ![Dog](assets/shots/dog.jpg) | ![Bee](assets/shots/bee.jpg) |
| **Cat: a street at night** | **Eagle: loupe on distant peaks** |
| ![Cat](assets/shots/cat-night.jpg) | ![Eagle](assets/shots/eagle.jpg) |
| **Mouse: a cat as a soft blur** | **All six eyes on one face** |
| ![Mouse](assets/shots/mouse.jpg) | ![All](assets/shots/grid.jpg) |

## The six eyes

| | Colour | Sharpness (min. angle of resolution) | Low-light gain | In a line |
|---|---|---|---|---|
| Human *Homo sapiens* | Trichromat: 420 / 530 / 560 nm | 1′ (20/20) | 1× | The reference |
| Dog *Canis familiaris* | Dichromat: 429 / 555 nm | 3.75′ (≈20/75) | ≈3.5× | Blue and yellow survive; red and green merge into one khaki |
| Cat *Felis catus* | Dichromat: 450 / 555 nm, washed out | ≈7′ (20/100–20/200) | ≈6× | Short-sighted and colour-poor by day, ahead after dark |
| Honeybee *Apis mellifera* | UV 344 / blue 436 / green 544 nm | each facet ≈1–2° | 0.8× | Sees ultraviolet in a world made of tiles |
| Eagle *Aquila audax* | Tetrachromat with oil droplets | ≈0.35′ (≈20/5) | 0.8× | Roughly three times sharper than us |
| Mouse *Mus musculus* | UV 360 / green 508 nm | ≈60′ | ≈4× | Light, dark and rough shapes |

## How the images are made

Everything runs live in the browser with WebGL2: downsample, separable Gaussian blur, colour model, light and noise, facets, then the loupe.

1. **Colour**: dogs and cats use the Machado, Oliveira & Fernandes (2009) dichromat model. Mice lack a long-wave cone, so they use the protan model. Bees use the usual false colour: green shows as red, blue as green and UV as blue.
2. **Sharpness**: at arm's length a CSS reference pixel spans about 1.28 arcmin, close to the human limit. So one CSS pixel stands in for the finest detail we resolve, and the other eyes get a Gaussian blur set by their own minimum angle of resolution. An eagle beats the screen, so it gets the loupe instead.
3. **Dim light**: each eye brightens by its own gain. Colour fades first in the dark, with a slight Purkinje shift, and noise creeps in.
4. **Facets**: the bee view overlays a hexagonal grid of ommatidia.

## Limits

- Photos carry no UV or heat, so the bee's UV channel is estimated from colour.
- Bee facets are drawn at half their real size so you can see them.
- The eagle's cone peaks are approximate.
- Field of view, motion perception and the brain's processing aren't drawn.

These are **grounded approximations**, not what an animal actually experiences.

## Tips

| Action | How |
|---|---|
| Switch eye | Click the buttons under the photo, or press `1`–`5` |
| All six | Click "All six", or press `G` |
| Nudge the divider | Focus it and press `←` / `→`; hold `Shift` for bigger steps |
| Change or add a photo | Click the `+` at the bottom left of the photo, drop a file on the page, or paste with `Ctrl/⌘ + V` |
| Switch theme | The sun / moon button at the top right |

**URL parameters** (share exactly what you see):

| Parameter | Values |
|---|---|
| `img` | `portrait` (default) `orchard` `sunflower` `valley` `night` `cat` |
| `eye` | `dog` `cat` `bee` `eagle` `mouse` |
| `light` | `day` `dusk` `night` |
| `view` | `grid` (all six) |
| `split` | `0`–`1`, divider position |
| `lang` | `zh` `en` |
| `theme` | `dark` (default) or `light` |

Example: `?img=night&eye=cat&light=night&theme=light`

## Run locally

A plain static page using ES modules and WebGL2, with no build step:

```bash
git clone https://github.com/TTNAN/animal-vision.git
cd animal-vision
python3 -m http.server 8080   # then open http://localhost:8080
```

It has to be served over HTTP; opening `index.html` directly won't load the ES modules.

To regenerate the README screenshots:

```bash
npm i
npx playwright-core install chromium-headless-shell
npm run capture
```

## Project layout

```
index.html          markup, plus a tiny script that sets the theme before first paint
style.css           all styles: dark variables on :root, light overrides on [data-theme="light"]
src/species.js      the six eyes: parameters, zh/en copy, sample info
src/gl.js           WebGL2 pipeline
src/app.js          interaction, theme, upload, save, URL state
assets/photos/      samples (3840 px) and thumbnails
assets/fonts/       self-hosted fonts
assets/logo.svg     logo; favicon.svg is the simplified mark
tools/capture.mjs   screenshot script
```

## Photos and fonts

All samples come from Wikimedia Commons and are CC0 public domain:

[Portrait](https://commons.wikimedia.org/wiki/File:In_front_of_pumpkin_shelves_(Unsplash).jpg) Frank Marino ·
[Orchard](https://commons.wikimedia.org/wiki/File:Tree_with_red_apples_in_Barkedal_1.jpg) W.carter ·
[Sunflower](https://commons.wikimedia.org/wiki/File:Sunflower_and_bees.jpg) Mustang Joe ·
[Valley](https://commons.wikimedia.org/wiki/File:Wet_mountain_valley_(Unsplash).jpg) Kalen Emsley ·
[Night street](https://commons.wikimedia.org/wiki/File:Night_street_in_Udagawach%C5%8D,_Tokyo_(53335292514).jpg) Romain Guy ·
[Cat](https://commons.wikimedia.org/wiki/File:Young_tabby_cat_keeping_watch.jpg) W.carter

Fonts: Fraunces, Geist, Geist Mono and Noto Serif SC, all under the SIL Open Font License. The Chinese font is subset to the characters the page uses, so regenerate it after changing Chinese copy.

The earlier 3D room version lives at the tag [`v4-3d`](https://github.com/TTNAN/animal-vision/tree/v4-3d).

## License

Code is under the [MIT License](LICENSE).
