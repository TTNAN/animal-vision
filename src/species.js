// What each eye is, and the numbers the renderer uses.
//
// Scale convention: one CSS pixel stands in for the finest detail a human
// eye resolves. The CSS reference pixel is defined as about 0.0213° seen at
// arm's length, which is ≈ 1.28 arcmin, close to the 1 arcmin limit of 20/20
// vision. So "minimum angle of resolution" (MAR, arcmin) maps to CSS px.
//
// mar     minimum angle of resolution in arcmin (human 20/20 ≈ 1)
// hex     compound-eye facet size in degrees (bee only)
// gain    how much more an eye gets out of dim light than ours
// matrix  colour model in linear RGB (null = keep)
// sat     colour saturation after the matrix

export const ARCMIN_PER_CSS_PX = 1.28;

export const SPECIES = [
  {
    id: 'human', mode: 0, accent: '#e6e1d8', cones: [420, 530, 560], mar: 1, gain: 1, sat: 1, matrix: null,
    name: { zh: '人', en: 'Human' }, latin: 'Homo sapiens',
    facts: {
      zh: [['色觉', '三色：420 / 530 / 560 nm'], ['视力', '20/20，约 30 周/度'], ['视野', '约 200°，双眼重叠 120°'], ['弱光', '参照值']],
      en: [['Colour', 'Trichromat: 420 / 530 / 560 nm'], ['Acuity', '20/20, about 30 cycles/°'], ['Field', '≈200°, 120° binocular'], ['Dim light', 'The reference']],
    },
    line: { zh: '对照组。其余五双眼睛都和它比。', en: 'The control. Every other eye is measured against it.' },
  },
  {
    id: 'dog', mode: 1, accent: '#c8a06a', cones: [429, 555], mar: 3.75, gain: 3.5, sat: 0.95, matrix: 'deutan',
    name: { zh: '狗', en: 'Dog' }, latin: 'Canis familiaris',
    facts: {
      zh: [['色觉', '二色：约 429 / 555 nm，红绿合并'], ['视力', '约 20/75'], ['视野', '约 240°，双眼重叠 60°'], ['弱光', '有反光层，约强 3–4 倍']],
      en: [['Colour', 'Dichromat: ≈429 / 555 nm; red and green merge'], ['Acuity', 'About 20/75'], ['Field', '≈240°, 60° binocular'], ['Dim light', 'Tapetum: roughly 3–4× better']],
    },
    line: { zh: '蓝和黄依然分明，红和绿却成了同一种土黄。', en: 'Blue and yellow survive. Red and green collapse into one khaki.' },
  },
  {
    id: 'cat', mode: 2, accent: '#9fb1c9', cones: [450, 555], mar: 7, gain: 6, sat: 0.55, matrix: 'deutan',
    name: { zh: '猫', en: 'Cat' }, latin: 'Felis catus',
    facts: {
      zh: [['色觉', '二色：约 450 / 555 nm，颜色很淡'], ['视力', '约 20/100–20/200'], ['视野', '约 200°，双眼重叠 140°'], ['弱光', '只需人约 1/6 的光']],
      en: [['Colour', 'Dichromat: ≈450 / 555 nm, washed out'], ['Acuity', 'About 20/100–20/200'], ['Field', '≈200°, 140° binocular'], ['Dim light', 'Needs ~1/6 of our light']],
    },
    line: { zh: '白天的猫是近视的色弱；把光线调到夜晚，它才是主角。', en: 'By day a cat is short-sighted and colour-poor. Turn the light down and it takes over.' },
  },
  {
    id: 'bee', mode: 3, accent: '#a99bdc', cones: [344, 436, 544], mar: 60, hex: 0.5, gain: 0.8, sat: 0.8, matrix: 'bee',
    name: { zh: '蜜蜂', en: 'Honeybee' }, latin: 'Apis mellifera',
    facts: {
      zh: [['色觉', '三色：紫外 344 / 蓝 436 / 绿 544 nm，看不见红'], ['视力', '每个小眼约 1–2°，非常粗'], ['视野', '接近 360°'], ['弱光', '白天活动，弱光很差']],
      en: [['Colour', 'Trichromat: UV 344 / blue 436 / green 544 nm, blind to red'], ['Acuity', 'Each facet ≈1–2°, very coarse'], ['Field', 'Nearly 360°'], ['Dim light', 'Day-active, poor in dim light']],
    },
    line: { zh: '假色显示：绿→红、蓝→绿、紫外→蓝。红色的东西几乎是黑的。', en: 'False colour: green→red, blue→green, UV→blue. Red things go nearly black.' },
    caveat: { zh: '照片里没有紫外信息，紫外通道是按颜色估计的。小眼格子按真实的一半大小画出，方便看清画面。', en: 'Photos carry no UV, so the UV channel is estimated from colour. Facets are drawn at half their real size so the scene stays legible.' },
  },
  {
    id: 'eagle', mode: 4, accent: '#e8d7a8', cones: [405, 450, 505, 565], mar: 0.35, gain: 0.8, sat: 1.15, matrix: null,
    name: { zh: '鹰', en: 'Eagle' }, latin: 'Aquila audax',
    facts: {
      zh: [['色觉', '四色，视锥油滴让颜色更饱和'], ['视力', '约 20/5，是人的 2.5–3.5 倍'], ['视野', '约 200°+，双眼重叠 30–50°'], ['弱光', '白天猎手，夜里不如人']],
      en: [['Colour', 'Tetrachromat; oil droplets saturate colour'], ['Acuity', 'About 20/5, 2.5–3.5× ours'], ['Field', '≈200°+, 30–50° binocular'], ['Dim light', 'A day hunter, worse than us at night']],
    },
    line: { zh: '屏幕画不出比你眼睛更细的东西，所以给你一个放大镜：在右半边移动或按住，借用它的中央凹。', en: 'A screen can\'t show more detail than your eye resolves, so here is a loupe: hover or press on the right half to borrow its fovea.' },
  },
  {
    id: 'mouse', mode: 5, accent: '#c4a59c', cones: [360, 508], mar: 60, gain: 4, sat: 0.5, matrix: 'protan',
    name: { zh: '小鼠', en: 'Mouse' }, latin: 'Mus musculus',
    facts: {
      zh: [['色觉', '二色：紫外 360 / 绿 508 nm，没有红'], ['视力', '约 0.5 周/度，约 20/1200'], ['视野', '约 300°+'], ['弱光', '夜行，视杆为主']],
      en: [['Colour', 'Dichromat: UV 360 / green 508 nm, no red'], ['Acuity', 'About 0.5 cycles/°, ≈20/1200'], ['Field', '≈300°+'], ['Dim light', 'Nocturnal, rod-dominated']],
    },
    line: { zh: '实验室里最常用的眼睛，看到的世界只有一团模糊的明暗。', en: 'The most-studied eye in the lab sees the world as soft blocks of light and shade.' },
  },
];

