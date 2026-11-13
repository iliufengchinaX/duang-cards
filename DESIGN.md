---
name: Hello Duang
description: A home listening library on frosted morning glass, with one sapphire accent.
colors:
  sapphire: "#0b57d0"
  sapphire-wash: "rgba(11, 87, 208, 0.1)"
  mist: "#e4edf7"
  ink: "#1d1d1f"
  ink-soft: "#3a3a3c"
  paper: "#ffffff"
  hairline: "rgba(22, 34, 51, 0.1)"
  frame: "rgba(22, 34, 51, 0.06)"
  glass-solid: "rgba(247, 249, 252, 0.94)"
  glass-frost: "rgba(255, 255, 255, 0.56)"
  bar-solid: "rgba(244, 247, 251, 0.96)"
  bar-frost: "rgba(244, 247, 251, 0.72)"
  sun: "rgba(255, 214, 176, 0.95)"
  sky: "rgba(156, 196, 255, 0.9)"
  pool: "rgba(210, 228, 255, 0.85)"
  ember: "#7a2e1f"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "clamp(44px, 7vw, 68px)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "clamp(36px, 5vw, 52px)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "28px"
    fontWeight: 600
    letterSpacing: "-0.03em"
  unit:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "32px"
    fontWeight: 600
    letterSpacing: "-0.03em"
  word:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "normal"
  mark:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "clamp(46px, 6vw, 72px)"
    fontWeight: 300
    lineHeight: 0.9
    letterSpacing: "-0.03em"
  ipa:
    fontFamily: '"Lucida Grande", "Segoe UI", "Noto Sans", "Arial Unicode MS", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  play: "12px"
  button: "14px"
  thumb: "16px"
  tile: "18px"
  row: "22px"
  panel: "28px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  card-gap: "14px"
  md: "16px"
  lg: "22px"
  xl: "28px"
  section: "72px"
components:
  button-primary:
    backgroundColor: "{colors.sapphire}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "48px"
  play-normal:
    backgroundColor: "{colors.sapphire}"
    textColor: "{colors.paper}"
    rounded: "{rounded.play}"
    height: "44px"
  play-slow:
    backgroundColor: "{colors.sapphire-wash}"
    textColor: "{colors.sapphire}"
    rounded: "{rounded.play}"
    height: "44px"
  practice:
    backgroundColor: "rgba(255, 255, 255, 0.72)"
    textColor: "{colors.sapphire}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  practice-pressed:
    backgroundColor: "{colors.sapphire}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  tag:
    backgroundColor: "{colors.sapphire-wash}"
    textColor: "{colors.sapphire}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "24px"
  lesson-card:
    backgroundColor: "{colors.glass-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "22px 22px 20px"
  word-card:
    backgroundColor: "{colors.glass-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "12px"
  subject-list:
    backgroundColor: "{colors.glass-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "6px"
  nav-link:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px"
  nav-link-current:
    textColor: "{colors.sapphire}"
    rounded: "{rounded.pill}"
    padding: "8px"
  rail-key:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "36px"
  rail-key-current:
    backgroundColor: "{colors.sapphire}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    size: "36px"
---

# Design System: Hello Duang

## Overview

**Creative North Star: "The Morning Window"**

Hello Duang is a home listening library that reads as a course and plays as a lesson. The room is a morning window: cool mist for the ground, a warm sun washing the upper left, a cool sky washing the upper right, and a pale cool pool sitting low and toward the center. Panels are large, quiet, and slightly lifted. Sapphire is the only accent, reserved for the action, the current place, and the sound that is playing. The page is light only, open rather than dense, and the phone width is the first layout.

Glass is the material. Panels and the top bar each ship a nearly opaque fill, then, where backdrop-filter exists, a blur and a saturate over a more transparent white. Support is probed at a 12px blur; the paints that actually run are a 22px blur at 1.7 saturation on panels and a 20px blur at 1.6 saturation on the bar. Depth stays soft: a contact shadow, a wide lift with negative spread, and a white inset along the top of a panel.

