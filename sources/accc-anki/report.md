# Import report: accc-anki

- Adapter: anki-apkg
- File: A_Course_in_Contemporary_Chinese__B1-B6_Traditional.apkg (135628989 bytes)
- Snapshot sha256: 1291d1b67ae4815cb97cba8fbaf8e50bc3edbbfe71d542357ef9f3da69c9e105
- Retrieved: 2026-11-02
- collection: collection.anki21

## Counts

| | |
|---|---|
| zipMembers | 4965 |
| notesIn_collection.anki2 | 1 |
| notesIn_collection.anki21 | 4960 |
| notes | 4960 |
| cards | 4960 |
| noteTypes | 1 |
| mediaFiles | 4961 |
| media_mp3 | 4960 |
| media_ttf | 1 |
| duplicateIds | 0 |
| records | 4960 |
| recordsWithAudio | 4960 |
| recordings | 4960 |
| mediaExtracted | 4960 |
| mediaUnreferenced | 1 |
| withPlacement | 4960 |
| flag_too-long | 8 |
| flag_long | 59 |
| flag_pattern | 37 |
| flag_phrase | 7 |
| flag_name | 260 |
| flag_erhua | 2 |
| flag_several-forms | 21 |
| flag_several-readings | 22 |
| recordsWithIssues | 7 |

## Checks that ran

- read collection.anki21 (notes 4960); collection.anki2 has 1 notes and was not used
- every archive member name checked for path traversal; media written only under generated names <sha256 prefix>.<ext>
- each referenced media file: present in the media mapping and archive, CRC32 matches the archive, non-empty, sha256 recorded
- audio file signature (ID3 tag or MPEG frame sync / Ogg / WAV header)
- record key uniqueness
- no card template or script was read or executed

## Not checked

- whether a recording actually says the record's text or its declared pinyin (needs a person to listen)
- audio duration, loudness or decodability beyond the file signature
- whether the source's pinyin, meanings or part of speech are correct

## Problems

### parse (10)

- accc-anki:B1L07-I-02: reading "KTV" is not plain tone-marked pinyin
- accc-anki:B1L07-I-02: Simplified has no Chinese characters
- accc-anki:B2L02-I-18: reading "Táiběi 101" is not plain tone-marked pinyin
- accc-anki:B3L08-II-46: reading "EMBA" is not plain tone-marked pinyin
- accc-anki:B3L08-II-46: Simplified has no Chinese characters
- accc-anki:B3L08-II-49: reading "X fēn zhī Y" is not plain tone-marked pinyin
- accc-anki:B3L10-I-32: reading "zhào X guāng" is not plain tone-marked pinyin
- accc-anki:B6L01-III-T-01: reading "Jiāobù (= Jiāoyùbù)" is not plain tone-marked pinyin
- accc-anki:B6L06-I-T-02: reading "BBC" is not plain tone-marked pinyin
- accc-anki:B6L06-I-T-02: Simplified has no Chinese characters

### unsupported (1)

- _MoeStandardKai.ttf: in the package but not referenced by any note (font, used by the card templates; not imported)


## Changes since the previous snapshot

- from (none)
- added 4960, removed 0, changed 0, unchanged 0
- decisions flagged for reassessment: 0