// Machado, Oliveira & Fernandes (2009), severity 1.0, linear RGB, row-major.
export const MATRICES = {
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
};

export const LIGHTS = [
  { id: 'day', L: 1, name: { zh: '原光', en: 'As shot' } },
  { id: 'dusk', L: 0.15, name: { zh: '黄昏', en: 'Dusk' } },
  { id: 'night', L: 0.04, name: { zh: '夜晚', en: 'Night' } },
];

export const SAMPLES = [
  { id: 'portrait', eye: 'dog', light: 'day', split: 0.69, w: 3840, h: 2560,
    title: { zh: '人像', en: 'Portrait' },
    hint: { zh: '你在宠物眼里长什么样？橙色南瓜还在，红唇和脸色却淡了。', en: 'What do you look like to your pet? The pumpkins survive, the lipstick and the blush fade.' },
    credit: 'Frank Marino', page: 'https://commons.wikimedia.org/wiki/File:In_front_of_pumpkin_shelves_(Unsplash).jpg' },
  { id: 'orchard', eye: 'dog', light: 'day', w: 3840, h: 2561,
    title: { zh: '果园', en: 'Orchard' },
    hint: { zh: '满树的红苹果，到了狗眼里就藏进了叶子。', en: 'A tree full of red apples. To a dog they hide among the leaves.' },
    credit: 'W.carter', page: 'https://commons.wikimedia.org/wiki/File:Tree_with_red_apples_in_Barkedal_1.jpg' },
  { id: 'sunflower', eye: 'bee', light: 'day', w: 3840, h: 2563,
    title: { zh: '向日葵', en: 'Sunflower' },
    hint: { zh: '花在蜜蜂眼里是什么颜色？红背景消失，花盘更像一个靶心。', en: 'What colour is a sunflower to a bee? The flower turns orange-red and the disc becomes a target.' },
    credit: 'Mustang Joe', page: 'https://commons.wikimedia.org/wiki/File:Sunflower_and_bees.jpg' },
  { id: 'valley', eye: 'eagle', light: 'day', w: 3840, h: 2560,
    title: { zh: '山谷', en: 'Valley' },
    hint: { zh: '把鹰的放大镜移到远处的雪山和林线上。', en: 'Move the eagle\'s loupe over the far snowfields and the tree line.' },
    credit: 'Kalen Emsley', page: 'https://commons.wikimedia.org/wiki/File:Wet_mountain_valley_(Unsplash).jpg' },
  { id: 'night', eye: 'cat', light: 'night', w: 3840, h: 2550,
    title: { zh: '夜街', en: 'Night street' },
    hint: { zh: '调到夜晚：人眼只剩路灯，猫还看得见站着的人。', en: 'Switch to night: we see only the lamps, the cat still sees the person.' },
    credit: 'Romain Guy', page: 'https://commons.wikimedia.org/wiki/File:Night_street_in_Udagawach%C5%8D,_Tokyo_(53335292514).jpg' },
  { id: 'cat', eye: 'mouse', light: 'day', w: 3840, h: 2560,
    title: { zh: '猫', en: 'Cat' },
    hint: { zh: '老鼠眼里的猫：只剩一团轮廓，红项圈也没了。', en: 'A cat to a mouse: a soft silhouette, and the red collar is gone.' },
    credit: 'W.carter', page: 'https://commons.wikimedia.org/wiki/File:Young_tabby_cat_keeping_watch.jpg' },
];

