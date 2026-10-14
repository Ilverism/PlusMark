# PlusMark
<sup>ver. 2026-10.13 (Beta)</sup>

<br>
🔧 This document and service are both a work in progress.

---
### About

PlusMark provides a way for you to **embed inline reactions** inside MarkDown files.

Reactions are rendered as images that appear around or alongside other text; when clicked, users are temporarily brought to an external page where they can verify & submit their vote, before being automatically redirected back to the source page.

The MarkDown content will not actually be changed in any way. Instead, the image contained in the link will be updated.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-8e8b72858473d86a&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### Usage

##### Creating new reactions & adding them to files:
1. Use the **Add Reaction** button to add all of the new reactions you want, then choose their names and icons.
2. Paste/enter the **Return URL** where the user will be redirected to when clicked _(should be the same page where the reactions will be displayed)_.
3. Enter the **Content ID**<sup>1</sup> & **Reaction Group ID**<sup>2</sup>, which are used to identify the group of generated reactions.
4. Click the **Generate** button.
5. Click the **Copy** button, then paste the generated Markdown content into your document.

<sup>1.</sup> *Identifies the page/content where the Reactions will be entered. By default, this will be an automatically-generated reformatted copy of the Return URL.*

<sup>2.</sup> *A unique identifier for the specific group of Reactions being generated. Including this helps support the inclusion of multiple reaction groups in a single page/document.*

<br>

##### Voting on reactions in files:
1. Click on the badge to begin updating your vote.
2. Wait for the Cloudflare Turnstile to verify your visit.
3. Optional: Use the checkbox to temporarily submit future reactions automatically *(useful if you plan to interact with multiple reactions in succession).* Automatic vote submissions can be halted by pressing **Esc** or using the **Cancel** button.
4. Click the **Submit Reaction** button.
	If you haven't voted on the reaction before, its count will increase by one. If you already have, the vote will be removed and the count will decrease by one.
5. You will then be automatically redirected to the **Return URL**.. If configured correctly, this should link to the same place where you clicked on the badge.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-064cf98394b0d940&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### Reactions, Badges, and Formatting

* Multiple *reactions* can be added to a group at once. By default, the generator page will include **👍 Thumbs Up** and **👎 Thumbs Down** reactions.
* New reactions can be added by clicking the **Add Reaction** button. Existing ones can be removed by clicking the symbol on the top right of the corresponding card.
* Each reaction has an emoji, name, and description that can be modified.

<br>

