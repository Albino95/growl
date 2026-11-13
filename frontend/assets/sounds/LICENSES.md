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