export const UI = {
  zh: {
    tagline: '同一个世界，六双眼睛。',
    lede: '拖动中间的线，比较人眼和动物眼里的同一张照片。换一张样图，或者放进你自己的照片。',
    you: '人眼', compare: '对比', grid: '全部', light: '光线', eyes: '眼睛', samples: '样图',
    upload: '用你的照片', uploadSub: '拖进来、粘贴或点选。照片只在你的浏览器里处理，不会上传。',
    download: '保存图片', loupe: '鹰眼放大镜', facets: '复眼', yours: '你的照片',
    scienceTitle: '这些画面是怎么算出来的', credits: '照片', dropHere: '松手，放进这张照片',
    noGL: '你的浏览器不支持 WebGL2，无法处理图像。',
    notes: [
      ['颜色', '狗、猫用 Machado 等（2009）的二色模型；小鼠没有长波视锥，用红盲模型；蜜蜂用假色把紫外、蓝、绿映射到蓝、绿、红。'],
      ['清晰度', '一个 CSS 像素在一臂距离下约 1.28 角分，接近人眼极限，所以把它当作人眼能分辨的最小细节；其它眼睛按各自的最小分辨角放大模糊。'],
      ['弱光', '把光线调暗时，每种眼睛按自己的弱光增益变亮，颜色在暗处先消失，噪点随之出现。'],
      ['局限', '照片没有紫外和温度信息；视野、运动感知和大脑的处理都没有画出来。这里是有依据的近似，不是动物真实的主观体验。'],
    ],
  },
  en: {
    tagline: 'One world, six eyes.',
    lede: 'Drag the line to compare a human eye with an animal\'s on the same photo. Pick a sample, or drop in your own.',
    you: 'Human', compare: 'Compare', grid: 'All six', light: 'Light', eyes: 'Eyes', samples: 'Samples',
    upload: 'Use your photo', uploadSub: 'Drop, paste or choose. It\'s processed in your browser and never uploaded.',
    download: 'Save image', loupe: 'Eagle loupe', facets: 'Facets', yours: 'Your photo',
    scienceTitle: 'How these images are made', credits: 'Photos', dropHere: 'Drop to use this photo',
    noGL: 'Your browser lacks WebGL2, so images can\'t be processed.',
    notes: [
      ['Colour', 'Dogs and cats use the Machado et al. (2009) dichromat model; mice lack a long-wave cone and use the protan model; bees use false colour mapping UV, blue and green to blue, green and red.'],
      ['Sharpness', 'A CSS pixel at arm\'s length spans about 1.28 arcmin, close to the human limit, so it stands in for the finest detail we resolve; other eyes are blurred by their own minimum angle of resolution.'],
      ['Dim light', 'As the light drops, each eye brightens by its own low-light gain; colour fades first and noise creeps in.'],
      ['Limits', 'Photos hold no UV or heat. Field of view, motion and the brain\'s processing aren\'t drawn. These are grounded approximations, not what an animal actually experiences.'],
    ],
  },
};
