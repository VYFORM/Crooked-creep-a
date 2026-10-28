# Crooked Keep — prototype index

**The active game now lives in [VYFORM/Crooked-Keep](https://github.com/VYFORM/Crooked-Keep).**

[Play Crooked Keep](https://crooked-keep-quest.base44.app/)

The first export into this repository was the AI Studio uploader utility, rather
than the Gemini game. Its original source is preserved on
[`archive/uploader-original`](https://github.com/VYFORM/Crooked-creep-a/tree/archive/uploader-original)
at commit `f9738161ef44a00cdb1638418fd33835797d89ff`. The remaining utility
files on this branch are historical material; this is not the game's development
repository.

## Project map

| Version | Preservation and role |
| --- | --- |
| Integrated Crooked Keep | [Canonical repository](https://github.com/VYFORM/Crooked-Keep), connected to the Base44 app named **Crooked Keep**. |
| Original Fable prototype | [`baseline/fable`](https://github.com/VYFORM/Crooked-Keep/tree/baseline/fable); original Base44 checkpoint `6ae1d434d921638d41c47556`. |
| Original Gemini prototype | [`baseline/gemini`](https://github.com/VYFORM/Crooked-Keep/tree/baseline/gemini), recovered from the correct uploaded ZIP. Gameplay source is unchanged; `ARCHIVE.md` documents the compressed title image and exact original PNG. |
| Original Terra prototype | Base44 app **Crooked Keep — Terra Prototype**, preserved checkpoint `6ae1d36e82e595052cc06d4c`. |

The integrated game uses Fable's modular simulation as its foundation. Improvements
from the comparison are selected by behaviour and quality. The prototype engines
remain separate so they can be reviewed without conflicting game loops.

New work should branch from the canonical repository. See its
[development guide](https://github.com/VYFORM/Crooked-Keep/blob/main/docs/DEVELOPMENT.md)
for file ownership, verification and integration.
