中文版：[README.md](README.md)

# animal-vision · One Room, Different Eyes

One family living room, one fixed viewpoint — and five different worlds, depending on whose eyes are looking through it: human, dog, cat, bee and eagle.

This is not a photo filter. We first built a real-looking living room — sofa, coffee table, TV cabinet, bookshelf, floor lamp, curtains, a red ball on a green rug, a vase of flowers on the coffee table — and then let five kinds of eyes take turns looking at it. The differences in colour and sharpness speak for themselves.

![The same living room through five kinds of eyes](assets/demo.gif)

The animation cycles through human → dog → cat → bee → eagle, about 1.2 seconds per frame, on loop.

## The idea in 30 seconds

- **Where did the red ball go?** To human eyes, the little red ball stands out clearly against the green rug. To a dog, red and green merge, and the ball survives only as a difference in brightness — which is why dogs find a red ball by brightness and movement, not by colour.
- **What appeared on the flowers?** Through a bee's eyes, the flower centres gain an ultraviolet "nectar guide" pattern, like a runway painted for pollinators. Human eyes see none of it.
- **What changed on the bookshelf?** Through an eagle's eyes, the rows of book spines in the distance get sharper. Through a dog's or a cat's eyes, the same bookshelf turns into a blur.

## How to use it

There is nothing to install. This is a plain static page.

```bash
git clone https://github.com/TTNAN/animal-vision.git
cd animal-vision
```

Then double-click `index.html`. No build step, no dependencies, no internet needed.

To put it online: after pushing to GitHub, enable Pages in the repository's Settings → Pages, deploying from the `main` branch. The address is normally `https://TTNAN.github.io/animal-vision/`.

## Five views, one line each

| View | Colour | Sharpness | What jumps out |
| --- | --- | --- | --- |
| Human | Trichromatic: red, green and blue kept apart | The reference — sharpest | The red ball stands out; a flower is just a flower |
| Dog | Dichromatic, cone peaks around 429 and 555 nm; red and green collapse into yellow-grey | Around 20/75, slightly soft | The ball survives only as brightness; the world turns blue and yellow |
| Cat | Dichromatic, cone peaks around 450 and 555 nm; colours more muted | Noticeably lower than human vision, softer overall | Colours fade and blur, but dim light becomes easier to see in |
| Bee | Trichromatic, but ultraviolet, blue and green — no red | Close to human, slightly softer | Red disappears; UV nectar guides appear on the flowers |
| Eagle | Tetrachromatic, including ultraviolet | Far above human vision | Distant book spines sharpen; detail leaps out |

## Why the room contains what it contains

Every object is there to make one difference visible — nothing is decoration for its own sake:

- **The red ball (a dog toy) on the green rug**: tests red–green distinction. Humans see red against green; dogs do not.
- **The vase of flowers on the coffee table**: tests ultraviolet. Bees navigate by UV patterns in flower centres that human eyes cannot see at all.
- **The wooden bookshelf on the right, with rows of differently coloured spines**: tests sharpness. The farther away, the bigger the gap between dog, cat and eagle.
- **The grey fabric sofa, wooden coffee table, floor lamp, curtains, window, plants and TV cabinet**: they make the room a real home first, so the comparison means something. Nothing in it belongs in a lab.

## A note on the science — what this is not

This is an **approximation**, not a recording of what an animal experiences. No screen can show you another animal's subjective experience. What it can do is translate published measurements into something human eyes can read:

- Dichromatic vision in dogs and cats uses a Machado / Brettel-style simulation, converted from each species' measured cone peaks (dog around 429 and 555 nm, cat around 450 and 555 nm), applied uniformly across the whole image — not just recolouring the ball.
- Blur follows acuity: about 20/75 for dogs, lower for cats, sharpening for eagles. Brightness is preserved during the colour conversion, so that changing a colour does not darken or yellow the whole room and hide the real colour difference.
- **Ultraviolet cannot be genuinely reproduced on an ordinary screen.** Screens emit no UV, and ordinary photographs contain no UV information. So the nectar-guide pattern on the flowers in the bee frame is an **illustration**: UV patterns on real flowers do exist, and the drawn shape follows their typical form, but it was not "recovered" from the photograph.
- Likewise, the eagle's ultraviolet vision is not drawn separately — its difference from human vision here is shown through sharpness, which is what the image can honestly convey.

If anything here disagrees with the literature, please open an issue — with a source, if you have one.

## Project structure

```text
animal-vision/
├── index.html                 # Chinese-first showcase page, EN toggle top right
├── README.md                  # Chinese version (shown on the GitHub homepage)
├── README.en.md               # English version (this file)
├── assets/
│   ├── demo.gif               # Five-view looping comparison (960×680, 1.6 MB)
│   └── living-room-base.png   # The living room base image
└── build_demo.py              # Script that generates demo.gif (Pillow + NumPy)
```

`build_demo.py` works from a single base image: all five views are colour / sharpness / brightness transforms of the same photograph, so only the "eyes" change between frames — the room itself never does.

To regenerate the animation:

```bash
pip install pillow numpy
python3 build_demo.py
```

## Current scope

This first version does one thing: **one fixed living room, five kinds of eyes, side by side**. No photo uploads, no live camera, no night mode — those can come later. First, get this one scene right.

## License

MIT