Chinese and English share one system sans stack, so both scripts stay the faces the device already has. The wordmark is that stack at body size, semibold, tracked tight. There is no mascot and no second display face. A lesson announces itself with a light-weight mark; a word without a family pixel keeps the picture frame and shows a light sapphire letter. The pixel files are household pictures, rendered crisp, and they sit outside the type system.

**Key Characteristics:**

- Cool mist ground with a warm sun, a cool sky, and a lower pale pool
- Frosted panels with a 28px radius, a hairline, a soft offset shadow, and a solid fallback
- One sapphire accent for the action, the current place, and the card that is playing
- One system sans stack for both scripts, with light-weight letters beside the family pixels
- A phone-width column first, a 48px primary action, and 44px play controls
- Lifts and the playing bars only when the system allows motion

## Colors

A cool, light room. One sapphire does the pointing. Everything else is mist, ink, glass, or window light. The scheme is light only.

### Primary

- **Listening Sapphire** (`#0b57d0`): The accent. It colors the listening word in the home headline, the filled primary action, the current directory item, the current letter key, unit titles, the first letter of a word, phonetic text, text links, and the ring around the card that is playing.
- **Sapphire Wash** (`rgba(11, 87, 208, 0.1)`): The quiet form of the same accent. Lesson tags, the occasional unit note, and the slow-speed key sit on this wash with sapphire text.

### Neutral

- **Window Mist** (`#e4edf7`): The page ground and the browser theme color. Fixed light pools sit on top of it.
- **Graphite Ink** (`#1d1d1f`): Primary text, the wordmark, lesson marks, and word names.
- **Soft Graphite** (`#3a3a3c`): Supporting copy: the lede, previews, counts, dates, and the Chinese gloss.
- **Tile White** (`#ffffff`): Text on filled sapphire, and the solid well behind a family pixel.
- **Cool Hairline** (`rgba(22, 34, 51, 0.1)`): Borders on glass, the bar, and the rail; the meter track; the hairline between subject rows.
- **Picture Frame** (`rgba(22, 34, 51, 0.06)`): The lighter hairline around a word picture and the small pixel thumbs.
- **Solid Glass** (`rgba(247, 249, 252, 0.94)`): Panel fill when blur is unavailable. Lesson cards, the continue instrument, the subject list, and word cards start here.
- **Frosted Glass** (`rgba(255, 255, 255, 0.56)`): The same panels once backdrop-filter is supported, with a 22px blur and 1.7 saturation.
- **Solid Bar** (`rgba(244, 247, 251, 0.96)`): The sticky top bar before blur.
- **Frosted Bar** (`rgba(244, 247, 251, 0.72)`): The top bar with a 20px blur and 1.6 saturation.
- **Warm Sun** (`rgba(255, 214, 176, 0.95)`): The upper-left pool. A radial wash that fades out by 68% of its radius.
- **Cool Sky** (`rgba(156, 196, 255, 0.9)`): The upper-right pool, fading by 70%.
- **Lower Pool** (`rgba(210, 228, 255, 0.85)`): The pale cool wash low in the page, fading by 70%. It is ground light, in the same family as the sky, and it is not an accent.

### Semantic

- **Kiln Ember** (`#7a2e1f`): Playback failure only. A 2px ring on the word card and the 13px semibold retry line.

### Named Rules

**The One Sapphire Rule.** Sapphire is the only accent. It colors the listening word in the headline, the primary action, the current navigation item, the current letter, unit titles, tags, the slow-speed key, links, and the ring on the card that is playing. The sun, sky, and lower pool are light on the ground, not accents.

**The Solid Fallback Rule.** Every blurred surface declares a nearly opaque fill in the base rule. The blur, the saturation, and the more transparent fill apply only inside support for backdrop-filter. A panel still has to read when the filter is missing.

## Typography

**Display, headline, title, body, label, and mark:** the system sans stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", "Noto Sans CJK SC", Cantarell, sans-serif`).

**IPA:** `"Lucida Grande", "Segoe UI", "Noto Sans", "Arial Unicode MS"`, then the same system stack.

**Character:** One stack for Chinese and English, slightly tight at display sizes, regular at reading size. SF Pro Text and SF Pro Display appear in that stack because they are the system faces; they are not a separate display ramp. The light weight is reserved for oversized letters. The wordmark Hello Duang is the body size at weight 600 and −0.03em tracking.

