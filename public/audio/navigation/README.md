# Basic Urdu navigation audio

The `ur-f3-v1` pack is generated speech audio for Manzil's fixed Urdu navigation vocabulary. It uses eSpeak NG's synthetic **female3** variant (`ur+f3`). This is a basic formant voice, not a natural human recording. No synthesizer, language model or third-party runtime is shipped to the browser. Audio is fetched from this app only as needed; user road names, locations and account details are not sent to a speech provider for this fallback.

Only the exact ahead distances 50, 75, 100, 125, 150, 175, 200 and 225 metres have recordings. Other distances are omitted from speech rather than rounded to a different number. Road names remain visible in the navigation instruction but are omitted from these fixed recordings. A supported device Urdu voice can read the complete prompt instead.

## Reproduce

Use an ignored development directory, not the application dependencies:

1. Download and unpack [`@echogarden/espeak-ng-emscripten` **0.3.5**](https://registry.npmjs.org/@echogarden/espeak-ng-emscripten/-/espeak-ng-emscripten-0.3.5.tgz). Its published npm integrity is `sha512-Izbkm7NWccwb//RKgOp1/0k21StKN1DFIn+K7GU1XN7n6pmSi4bsk/0tYUsgQbysC4GVyrVompNmLInU/BFE+A==`.
2. Run `npx tsx scripts/generate-navigation-voice.ts .local-tools/speech-probe/package` with that extracted package path. The script validates the package name/version, requires an Urdu voice, creates PCM16 mono 16 kHz WAVs and records the source hashes, phrases and each output SHA256 in `manifest.json`. Speech rate is 175 words/minute with the engine's neutral pitch/range controls (50); female3's own formants and pitch are retained.
3. Run the navigation audio tests and production build. Listen to the test/turn clips on the target browser; generation and non-silent PCM checks do not establish pronunciation quality.

## Source and licensing

- [eSpeak NG source](https://github.com/espeak-ng/espeak-ng), [Urdu language support](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md), [female3 variant](https://github.com/espeak-ng/espeak-ng/blob/master/espeak-ng-data/voices/!v/f3).
- [Echogarden Emscripten package/source and GPL-3.0 license](https://github.com/echogarden-project/espeak-ng-emscripten). The unmodified generator engine and its dictionary archive are development tools only and are excluded from application source and bundles.
- The pack contains synthesized waveform output from Manzil's own fixed phrases, not engine code. [GPLv3 section 2, as published by eSpeak](https://espeak.sourceforge.net/license.html), distinguishes running the engine and its output from conveying the engine itself. This is the basis for keeping generated audio in the private app without adding the GPL engine as an application dependency. No recorded commercial voice or neural model is used.

These generated audio files may be used with Manzil under the repository's terms. The generator attribution does not claim a human speaker or a quality endorsement by eSpeak/Echogarden.
