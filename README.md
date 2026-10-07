> [!CAUTION]
> Everything in `src/` ends up on the public website. Don't include confidential information, such as unpublished
> results or plans from proposals under review, even within comments.

> [!CAUTION]
> The website shows the current state of the Research Unit only. Add people, results and news only once they are
> public.

> [!CAUTION]
> All commits to `main` are immediately deployed to the live website at https://mature-ai.de. If you want to change
> something, please create a pull request first.

## 📁 Directory Structure
* **Content**: news and subproject pages live in `src/content/`, people and publications in `src/data/`.
* **Images**: portraits go in `src/assets/people/`, figures in `src/assets/figures/`, photos in `src/assets/images/`.
  Commit the original image; the build resizes and converts it.

## Workflow
If you want to change something, create a branch and open a pull request.
The CI pipeline automatically checks whether the website still builds.
The build checks all content and stops with a message that names the file if a field is missing or a code is wrong.
If you are sure your change is good, you can merge the pull request on your own.
**All pushes to `main` are deployed to the live website via GitHub Pages, so be careful with pushing to `main`.**

## How do I add...
### ...news?
Create a new file in [src/content/news](src/content/news).
You can copy an existing file, but make sure to adjust all metadata.
To keep everything sorted, prefix the file name with the date, for example `2026-11-18-fall-workshop.md`.

```md
---
title: Fourth annual fall workshop
date: 2026-11-18
kind: event            # event | talk | award | publication | press | milestone
summary: One or two sentences shown in the list.
subprojects: [C]       # optional
---
```

Text below the metadata gets a page of its own, for example a talk abstract.
Add `link` with `href` and `label` for an external link, and `precision: month` to show only the month.

### ...a new publication?
Add an entry to [src/data/publications.yaml](src/data/publications.yaml).
The website sorts publications by year, so the position in the file doesn't matter.

```yaml
- id: surname2026keyword        # unique
  title: Title as published
  authors: [First Author, Second Author]
  venue: Journal or conference, volume, pages
  year: 2026
  type: journal                 # journal | conference | workshop | preprint | thesis | dataset | chapter
  subprojects: [M2, T2]
  doi: 10.xxxx/xxxxx            # or url, if there is no DOI
```

The publication appears on the publications page and on the pages of the subprojects you list.
Optional fields:
- `status: accepted` for accepted papers that are not yet published.
- `equal: 2` if the first two authors contributed equally.
- `award: Best Paper Award` for a badge.
- `highlight: 3` and `short: ICLR` to show the paper among the highlights on the home page.

Authors who are in `people.yaml` are printed in bold.

### ...a new team member?
Add an entry to [src/data/people.yaml](src/data/people.yaml).
You can copy an existing entry, but make sure to adjust all fields.

```yaml
- id: surname
  name: First Last
  focus: One line on the research topic
  group: researcher             # pi | researcher | alumni
  subprojects: [M2]
```

Also add a portrait as `src/assets/people/<id>.jpg` (portrait format, 4:5), only with the person's consent.
A new PI also needs to be added to `pis` in the subproject's file.

### ...a former member?
Set `group: alumni` in the person's entry.
Optionally, add a `note`, for example on a completed doctorate.

### ...or change a subproject page?
Edit the subproject's file in [src/content/subprojects](src/content/subprojects).
The metadata at the top holds the title, the PIs and the work packages, and the text below is the short description.
In a work package, `papers` takes ids from `publications.yaml`.
Take figures only from the team's own papers or reports, and name the source in `credit`.

## 🛠️ Development
You need Node.js 22.12 or newer and npm.

To install the dependencies, run
```
npm ci
```
once in the root directory of the repository.

Then start the local server with live reload:
```bash
npm run dev
```
Visit `http://localhost:4321`.

## Production Build
Generate the static site:
```bash
npm run build
```
The website is written to `dist/`.
The build also writes a copy that opens without a web server to `release/for5339-website/`.
Use `npm run build:web` to build only `dist/`.