* Users can choose to include/exclude "extra" pieces of information when generating the badges with additional options:
	* **Include ID tag**: Adds an additional string of text to identify the full ID (Content ID + Reaction Group ID) for the reaction group: <br><sup><sub><code>example-content-g-0123456789abcdef</code></sub></sup>
	* **Include source badge**: Adds an additional badge that displays the selected Return URL and the target site's icon (if applicable). This takes up more space, but can help voting users know if the reactions will actually link to the correct site.
	* **Include PlusMark badge**: Links to the [PlusMark](https://plusmark.ilverism.workers.dev/) site.


<br>

* Several **Formatting** options are available, which change how the badges are presented inside the document: *Row, Column, Table (No descriptions), Table (With descriptions)*. Examples will be provided below.
* A **Badge Theme** can be selected, which changes the background and border colors of the rendered badges. There are 3 currently available: *Light, Dark, Soft Dark* (based on GitHub color theme options). The site will automatically default to *Light* or *Dark* based on your browser theme settings.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-0b88b18290da5de3&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### Badge Format Examples

* Include ID tag: ***On***
* Include source badge: ***On***
* Include PlusMark badge: ***On***
* Badge Theme: ***Light***

***Row*** *formatting*:

[![🔥 Fire](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire) [![❤️ Red Heart](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart) [![🤔 Thinking Face](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face) [![🐈 Cat](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&theme=light&v=2)](<https://github.com/Ilverism/PlusMark>) [![PlusMark](https://plusmark.ilverism.workers.dev/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/)

<sup><sub><code>github-com-ilverism-plusmark-g-8801fd4a28884c70</code></sub></sup>

***Column*** *formatting*:

[![🔥 Fire](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire)

[![❤️ Red Heart](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart)

[![🤔 Thinking Face](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face)

[![🐈 Cat](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat)

[![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&theme=light&v=2)](<https://github.com/Ilverism/PlusMark>)

<sup><sub><code>github-com-ilverism-plusmark-g-8801fd4a28884c70</code></sub></sup>

[![PlusMark](https://plusmark.ilverism.workers.dev/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/)


***Table (No descriptions)*** *formatting*:

|                                                                                                             Fire                                                                                                             |                                                                                                                  Red Heart                                                                                                                  |                                                                                                                      Thinking Face                                                                                                                      |                                                                                                            Cat                                                                                                            |                                                                                                                                                  Source                                                                                                                                                  |                                                    PlusMark                                                     |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------: |
| [![🔥 Fire](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire) | [![❤️ Red Heart](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart) | [![🤔 Thinking Face](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face) | [![🐈 Cat](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat) | [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&theme=light&v=2)](<https://github.com/Ilverism/PlusMark>)<br/><sup><sub><code>github-com-ilverism-plusmark-g-8801fd4a28884c70</code></sub></sup> | [![PlusMark](https://plusmark.ilverism.workers.dev/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/) |

***Table (With descriptions)*** *formatting*:

|                                                                                                             Fire                                                                                                             |                                                                                                                  Red Heart                                                                                                                  |                                                                                                                      Thinking Face                                                                                                                      |                                                                                                            Cat                                                                                                            |                                                                                                      Source                                                                                                       |                                                    PlusMark                                                     |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------: |
| [![🔥 Fire](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=fire) | [![❤️ Red Heart](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=red-heart) | [![🤔 Thinking Face](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=thinking-face) | [![🐈 Cat](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&r=cat) | [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-8801fd4a28884c70&theme=light&v=2)](<https://github.com/Ilverism/PlusMark>) | [![PlusMark](https://plusmark.ilverism.workers.dev/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/) |
|                                                                                                       This is awesome!                                                                                                       |                                                                                                                I love this!                                                                                                                 |                                                                                                                        I see...                                                                                                                         |                                                                                                        Uh... Meow?                                                                                                        |                                                                <sup><sub><code>github-com-ilverism-plusmark-g-8801fd4a28884c70</code></sub></sup>                                                                 |                                                                                                                 |

Note that some formats may appear broken or different from what is expected depending on the renderer.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-6ea7d017695fb797&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### Supported Sites/Content

For PlusMark to work, the target document must be able to render images from foreign URLs. Because of this, some sites, such as Reddit, cannot be used properly with PlusMark. Additionally, sites may cache images, freezing or delaying the displayed vote counts for viewers compared to the actual values.

The columns below will be updated after verifying the support status of other sites.

| Supported         | Partially Supported | Unsupported       |
| ----------------- | ------------------- | ----------------- |
| • GitHub<br>• ... | • ...               | • Reddit<br>• ... |

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-ae6e19df558a1c0e&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---

### Other Features

* All generated badges include a semi-unique color gradient based on the Return URL. These help viewers confirm that the reactions correspond to the correct/expected Return URL when the **Include source badge** option is enabled. <img width="24" height="24" alt="PlusMarkDotExample" src="https://github.com/user-attachments/assets/3f830fa1-886b-4fc9-93f6-718cec93c325" />
* The **Reject votes from other URLs** option (enabled by default) helps protect against a limited number of cases where the voter's Referer header has a mismatch with the Return URL. This **cannot** be used to reliably ensure that a vote is coming from the same page as the Return URL.
* Reactions with large counts will have their displayed values truncated. For example, reactions with `2,300` and `2,367` votes will both display `2.3k` in the image.
* Reactions with an extreme number of updates in a short period will temporarily go into a rate-limited mode: All votes are still recorded, but the reaction's image will only be regenerated periodically. Rate-limited badges will appear with an hourglass icon.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-a7094a2930aa0ee8&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### Usage Warnings

- Anyone can duplicate and use any generated reactions in any document. This can be partially mitigated by keeping **Reject votes from other URLs** enabled.
- Reactions are vulnerable to being spammed. The same user using multiple browsers or devices can interact with the same reaction multiple times.
- Existing protections are intended to guard against automated crawlers and bot activity, and may not be effective against targeted spam efforts.
- If you close the tab after generating your reactions, they can no longer be edited. A new set of reactions will need to be generated with a new Reaction Group ID.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-0878d9438b08be3a&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### Usage Guidelines

- **Do not** use PlusMark to promote or vote on hateful, inappropriate, or harmful content.
- **Do not** use PlusMark to manipulate, harass, or mislead others.
- **Do not** use PlusMark excessively or in a way that could be considered spammy.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-de7d614d04dcabee&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### Data Collection

| Stored Data                                                           | Retention & Expiration                                                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaction groups, Return URLs, counts, and active hashed voter records | **No automatic expiry.** Removing a vote deletes its active record; removing a reaction deletes its associated votes.                               |
| Aggregate service statistics                                          | No automatic expiry.                                                                                                                                |
| Browser identity cookie                                               | Up to **400 days**, unless cleared earlier. Expiry does not delete stored votes.                                                                    |
| Verification and automatic-submission permission                      | **1 hour** from verification.                                                                                                                       |
| Submission/cancellation records                                       | Expire after **10 minutes**, but deletion happens during subsequent requests and not on a timer. Inactive groups can retain expired records longer. |
| Saved browser preferences                                             | Remain until removed or browser storage is cleared.                                                                                                 |
| Browser edit tokens                                                   | Tab-session storage.                                                                                                                                |
| Cloudflare diagnostic logs                                            | Currently **3 days**.                                                                                                                               |

* User data is only used for counting votes and understanding the patterns of problematic actors within the logs to reduce spam and misuse.

* PlusMark is designed to be used without any user accounts or extensions.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-0f5c9263d686790b&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)

---
### AI Disclosure

AI was used to assist in the creation of certain aspects of this service.

[![👍 Thumbs Up](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=thumbs-up)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=thumbs-up) [![👎 Thumbs Down](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=thumbs-down)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=thumbs-down) [![✅ Check Mark Button](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=check-mark-button)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=check-mark-button) [![🧠 Brain](https://plusmark.ilverism.workers.dev/badge?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=brain)](https://plusmark.ilverism.workers.dev/react?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&r=brain) [![Source: https://github.com/Ilverism/PlusMark](https://plusmark.ilverism.workers.dev/source-badge?doc=github-com-ilverism-plusmark-g-17ed37249d274b23&theme=dark&v=2)](<https://github.com/Ilverism/PlusMark>)
