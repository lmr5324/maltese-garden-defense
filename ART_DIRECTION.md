# Maltese Garden Defense Art Direction

## Current Baseline

- Use the extracted sprites from `assets/sprites/` as the active playable baseline.
- The generated `dog-v1` and `maltese-v1` sprites are experiments only until the two core dogs are validated.
- The long sticker-sheet JPG flavor is the source of truth for now: simple shapes, soft chunky outlines, tiny facial features, and a handmade sticker feel.

## Dog Identity Rules

- The tan dog needs longer, floppy ears and a rounded, simple body silhouette.
- The white dog needs the same clean body shape from the reference, but its ears should not become extra fluffy or woolly.
- Defenders on the player's side should face right.
- Enemy/zombie dogs should face left.
- Most current extracted zombie-dog sprites already face left in the source sheet, so do not globally mirror enemy sprites. Only flip a specific enemy if its source art is actually facing right.
- Decorations should sit on or around the dogs, not replace the dog silhouette. A bucket, cone, tie, lantern, flower, or Maltese prop can be attached, but the dog must still read immediately as one of the two original forms.
- The red pirate/helmet mascot is enemy-coded because of the eyes and skull markings. It is a better fit for the Ħares Shadow role than the mushroom mascot, which reads too much like a night-plant defender.
- Ħares Shadow should start veiled/misty and faster, then become fully readable after the first hit. Bell and Bajtra frost are intentional counters: they reveal it immediately. Once revealed and low on HP, the pirate helmet can shake/crack, but the underlying dog silhouette must stay recognizable.

## Maltese Flavor

- Keep Maltese details warm and legible: limestone walls, sea blue accents, festa reds, harbor light, cactus greens, pastizzi/gbejna references, village pots, and bunting.
- Avoid turning every unit into a full costume. Small props are stronger than heavy redesigns.
- The board should feel like a Maltese garden or village street with lane-defense readability: textured grass lanes, limestone edging, a clear right-side entry path, and a left-side home/gate.

## IP Constraint

- Keep the lane-defense structure only.
- Do not copy Plants vs Zombies characters, exact layout, UI, art, sound, names, or balancing.
- "PvZ vibe" means readable lanes, tactile garden texture, escalating comic pressure, and instantly readable units, not cloned assets.

## Motion References

- `Fall_1.mov` is the preferred normal zombie-dog defeat read: upright dog, little loss of balance, then a flat pancake landing. Preserve the tan dog's long floppy ears in this motion.
- `Fall_2.mov` reads as a special crumble/disintegration state. Use it for bomb, frost-shatter, or other high-impact defeats rather than every basic knockout.
- `Blocked.mov` reads as a stuck chewing/bumping loop. Use that motion language when an enemy is held by a defender: tiny forward nudges, squash, bite crumbs, and repeated contact feedback.
- `Disco.mov` can inspire a future Maltese festa dancer / village DJ enemy, but keep the design and rules original instead of cloning a PvZ disco unit.
- The Festa Dancer enemy uses the tan balloon dog as the current base, with canvas-drawn party cap, music notes, confetti, and a buff aura. It should read as Maltese festa chaos rather than a direct disco character.
- The balloon_tan Festa Dancer is airborne while its balloon is intact. It can float over two blockers before behaving normally, and Pink Bud is the dedicated anti-air counter that pops the balloon and removes future bypasses.
- Blue Grotto Pup is a plant-side bone shooter: pale Maltese dog body, sea-blue hair tuft, tiny mole under the right eye, blue-green leaf scarf, and organic leafy bone-launching pods. It should face right and keep the dog silhouette dominant.
- Blue Grotto Pup now has a three-stage evolution line using the user-approved assets: `dog_blue_base.png` for the base form, `dog_blue_upgrade1.png` for the first upgrade, and `dog_blue_ultra.png` for the final ultra form.
- Blue Grotto Pup starts as a single-bone shooter, first upgrade improves its single-shot pressure, and the ultra upgrade turns it into a three-bone volley unit. Upgrades should cost extra Harbor Light and happen on the placed unit, not through separate cards.
- Blue Grotto Pup's board sprites should use idle versions without already-fired bones. Fired bones are drawn by the projectile system so the unit does not look permanently mid-shot or sit off-center on the lane.
- Blue Grotto Pup's fired bones should scale by upgrade stage: small in base form, medium after first upgrade, and large in ultra form. Each bone launch gets a cute bark-roar sound layered under the projectile pop.
- Blue Grotto Pup should advertise its placed-unit upgrade path with small stage pips above the unit only while another upgrade remains. When enough Harbor Light is available, the next pip and a small arrow can pulse to invite clicking the placed pup. Hide the meter once the pup reaches ultra.
- The current campaign target is seven waves. Wave 6 introduces the St Elmo Stone Hound as a readable boss-tier zombie dog, and wave 7 is the full pressure finale designed to justify upgraded Blue Grotto Pup.
- Campaign balance should avoid a pure early-game spike followed by an easy snowball. Waves 1-2 can breathe slightly, wave 5 is the pivot into siege pressure, and waves 6-7 should use scripted special packs rather than only inflated HP.
- Late-wave special packs can use visible labels such as GUARD, HIGH, SURGE, SLIP+, CAPTAIN, DRIFT+, and TIDE+. These are per-spawn balance tunes, not new species: they should add tactical pressure while preserving the original dog identity.
- Late-wave rewards should taper down so the finale cannot be fully funded by the enemies it is deleting. The player should still earn light, but saved bombs, prepared Pink Buds, and chosen Blue Pup upgrades should matter.
- St Elmo Stone Hound should feel like a late-wave event: entrance shake, dust, a low thump, and a short callout when it first appears.
- Għajn Tuffieħa Bomb should read as a hot scorch blast as well as a burst. Enemies that survive the explosion can burn briefly with orange flame/ember feedback, while frozen enemies still keep the frost-shatter read.
- Knight of Mdina should show blocker damage clearly: small shake while being chewed, limestone chips, and escalating crack lines as HP drops. The damage read should support the armored-blocker fantasy rather than making the Knight look like a different character.
- Placeholder sound effects should stay warm, comic, and tactile: soft chimes for Harbor Light, crisp pops for Pink Bud, resonant bell hits, icy glass for frost and shatter, scorch crackle for bombs, and chunky bite/crack feedback when the Knight is being worn down.
