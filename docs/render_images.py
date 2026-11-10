"""Render the README images: screenshots of the real synth plus the hero banner.

Run from anywhere:

    python docs/render_images.py

Needs Playwright (`pip install playwright && playwright install chromium`).
Every image is taken from index.html as it is now, so re-run this after a UI
change. Output goes to docs/images/ and docs/hero-banner.png, all at 2x.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "images"
TMP = OUT / "_tmp"
APP = (ROOT / "index.html").as_uri()

# Hide the toast so a "Loaded ..." message never ends up in a picture
CLEAN_CSS = ".toast { display: none !important; }"


def open_app(browser, width, height, skin="studio", arp_open=False, scale=2):
    """A fresh page with empty storage, so every shot starts from the same state."""
    ctx = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=scale,
        reduced_motion="reduce",  # backdrop tiles stand still
    )
    ctx.add_init_script(
        f"""localStorage.clear();
        localStorage.setItem('halden6-skin-v1', '"{skin}"');
        localStorage.setItem('halden6-arp-open-v1', '{str(arp_open).lower()}');"""
    )
    page = ctx.new_page()
    page.goto(APP)
    page.add_style_tag(content=CLEAN_CSS)
    page.wait_for_timeout(900)
    return page


def load_preset(page, name):
    page.evaluate(
        """name => {
            document.querySelector('#preset-open').click();
            const row = [...document.querySelectorAll('.preset-row-name')].find(n => n.textContent === name);
            row.closest('button').click();
            document.querySelector('#preset-close').click();
        }""",
        name,
    )
    page.wait_for_timeout(500)


def compose(browser, name, html, width):
    """Screenshot a small HTML page that lays out earlier shots with captions."""
    src = TMP / f"{name}.html"
    src.write_text(html, encoding="utf-8")
    ctx = browser.new_context(viewport={"width": width, "height": 400}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(src.as_uri())
    page.wait_for_timeout(400)
    page.locator(".canvas").screenshot(path=str(OUT / f"{name}.png"))
    ctx.close()
    print("wrote", OUT / f"{name}.png")


FIGURE_CSS = """
@import url('../../../fonts/fonts.css');
* { box-sizing: border-box; margin: 0; }
body { background: #0b0d10; font-family: Inter, 'Segoe UI', sans-serif; color: #e4e6ea; }
.canvas { padding: 28px; background: radial-gradient(900px 400px at 50% 0%, #1a1f27, #0b0d10); display: inline-block; }
.row { display: flex; gap: 22px; align-items: flex-end; }
.row + .row { margin-top: 26px; }
figure { margin: 0; }
img { display: block; border-radius: 8px; border: 1px solid #2a2f37; box-shadow: 0 14px 40px rgba(0,0,0,.55); }
figcaption { margin-top: 12px; font-size: 14px; color: #a7afbd; line-height: 1.35; }
figcaption b { display: block; font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
  font-size: 15px; letter-spacing: .16em; text-transform: uppercase; color: #e4e6ea; margin-bottom: 2px; }
"""


def page_html(body):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{FIGURE_CSS}</style></head><body><div class='canvas'>{body}</div></body></html>"


def shoot_panel(browser):
    page = open_app(browser, 1600, 1000)
    load_preset(page, "PWM String Pad")
    page.screenshot(path=str(OUT / "panel.png"), full_page=True)
    print("wrote", OUT / "panel.png")
    page.context.close()


def shoot_skins(browser):
    for skin in ("studio", "neon", "daylight"):
        page = open_app(browser, 1600, 1000, skin=skin)
        load_preset(page, "Synthwave Sunset Pad")
        page.locator("#rack").screenshot(path=str(TMP / f"skin-{skin}.png"))
        page.context.close()
    labels = {
        "studio": ("Studio", "Dark faceplate, red sound path"),
        "neon": ("Neon", "Violet and orange, for dark rooms"),
        "daylight": ("Daylight", "Light panel, green traces"),
    }
    figs = "".join(
        f"<figure><img src='skin-{k}.png' width='500'><figcaption><b>{t}</b>{d}</figcaption></figure>"
        for k, (t, d) in labels.items()
    )
    compose(browser, "skins", page_html(f"<div class='row'>{figs}</div>"), 1700)


def shoot_sections(browser):
    page = open_app(browser, 1600, 1000)
    load_preset(page, "Synthwave Lead")  # pulse + saw, delayed vibrato, some resonance
    width = {}
    for sid in ("lfo", "dco", "vcf", "env"):
        sec = page.locator(f"section.module[data-cid='{sid}']")
        width[sid] = round(sec.bounding_box()["width"])
        sec.screenshot(path=str(TMP / f"sec-{sid}.png"))
    page.context.close()
    caps = {
        "lfo": ("LFO", "Two seconds of the LFO, with the delay fade-in"),
        "dco": ("DCO", "The oscillator mix: saw, pulse, sub and noise"),
        "vcf": ("VCF", "The real filter curve, resonance and HPF included"),
        "env": ("ENV", "The envelope shape from A, D, S and R"),
    }
    # Native size, so all four sections share one scale; paired to balance the rows
    fig = lambda k: (
        f"<figure style='width:{width[k]}px'><img src='sec-{k}.png' width='{width[k]}'>"
        f"<figcaption><b>{caps[k][0]}</b>{caps[k][1]}</figcaption></figure>"
    )
    row = "<div class='row' style='align-items:flex-start'>"
    body = f"{row}{fig('dco')}{fig('env')}</div>{row}{fig('lfo')}{fig('vcf')}</div>"
    compose(browser, "graphs", page_html(body), 1200)


def shoot_arp(browser):
    page = open_app(browser, 1600, 1000, arp_open=True)
    load_preset(page, "Italo Arp")
    page.select_option("#arp-preset", label="Italo Octaves · 118 BPM")
    page.click("[data-cid='arpOn']")  # switched on, so the bar reads "On" and the LED lights
    page.wait_for_timeout(300)
    page.locator(".arp-dock").screenshot(path=str(OUT / "arpeggiator.png"))
    print("wrote", OUT / "arpeggiator.png")
    page.context.close()


def shoot_presets(browser):
    page = open_app(browser, 1600, 1000)
    load_preset(page, "Berlin Sequence")
    page.click("#preset-open")
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / "presets.png"), clip={"x": 0, "y": 0, "width": 1100, "height": 860})
    print("wrote", OUT / "presets.png")
    page.context.close()


def shoot_scaling(browser):
    sizes = [
        ("wide", 2560, 1440, "Studio monitor", "2560 × 1440"),
        ("laptop", 1440, 900, "Laptop", "1440 × 900"),
        ("tablet", 820, 1180, "Tablet", "820 × 1180"),
    ]
    for key, w, h, *_ in sizes:
        page = open_app(browser, w, h, scale=1)
        load_preset(page, "Classic Halden Pad")
        page.screenshot(path=str(TMP / f"size-{key}.png"))
        page.context.close()
    # Same height on screen, so the width shows how the panel re-flows
    figs = "".join(
        f"<figure><img src='size-{k}.png' height='420'><figcaption><b>{t}</b>{s} px viewport</figcaption></figure>"
        for k, _, _, t, s in sizes
    )
    compose(browser, "scaling", page_html(f"<div class='row'>{figs}</div>"), 1800)


def shoot_banner(browser):
    ctx = browser.new_context(viewport={"width": 1200, "height": 420}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto((DOCS / "hero-banner.html").as_uri())
    page.wait_for_timeout(500)
    page.screenshot(path=str(DOCS / "hero-banner.png"))
    print("wrote", DOCS / "hero-banner.png")
    ctx.close()


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        shoot_panel(browser)
        shoot_skins(browser)
        shoot_sections(browser)
        shoot_arp(browser)
        shoot_presets(browser)
        shoot_scaling(browser)
        shoot_banner(browser)  # uses images/panel.png, so it runs last
        browser.close()
    for f in TMP.iterdir():
        f.unlink()
    TMP.rmdir()


if __name__ == "__main__":
    main()
