# sebastiantaitanderson.com

A zero-dependency developer profile designed for GitHub Pages, with a 128×1072 WebGL pixel-art background.

## What makes it fast

- No framework, package install, analytics, external fonts, or third-party requests
- No build step: GitHub Pages publishes the `dist` folder directly
- Responsive, keyboard-friendly, and reduced-motion aware
- The background renders at its native 128×1072 resolution and is enlarged with nearest-neighbor scaling
- Pixel state advances at 24 ticks per second while WebGL draws at the display frame rate

## Pixel background behavior

The background starts from one randomly selected source image and chooses one of the other two images as its global target. Every tick, 1% of all currently eligible pixels begin interpolating toward that target. Each transition lasts 24 ticks, and a pixel becomes eligible again only after its interpolation finishes. Once 90% of all pixels have either reached or begun interpolating toward the current target, the background chooses another image and begins the next phase.

The three source images are in `dist/assets`. The animation logic is in `dist/pixel-background.js`.

## Personalize the page

Open `dist/index.html` and search for these sections:

- `hero-title` — main introduction
- `work-grid` — projects and case studies
- `writing-list` — posts and essays
- `record` — achievements and milestones
- `link-grid` — social and contact links

For a social link, replace a slot such as:

```html
<div class="social-slot"><strong>GitHub</strong><span>Add profile URL</span></div>
```

with:

```html
<a class="social-slot" href="https://github.com/YOUR-USERNAME">
  <strong>GitHub</strong><span>Open profile ↗</span>
</a>
```

## Publish with GitHub Pages

1. Create a public GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. The included workflow publishes automatically after each push to `main`.
5. In **Custom domain**, enter `sebastiantaitanderson.com` and enable HTTPS when available.

The `dist/CNAME` file already contains the custom domain.

## Cloudflare DNS

Keep the domain registered with Cloudflare. In its DNS settings, point the apex domain to GitHub Pages using GitHub's current documented DNS records, and point `www` to your GitHub Pages hostname. DNS values can change, so verify them against GitHub's documentation when you connect the domain.