### Hierarchy

- **Display** (600, `clamp(44px, 7vw, 68px)`, line-height 1.02, −0.04em): The home headline. Balanced wrap. One word of it may be sapphire.
- **Headline** (600, `clamp(36px, 5vw, 52px)`, line-height 1.05, −0.03em): The course title on the word bank.
- **Title** (600, 28px, −0.03em): Section headings, the continue heading, and the footer heading. Balanced wrap.
- **Unit** (600, 32px, −0.03em): The letter heading of a word-bank unit, set in sapphire.
- **Word** (600, 30px, line-height 1.1, −0.03em): The word name on a listening card. The initial letter is sapphire; the rest is ink.
- **Body** (400, 17px, line-height 1.5): Page text and the primary action’s label. The home lede measures about 38em; the continue detail about 40em; the footer lead about 42em. The credit runs to 68ch at 13px.
- **Label** (600, 14px): Facts under the course title, and the heard-count. Directory links are the same size at weight 500, rising to 600 when current. Dates and subject counts use tabular figures.
- **Mark** (300, `clamp(46px, 6vw, 72px)`, line-height 0.9, −0.03em): The lesson’s letter mark, in ink. Strings of six characters or more step down to `clamp(30px, 4vw, 46px)` at the same weight and tracking. The missing-picture letter is the same weight in sapphire, at 64px (84px from 960px), line-height 1, tracking −0.04em.
- **IPA** (400, 16px, line-height 1.3): Phonetic spelling only, in sapphire, on the phonetic face.

### Named Rules

**The One Stack Rule.** Chinese and English share the system sans stack. Do not add a display face, a serif, or a monospace wordmark. The phonetic face is only for IPA.

**The Light Letter Rule.** Oversized letters stay in the system stack at weight 300. A lesson mark is ink. The letter that stands in for a missing pixel is sapphire, inside the picture frame. Pixel files are not type.

## Layout

The column is centered and measures `min(1120px, calc(100% - 32px))`: 16px of side air. The top bar is sticky, 60px tall, growing to 64px from 960px, and both heights add the top safe-area inset. Page padding and the footer add the bottom safe-area inset. Sections land 72px apart, 96px from 800px, and the footer opens with 88px. Scroll margins clear the bar, plus the letter rail while that rail is horizontal.

The first screen is a single band. Headline and primary action share a row that may wrap; the continue instrument is a full-width glass panel under them, not a side-by-side mockup. Inside that panel the gap is 18px. From 700px the panel becomes two tracks, `minmax(0, 1.15fr)` and `minmax(280px, 0.85fr)`, with 26px of padding. Subject rows are one column until 700px, then two, and the dividing hairline moves from the top of the next row to the shared vertical edge. Lesson cards are one column until 800px, then two; a featured lesson spans both and lines up as mark, copy, and thumbs.

On the word bank the letter rail is a horizontal strip under the bar until 960px. From 960px the player is a 76px rail plus a 28px gap beside the sheets, and the word list becomes two columns. Word cards stack with a 14px gap. A phone word card is a 104px picture plus the name, with the two play keys on the next row (padding 12px, column gap 14px). From 960px the picture grows to 148px and the play keys sit beside it (padding 16px).

The meter is a 3px pill, at most 240px wide. The continue link, the lede, and the facts sit in the instrument’s text column with 12px to 14px between those lines.

### Named Rules

**The Column Rule.** Content sits in a centered column, min(1120px, 100% − 32px). The first screen is one band: headline, primary action, then a full-width glass instrument. Two columns start at 700px for the continue instrument and the subject list, at 800px for lesson cards, and at 960px for a vertical letter rail beside the words.

## Elevation & Depth

Depth is soft and close. The ground does the atmosphere; panels only lift enough to separate from the mist. The shadow ink is a cool navy at low alpha, `rgba(28, 45, 74, …)`, not pure black. Hover, when a fine pointer is available and motion is allowed, raises a lesson card or a glass word card by 3px and the primary button by 1px, over 180ms. A press scales the button, a play key, or a picture to 0.98. Revealed blocks rise 12px in 640ms on `cubic-bezier(0.16, 1, 0.3, 1)`. Reduced motion removes transitions, the rise, the hover lift, and the bar animation; the three bars rest at 70% height.

