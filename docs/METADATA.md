# meta.json reference

Every experience folder has a `meta.json` file. The website builds its listings, search, filters and info panel from it, and `npm run check` validates it.

```json
{
  "title": "Packet Loss",
  "description": "The page you asked for got lost in transit. Route the packet through the maze to 200 OK before its hops run out.",
  "category": "game",
  "tags": ["maze", "svg", "keyboard", "high-score"],
  "interaction": ["keyboard", "mouse", "touch"],
  "author": { "name": "Hossein Shahyari", "url": "https://shahyari.com" },
  "date": "2026-10-31",
  "thumbnail": "thumbnail.webp",
  "permissions": ["storage"]
}
```

The folder name is the experience's ID and URL: `experiences/packet-loss/` is published at `/packet-loss/`.

## Fields

| Field | Required | Format | Notes |
|---|---|---|---|
| `title` | yes | Text, up to 60 characters | Shown on cards, in the top bar and in search results. |
| `description` | yes | Text, up to 200 characters | One or two sentences. Searchable. |
| `category` | yes | One of the categories below | Used by the category filter. |
| `tags` | yes | Up to 8 lowercase-kebab-case words | For example `["canvas", "dark-mode"]`. Each tag gets a filter link. |
| `interaction` | no | List of the values below | How visitors interact. Shown in the info panel. |
| `author` | no | `"Name"` or `{ "name": "Name", "url": "https://…" }` | Credited on the card, the info panel and the About page. The URL must use `https`. |
| `date` | no | `YYYY-MM-DD` | The date the experience was added. Newer ones appear first. Undated ones come last. |
| `thumbnail` | no | Path to an image inside your folder | See [Thumbnails](#thumbnails). Without one, the card shows the experience's URL. |
| `sound` | no | `true` or `false` | Set to `true` if your experience plays audio. Shown in the info panel. |
| `license` | no | Text, up to 40 characters, e.g. `"MIT"`, `"CC-BY-4.0"` | Defaults to `"MIT"`. |
| `permissions` | no | List of permission names | Only for capabilities your experience can't work without. See [PERMISSIONS.md](PERMISSIONS.md). |

Any other field fails the check, which catches typos like `"tag"` or `"auther"`.

### Categories

| Category | For |
|---|---|
| `minimal` | Quiet, mostly static pages |
| `typographic` | Type is the main idea |
| `animated` | Motion is the main idea, no input needed |
| `interactive` | Toys and things to play with |
| `game` | Something with a goal, a score or a way to lose |
| `generative` | Different every time, made by code |
| `experimental` | Anything that doesn't fit elsewhere |

Pick the one that fits best. Use tags for the rest.

### Interaction values

`passive`, `keyboard`, `mouse`, `touch`, `scroll`, `motion`

List every input your experience responds to. If it also works without any input, include `passive`.

## Thumbnails

- 16:10 aspect ratio. 640 × 400 pixels is enough.
- WebP, PNG or JPEG, under 100 KB.
- A screenshot of the experience works well. Cards crop to fit, so keep the important part in the centre.

## The check

`npm run check` validates every experience and prints exactly what is wrong:

```
✗ 1 invalid experience(s):

experiences/my-idea/
  - "category" must be one of: minimal, typographic, animated, interactive, game, generative, experimental
  - permission "camera" refused: Not available yet: camera access inside sandboxed frames behaves inconsistently across browsers. Open an issue if your idea needs it.
```

The same check runs on every pull request. While you run `npm run dev`, an invalid experience is left out of the site and the problem is printed in the terminal, so other experiences keep working.
