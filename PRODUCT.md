# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML, CSS, and JavaScript. No framework, build step, or third-party tracker. Published on GitHub Pages. Confirmed by the existing site and the redesign brief.

## Users

Duang’s household. The learner is referred to only as Duang / 端端. A parent or Duang opens the site on a phone inside WeChat, or on a laptop, to tap a lesson and hear it.

## Product Purpose

A home listening library: English words and stories, and Chinese pinyin, each opening as a page you can tap to hear. Success is finding the right lesson quickly and hearing the word at normal or slow speed.

## Positioning

The pages are Duang’s own listening cards, with the family’s pixel-art word pictures and recordings already on the site. Progress stays on the device.

## Operating Context

Public GitHub Pages site. Lessons are separate static pages linked from the home catalog. The English A–Z Word Bank is the review course: 103 words, 26 letter units, audio files beside the page. Practice happens at home, often on a phone.

## Capabilities and Constraints

- Home catalog lists every current lesson: titles, dates, previews, and links unchanged.
- Word Bank plays `*_n.mp3` (正常) and `*_s.mp3` (慢速). The picture plays normal speed. Letter anchors are `#LA` through `#LZ`. Unit X is box, fox, six, wax, noted 结尾是 x.
- Words heard are stored only in localStorage on this device.
- An optional practice view can hide Chinese until it is tapped.
- Pixel icons exist for 46 words. The other words use a typographic tile until a matching png is added.
- Do not publish photos, a real name, a birthday, an address, or anything from private home or family folders. The public name is Duang / 端端.
- Other lesson pages stay as they are; links to them keep working.
- Inferred, from the brief’s device note: old WeChat WebViews need a solid panel color when backdrop-filter is missing.

## Brand Commitments

- Public name: Duang / 端端. Wordmark: Hello Duang.
- No mascot and no pixel or monospace wordmark.
- Word pictures are the family’s pixel art, not worksheet clipart.
- Binding visual constraint from the owner: Apple frosted-glass material, one accent, system font stack, a contemporary international education layout.

## Evidence on Hand

- Lesson list and copy in `index.html` (`CARDS`).
- 103 words with IPA and Chinese in `eng/wordbank_az.html`, matching `words.tsv`.
- Audio in `eng/wordbank_az_audio/`.
- Pixel icons supplied as `pixel-icons/<word>.png`, published from `eng/wordbank_az_img/`.
- Tone Perfect credit for the Mandarin audio, already on the home page.
- Absence: no child photo, no biography, and no icons yet for 57 words.

## Product Principles

- The listening control is the product. Show a word that can actually be heard.
- Keep every existing lesson reachable, with its title, date, and link.
- Remember hearing on this device only.
- Say Duang, and nothing more personal.
- Phone and WeChat are the first screen, not a reduced desktop.

## Accessibility & Inclusion

Large tap targets, visible keyboard focus, text alternatives for the pictures, and motion that turns off when the system asks for less. Chinese and English share one system font stack so both scripts stay native to the device.