Keyboard focus is a 2px sapphire outline, 3px outside the control. The skip link is the one control that uses `:focus` rather than `:focus-visible`, so it can move on screen.

### Shadow Vocabulary

- **Panel** (`box-shadow: 0 1px 2px rgba(28, 45, 74, 0.05), 0 18px 44px -24px rgba(28, 45, 74, 0.38)`): Resting glass, lesson cards, and the letter rail.
- **Inset light** (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7)`): Added on glass panels, not on the rail. It is the bright top edge of the glass.
- **Action** (`box-shadow: 0 10px 22px -12px rgba(11, 87, 208, 0.85)`): The filled primary button only.
- **Playing** (`box-shadow: 0 0 0 2px #0b57d0, 0 16px 36px -18px rgba(11, 87, 208, 0.55)`): Replaces the resting shadow on the word card while its audio plays.
- **Error** (`box-shadow: 0 0 0 2px #7a2e1f`): Replaces the resting shadow when playback fails.

### Named Rules

**The Soft Offset Rule.** Resting glass uses one stacked shadow: a 1px contact shadow and a wide lift with negative spread, plus a white inset hairline on panels. The primary button carries a shorter sapphire lift. The playing card replaces the resting shadow with a 2px sapphire ring.

## Shapes

Corners are large on panels and fully round on anything that is a key, a tag, or a meter. The ground washes are circles, each blurred by 8px, and they are scenery rather than controls.

Panels, lesson cards, and word cards use the 28px radius. Subject rows use 22px, and so does the vertical letter rail from 960px. The horizontal phone rail attaches under the bar with square top corners and 20px bottom corners. Picture frames are 18px; the 64px pixel thumbs on a featured lesson are 16px. The primary button is 14px. Play keys are 12px. Directory hits, tags, the practice control, letter keys, and the meter are pills (999px).

A word card nested inside the continue panel drops its own fill, border, shadow, and padding, and keeps the 28px radius. The parent panel is the glass.

### Named Rules

**The Panel Radius Rule.** Listening panels, lesson cards, and word cards share the 28px radius. Subject rows and the desktop letter rail use 22px. Picture frames use 18px, the small pixel thumbs 16px, the primary button 14px, and play keys 12px. Nav hits, tags, the practice control, letter keys, and meters are pills.

## Components

### Buttons

The primary action is a filled sapphire control, confident and large enough for a thumb. It is the only button with the action shadow.

- **Shape:** Gently rounded (14px).
- **Primary:** Sapphire fill, white label, 17px, weight 600, tracking −0.01em, padding `0 20px`, minimum height 48px, inline with an 8px gap. The label is sentence case, not a kicker and not small caps.
- **Hover / Focus:** On a fine pointer, with motion allowed, it lifts 1px. Press scales to 0.98. Focus is the 2px sapphire outline, 3px out. There is no second fill color.
- **Practice:** A pill, 44px tall, padding `0 16px`, 15px semibold. At rest it is white at 72% opacity, a hairline border, and sapphire text. Pressed, it fills with sapphire and white text, and the border disappears.
- **Play, normal:** Sapphire fill, white label, 12px radius, minimum height 44px, 15px semibold, a 6px gap. A small triangle sits before the word 正常.
- **Play, slow:** Sapphire wash, sapphire text, same size and radius. No triangle at rest.

### Chips

- **Style:** Lesson tags are a sapphire-wash pill, sapphire text, 12px, weight 600, fixed height 24px, padding `0 8px`.
- **State:** Tags do not toggle. A unit note uses the same wash and sapphire text at 13px, with padding `3px 10px`, when a unit needs a short remark.

### Cards / Containers

Lesson cards and word cards are the glass panels. Both use the solid glass fill, the hairline, the 28px radius, the panel shadow, and the inset light, then the frosted fill where blur exists.

