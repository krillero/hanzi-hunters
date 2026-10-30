# Combat screen design reference — Option 1: Learning-first RPG

Status: approved visual direction (2026-10-30)

The approved reference is the generated portrait mobile mockup shared in the ChatGPT conversation on 2026-10-30. Use that image as the visual target during implementation and screenshot reviews.

## Design intent

Keep the existing Hanzi Hunters visual identity: dark navy surfaces, restrained gold accents, green success states, pixel-art RPG atmosphere, and the existing gameplay flow. Make the Chinese learning interaction the primary focal point while making the battle scene feel like an arena rather than a stack of status panels.

## Screen hierarchy

1. **Compact HUD**
   - One short horizontal strip at the top.
   - Show floor/wave progress, gold, potion count, weapon/gear shortcut, book/word count, and settings.
   - Keep labels and controls compact; do not let the HUD compete with the question.

2. **Battle arena**
   - Use a visually rich pixel-art dungeon arena with depth, stone walls/floor, torches and banners.
   - Keep the player character on the left and enemy on the right, grounded on the arena floor.
   - Integrate player/enemy names, levels and HP bars in compact panels along the bottom edge of the arena.
   - Enemy-defeated and combo feedback should be a temporary overlay near the top/middle of the arena, not a permanent oversized banner that obscures the characters.
   - Preserve the current battle artwork/style where possible; do not replace the actual game scene with generic emoji or a static illustration.

3. **Learning card — primary focus**
   - Prominent question heading, e.g. “What does 手 mean?” with word-level progress.
   - Large Chinese character centred in a spacious card, with pronunciation and English meaning beneath.
   - Keep audio control visible but secondary.
   - Correct/incorrect explanation appears in a compact green/red feedback panel beneath the character.
   - Preserve readability and character size on narrow mobile screens.

4. **Rewards**
   - Combine XP, gold and level-up into one compact rewards section/row.
   - Avoid multiple large independent reward boxes or redundant level-up chips.
   - Keep the next-action button full-width, gold, and visually prominent.

## Interaction states

- **Question unanswered:** learning card is the dominant focus; arena remains visible but quieter.
- **Answer correct/incorrect:** show concise explanation and compact reward summary.
- **Enemy defeated:** briefly emphasize the arena with a transient victory/combo overlay; do not permanently consume vertical space.
- **Next enemy:** transition cleanly back to the active question state.

## Mobile layout guidance

- Optimize for a narrow portrait viewport first.
- Reduce wasted vertical padding in the HUD, battle status and rewards before shrinking the Chinese character or explanation text.
- Use borders selectively: strong borders for the learning card and primary action; softer separation elsewhere.
- Avoid overlapping text, clipped content, horizontal overflow, and excessive nested panels.
- Keep the screen scroll as short as practical while retaining readable touch targets.

## Acceptance checklist

- [ ] Arena reads as a game environment, with hero and enemy clearly visible.
- [ ] Battle notifications do not obscure the hero, enemy, or question.
- [ ] Learning card is the strongest focal point during question/answer states.
- [ ] HUD is compact and all controls remain usable.
- [ ] Rewards are consolidated and the next action is obvious.
- [ ] Layout is checked with real mobile screenshots at narrow widths.
- [ ] Existing game mechanics, state transitions, and accessibility labels remain intact.
