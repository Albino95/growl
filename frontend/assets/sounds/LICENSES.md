# Grow! UI sounds

Synthesized in-house for Grow! (Let's Grow Group), all rights reserved.

No samples, presets or third-party recordings were used. Every file was
generated from scratch by a pure-Python script (standard library only:
`math`, `wave`, `struct`, `random`).

## Synthesis summary

One family, F major pentatonic (F G A C D), soft kalimba / marimba plucks:

- Pluck: 3 ms linear attack, exponential decay; partials 1·f (1.0),
  2.76·f (0.22, kalimba) or 3.93·f (0.20, marimba), 9.4·f (0.04); higher
  partials decay faster.
- One-pole lowpass ~6 kHz (soft-error: 1.5 kHz, two stages).
- Light reverb: two parallel feedback combs (29 ms, 37 ms, gain 0.4) into an
  allpass (5 ms, g 0.5), ~15 % wet.
- Tail trimmed at −60 dB with a 20 ms cosine fade; peak normalized to
  −6 dBFS (send −12, soft-error −14). 44.1 kHz, 16-bit, mono WAV.

| File | Moment | Notes | Duration | Peak | RMS |
| --- | --- | --- | --- | --- | --- |
| bloom.wav | check-in done | A5 → C6, 60 ms apart | 350 ms | −6.0 dBFS | −20.3 dBFS |
| rise.wav | milestone / badge / challenge | F5, A5, C6 at 90 ms steps + soft F6 | 806 ms | −6.0 dBFS | −21.5 dBFS |
| seedpop.wav | post / reel / story shared | 15 ms filtered-noise pop + C6 marimba pluck | 120 ms | −6.0 dBFS | −20.7 dBFS |
| send.wav | message / comment sent | single G5 tick | 60 ms | −12.0 dBFS | −25.0 dBFS |
| soft-error.wav | failed action | D4 → C4, muted | 180 ms | −14.0 dBFS | −26.5 dBFS |

## Tap sounds (quiet tier)

Same in-house, standard-library-only process and the same F major pentatonic
kalimba / marimba family (`synth_taps.py`, which reuses `synth.py`'s partial
ratios, reverb and WAV writer). No samples or third-party material.

- Pluck: 1.5 ms attack, exponential decay (partials as above); tab uses a
  stronger fundamental and weaker upper partials for a damped "tock".
- Chain: one-pole HPF 250 Hz → one-pole LPF 5.5 kHz (tab: 2.5 kHz, two
  stages) → 8 % wet room only on sounds ≥ 50 ms (none on shorter ticks) →
  −60 dB tail trim with an ≤ 8 ms cosine fade.
- Peak level = signature −6 dBFS + the offset below.
- 3 variants each (`-1`, `-2`, `-3`): detune 0 / +12 / −12 cents, decay
  ×1.0 / 0.9 / 1.1, 2nd-partial level ×1.0 / 0.85 / 1.15 (commit: different
  noise seed). The app picks a random variant per play (never the same one
  twice in a row) with ±1.5 dB gain jitter.
- 44.1 kHz, 16-bit, mono WAV. 21 files, 103,950 bytes total.

| Files | Moment | Notes | Level vs signature | Duration | Peak | RMS |
| --- | --- | --- | --- | --- | --- | --- |
| tap-toggle-on-1..3.wav | switch on | C6 | −16 dB | 45 ms | −22.0 dBFS | −35.7 to −36.0 dBFS |
| tap-toggle-off-1..3.wav | switch off | A5 | −18 dB | 45 ms | −24.0 dBFS | −37.5 to −37.9 dBFS |
| tap-tab-1..3.wav | tab-bar switch | damped F5 "tock", LPF 2.5 kHz | −20 dB | 33–35 ms | −26.0 dBFS | −38.5 to −39.0 dBFS |
| tap-chip-1..3.wav | chip / segment select | G5 marimba | −20 dB | 35 ms | −26.0 dBFS | −38.8 to −39.1 dBFS |
| tap-commit-1..3.wav | primary button (post / save / join / continue) | 3 ms band-passed noise click (~3 kHz) + D6 | −14 dB | 60 ms | −20.0 dBFS | −33.5 to −33.8 dBFS |
| tap-like-1..3.wav | like | A5 → D6 grace pair, 25 ms apart | −10 dB | 120 ms | −16.0 dBFS | −29.5 to −29.9 dBFS |
| tap-refresh-1..3.wav | pull-to-refresh start | C5 marimba | −20 dB | 50 ms | −26.0 dBFS | −38.9 to −39.1 dBFS |