- **Lesson card:** Padding `22px 22px 20px`. The mark leads. Meta is 13px soft graphite: a tag, a count, and a tabular date. The title is 20px, weight 600, tracking −0.02em, line-height 1.3. The preview is 15px, line-height 1.45, soft graphite. Hover lifts the card 3px. A featured lesson adds a row of 64px thumbs.
- **Word card:** Phone padding 12px. The picture button is 104px (148px from 960px). The two play keys share the bottom row, 8px apart. Hover lifts the glass card 3px.
- **Subject list:** One glass panel, 6px of inner padding. Each row is 22px radius, padding `16px 18px`. The name is 22px semibold; the gloss is 14px soft graphite; the count is sapphire, semibold, tabular. Hover washes the row with white at 45% opacity.
- **Inset word:** The listening card inside the continue panel is not a second sheet of glass. Fill, border, and shadow are cleared.

### Meter

A 3px-tall pill, no wider than 240px. The track is the cool hairline; the fill is sapphire and inherits the pill radius. It reports how many words have been heard on this device.

### Navigation

The top bar carries the wordmark and a horizontally scrolling directory. The wordmark is 17px, weight 600, tracking −0.03em, ink, nowrap. Directory links are 14px, weight 500, pill padding 8px, gap 2px. The current page is sapphire at weight 600, with no pill fill. On the word bank the current item is marked in the directory.

The letter rail is a sticky strip of 36px circles, 14px semibold. The current letter is a sapphire pill with white text. Below 960px the rail sticks just under the bar, uses the phone corner treatment (square top, 20px bottom), and paints `rgba(244, 247, 251, 0.94)` even when blur is on. From 960px it is a vertical glass rail, 22px radius, padded 8px, using the frosted panel fill where blur exists.

The continue link is sapphire, weight 600, with no underline. Credit links are sapphire and underlined, with the underline 3px off the text. The sheet footer link is sapphire, weight 600, with no underline.

The skip link sits off screen until focused, then lands at the top in tile white with ink text, padding `8px 12px`, and a 10px radius.

### Word picture

Family pixels are assets, not icons and not a type style. The frame is 18px, with the picture-frame hairline. A real pixel gets a tile-white well and is drawn at 86% of the frame, `image-rendering: pixelated` and `crisp-edges`. Thumbs are the same rendering at 64px, contained, on tile white, with a 16px radius. A missing pixel keeps the frame, fills it with white at 42% opacity, and centers the light sapphire letter.

The picture button and the 正常 key both start playback at normal speed.

### Named Rules

**The Playing Ring Rule.** The word card that is playing draws a 2px sapphire ring and a sapphire-tinted lift. The active play control hides its triangle and shows three bars in the current text color. A failed card draws a 2px ember ring and shows the retry line in ember.

**The Picture Frame Rule.** A family pixel is contained, crisp, and centered on tile white with the picture-frame hairline. A missing pixel keeps the frame, uses a translucent white well, and shows a light sapphire letter. Do not substitute clipart.

## Do's and Don'ts

### Do:

- **Do** paint the page on window mist and set the warm sun, the cool sky, and the lower pool behind the column.
- **Do** declare the solid glass fill and the solid bar fill first, and add blur only where backdrop-filter is supported.
- **Do** keep sapphire as the only accent. The primary action is filled sapphire, 48px tall, 14px radius.
- **Do** set Chinese and English in the one system stack. Lesson marks and missing-picture letters are weight 300.
- **Do** render a family pixel crisp, contained, on tile white. When the file is missing, keep the frame and use the light sapphire letter.
- **Do** draw keyboard focus as a 2px sapphire outline, 3px outside the control. When the system asks for less motion, drop transitions, lifts, and the bar animation.

### Don't:

- **Don't** add a second accent, a rainbow letter scale, a mascot, or a separate display, serif, or monospace wordmark.
- **Don't** let a panel depend on backdrop-filter for its fill.
- **Don't** use a hard offset shadow. Resting depth is the soft stacked shadow.
- **Don't** treat pixel word pictures as type or as clipart, and don't fill a missing picture with anything other than the light letter in the same frame.
- **Don't** shrink the primary action below 48px, or the play and practice controls below 44px. The 36px letter keys belong to the rail only.
