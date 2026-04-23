# Investor deck (PowerPoint)

- **File:** `Growl_Investor_Deck.pptx` — generated pitch deck for investors (replace placeholder metrics and contact slides before sending).
- **Regenerate:** from the repo root, after a one-time virtualenv:

```bash
cd docs/investor-pitch
python3 -m venv .venv
.venv/bin/pip install python-pptx
.venv/bin/python build_investor_deck.py
```

The script `build_investor_deck.py` edits slide copy in one place; open the `.pptx` in Keynote or PowerPoint to adjust layout, charts, and branding.
