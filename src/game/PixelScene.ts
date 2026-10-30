import Phaser from 'phaser'

export type EnemySprite = 'slime' | 'imp' | 'bat'

const BASE = import.meta.env.BASE_URL
const TILE = 16
// Frame order in tiles/dungeon.png
const FLOOR_A = 0, FLOOR_B = 1, FLOOR_MOSS = 2, WALL = 3, WALL_TOP = 4

/**
 * Decorative encounter scene. React owns HP / enemy identity / progression; this scene only
 * draws and animates. Art lives in public/assets (see ASSET_PIPELINE.md and ASSET_CREDITS.md).
 */
export class PixelScene extends Phaser.Scene {
  private assetsOk = true
  private ready = false
  private enemyKey: EnemySprite = 'slime'
  private monsterAlive = true
  private showingChest = false
  private layer?: Phaser.GameObjects.Container
  private hero?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle
  private monster?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle
  private chest?: Phaser.GameObjects.Sprite
  /** Floating numbers/banners stay on screen until clearFloats() so the player can read them. */
  private floats: Partial<Record<'hero' | 'monster' | 'banner', { text: string; color: string; caption?: string }>> = {}
  private floatObjs: Partial<Record<'hero' | 'monster' | 'banner', Phaser.GameObjects.Container>> = {}
  private combo = 0
  private comboObj?: Phaser.GameObjects.Text
  private defeated = false
  private defeatObjs: Phaser.GameObjects.GameObject[] = []
  private victoryText: string | null = null
  private victoryObjs: Phaser.GameObjects.GameObject[] = []
  /** The live reward popup (only one at a time). Not part of the rebuilt layer, so it must clean itself up. */
  private rewardPop?: { c: Phaser.GameObjects.Container; endAt: number }
  private floorY = 0
  private heroHome = { x: 0, y: 0 }
  private monsterHome = { x: 0, y: 0 }
  private actorScale = 3
  private elite = false

  constructor() { super('PixelScene') }

  preload() {
    this.load.setPath(BASE)
    this.load.on('loaderror', () => { this.assetsOk = false })
    this.load.spritesheet('hero', 'assets/characters/hero.png', { frameWidth: 24, frameHeight: 24 })
    for (const k of ['slime', 'imp', 'bat']) this.load.spritesheet(k, `assets/enemies/${k}.png`, { frameWidth: TILE, frameHeight: TILE })
    this.load.spritesheet('tiles', 'assets/tiles/dungeon.png', { frameWidth: TILE, frameHeight: TILE })
    this.load.spritesheet('torch', 'assets/props/torch.png', { frameWidth: TILE, frameHeight: TILE })
    this.load.spritesheet('chest', 'assets/props/chest.png', { frameWidth: TILE, frameHeight: TILE })
  }

  create() {
    if (this.assetsOk) {
      const loop = (key: string, frames: number[], rate: number) =>
        this.anims.create({ key, frames: frames.map(frame => ({ key: key.split(':')[0], frame })), frameRate: rate, repeat: -1 })
      loop('hero:idle', [0, 1], 3)
      for (const k of ['slime', 'imp', 'bat']) loop(`${k}:idle`, [0, 1], k === 'bat' ? 6 : 2.5)
      loop('torch:burn', [0, 1], 6)
    }
    this.ready = true
    this.build()
    this.scale.on('resize', this.build, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this))
  }

  /** (Re)creates every visual from the current state. Called on create and on resize. */
  private build() {
    const { width, height } = this.scale
    if (width < 2 || height < 2) return
    this.tweens.killAll()
    this.layer?.destroy(true)
    for (const k of ['hero', 'monster', 'banner'] as const) this.floatObjs[k]?.destroy()
    this.floatObjs = {}
    this.comboObj?.destroy(); this.comboObj = undefined
    this.defeatObjs.forEach(o => o.destroy()); this.defeatObjs = []
    this.victoryObjs.forEach(o => o.destroy()); this.victoryObjs = []
    this.layer = this.add.container(0, 0)
    this.cameras.main.setSize(width, height)

    const tileScale = height >= 250 ? 3 : 2
    const step = TILE * tileScale
    const wallRows = Math.max(2, Math.round(height * 0.34 / step))
    const floorY = wallRows * step
    this.floorY = floorY
    this.actorScale = Phaser.Math.Clamp(Math.floor(height / 62), 2, 5)
    const feetY = floorY + (height - floorY) * 0.72
    this.heroHome = { x: Math.round(width * 0.27), y: Math.round(feetY) }
    this.monsterHome = { x: Math.round(width * 0.73), y: Math.round(feetY) }

    if (this.assetsOk) this.buildTextured(width, height, tileScale, step, wallRows, floorY)
    else this.buildFallback(width, height, floorY)
    this.buildArenaFrame(width, height, floorY, step)
    this.spawnActors()
    if (this.rewardPop) {
      const left = this.rewardPop.endAt - this.time.now
      if (left <= 0) this.dropRewardPop()
      else { this.tweens.add({ targets: this.rewardPop.c, y: this.rewardPop.c.y - 6, duration: left }); this.fadeRewardPop() }
    }
    this.drawFloats(false)
    this.drawCombo(false)
    if (this.defeated) this.applyDefeat(false)
    if (this.victoryText && !this.defeated) this.applyVictory(false)
  }

  private buildTextured(width: number, height: number, ts: number, step: number, wallRows: number, floorY: number) {
    const add = (o: Phaser.GameObjects.GameObject) => { this.layer!.add(o); return o }
    const cols = Math.ceil(width / step) + 1
    const rng = new Phaser.Math.RandomDataGenerator(['hanzi-hunters'])
    for (let r = 0; r < wallRows; r++) for (let c = 0; c < cols; c++)
      add(this.add.image(c * step, r * step, 'tiles', r === wallRows - 1 ? WALL_TOP : WALL).setOrigin(0).setScale(ts))
    for (let y = floorY, r = 0; y < height; y += step, r++) for (let c = 0; c < cols; c++) {
      const roll = rng.frac()
      add(this.add.image(c * step, y, 'tiles', roll < 0.08 ? FLOOR_MOSS : roll < 0.4 ? FLOOR_B : FLOOR_A).setOrigin(0).setScale(ts))
    }
    // Torches: warm pool of light on the wall, flickering flame sprite
    for (const fx of [0.16, 0.84]) {
      const x = Math.round(width * fx), y = Math.round(floorY * 0.52)
      const glow = add(this.add.circle(x, y, step * 1.5, 0xff7b39, 0.16)) as Phaser.GameObjects.Arc
      this.tweens.add({ targets: glow, alpha: { from: 0.1, to: 0.22 }, scale: { from: 0.9, to: 1.08 }, duration: 380 + fx * 200, yoyo: true, repeat: -1 })
      add(this.add.sprite(x, y, 'torch').setScale(ts).play({ key: 'torch:burn', startFrame: fx > 0.5 ? 1 : 0 }))
    }
  }

  private buildFallback(width: number, height: number, floorY: number) {
    const g = this.add.graphics()
    g.fillStyle(0x182333).fillRect(0, 0, width, height)
    g.fillStyle(0x101827).fillRect(0, 0, width, floorY)
    this.layer!.add(g)
  }

  /** Adds a subtle stone arena frame around the existing dungeon tiles. */
  private buildArenaFrame(width: number, height: number, floorY: number, step: number) {
    const g = this.add.graphics().setDepth(2)
    const sideW = Math.max(10, Math.round(step * 0.42))
    // Heavy side pillars and a lintel make the room read as a deliberate arena.
    g.fillStyle(0x0b111b, 0.55).fillRect(0, 0, sideW, height).fillRect(width - sideW, 0, sideW, height)
    g.fillStyle(0x34445a, 0.95).fillRect(2, 0, 4, height).fillRect(width - 6, 0, 4, height)
    g.fillStyle(0x172437, 0.95).fillRect(6, 0, Math.max(2, sideW - 8), height).fillRect(width - sideW + 6, 0, Math.max(2, sideW - 8), height)
    g.fillStyle(0x43536a, 0.95).fillRect(0, Math.max(0, floorY - 5), width, 5)
    g.fillStyle(0x0a111b, 0.8).fillRect(0, floorY, width, 3)
    // Small gold pennants in the upper corners; keep the centre clear for combat feedback.
    for (const x of [sideW + 9, width - sideW - 9]) {
      g.fillStyle(0x9b7435, 1).fillRect(x, 7, 2, Math.max(18, floorY * 0.24))
      g.fillStyle(0xd5ad5c, 1)
      g.fillTriangle(x + 1, 9, x + 17, 15, x + 1, 23)
    }
    this.layer!.add(g)
  }

  private spawnActors() {
    const s = this.actorScale
    this.hero?.destroy(); this.monster?.destroy(); this.chest?.destroy()
    const shadow = (x: number, w: number) => this.layer!.add(this.add.ellipse(x, this.heroHome.y, w, w * 0.22, 0x070b12, 0.45))
    shadow(this.heroHome.x, 24 * s * 0.9); shadow(this.monsterHome.x, 16 * this.monsterScale() * 0.9)

    if (this.assetsOk) {
      this.hero = this.add.sprite(this.heroHome.x, this.heroHome.y, 'hero').setOrigin(0.5, 1).setScale(s).play('hero:idle')
      this.monster = this.add.sprite(this.monsterHome.x, this.monsterHome.y, this.enemyKey).setOrigin(0.5, 1).setScale(this.monsterScale()).play(`${this.enemyKey}:idle`)
    } else {
      this.hero = this.add.rectangle(this.heroHome.x, this.heroHome.y, 10 * s, 18 * s, 0x3e78b8).setOrigin(0.5, 1)
      this.monster = this.add.rectangle(this.monsterHome.x, this.monsterHome.y, 12 * s, 12 * s, 0x4eb879).setOrigin(0.5, 1)
    }
    this.monster.setVisible(this.monsterAlive)
    if (this.showingChest) this.showChest(false)
    this.tweens.add({ targets: this.hero, y: this.heroHome.y - s, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  }

  // ---- public API used by React ------------------------------------------------------

  private monsterScale() { return this.actorScale + 1 + (this.elite ? 1 : 0) }

  setEnemy(key: EnemySprite, elite = false) {
    this.enemyKey = key
    this.elite = elite
    if (this.ready) this.build()
  }

  playHit(target: 'hero' | 'monster', damage: number, caption?: string) {
    const obj = target === 'hero' ? this.hero : this.monster
    if (!this.ready || !obj) return
    const home = target === 'hero' ? this.heroHome : this.monsterHome
    const dir = target === 'monster' ? 1 : -1
    // The attacker lunges; the victim recoils and flashes.
    const attacker = target === 'monster' ? this.hero : this.monster
    if (attacker && attacker instanceof Phaser.GameObjects.Sprite) {
      const ax = attacker === this.hero ? this.heroHome.x : this.monsterHome.x
      if (attacker === this.hero && this.assetsOk) { attacker.anims.stop(); attacker.setFrame(2); this.time.delayedCall(260, () => attacker.active && attacker.play('hero:idle')) }
      this.tweens.add({ targets: attacker, x: ax + dir * 10 * this.actorScale, duration: 90, yoyo: true, ease: 'Quad.out', onComplete: () => { attacker.x = ax } })
    }
    this.tweens.add({ targets: obj, x: home.x + dir * 5 * this.actorScale, duration: 60, yoyo: true, repeat: 2, delay: 90, onComplete: () => { obj.x = home.x } })
    if (obj instanceof Phaser.GameObjects.Sprite) {
      obj.setTint(target === 'monster' ? 0xffffff : 0xff6666)
      this.time.delayedCall(180, () => obj.active && obj.clearTint())
    }
    this.float(target, `-${damage}`, target === 'monster' ? '#ffd166' : '#ff7777', caption)
  }

  // ---- persistent floating text ----------------------------------------------------------

  /** Shows (or replaces) a label above the hero or monster, or a banner mid-floor, and keeps it visible. */
  float(slot: 'hero' | 'monster' | 'banner', text: string, color: string, caption?: string) {
    this.floats[slot] = { text, color, caption }
    if (this.ready) this.drawFloat(slot, true)
  }

  /** Removes only the mid-floor banner (used for short-lived announcements like the floor number). */
  clearBanner() {
    delete this.floats.banner
    this.floatObjs.banner?.destroy()
    delete this.floatObjs.banner
  }

  /** Reward lines (XP, gold, loot, level-up) shown at the bottom centre; one popup at a time, slow fade, never stranded. */
  popReward(lines: { text: string; color: string }[], ttl = 2800) {
    if (!this.ready || !lines.length) return
    this.dropRewardPop()                       // a new reward replaces the old one: never stack
    const { width, height } = this.scale
    // Bottom centre of the floor, between the two characters: clear of the banner on the wall and of the damage numbers.
    const lineH = 16
    const y0 = height - 8 - lines.length * lineH
    const texts = lines.map((l, i) => this.add.text(0, i * lineH, l.text, {
      fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: l.color, stroke: '#0d1220', strokeThickness: 4, align: 'center'
    }).setOrigin(0.5, 0))
    const c = this.add.container(Math.round(width / 2), y0, texts).setDepth(14).setScale(0.6).setAlpha(0)
    this.rewardPop = { c, endAt: this.time.now + ttl }
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' })
    this.tweens.add({ targets: c, y: y0 - 12, duration: ttl, ease: 'Sine.out' })
    this.fadeRewardPop()
    // Guaranteed removal even if a rebuild cancels the tweens (scene timers are not cancelled by tweens.killAll).
    this.time.delayedCall(ttl + 80, () => { if (this.rewardPop?.c === c) this.dropRewardPop() })
  }

  /** Slow fade over the second half of the popup's life; restarted after a rebuild so it still ends on time. */
  private fadeRewardPop() {
    const pop = this.rewardPop
    if (!pop) return
    const remaining = Math.max(0, pop.endAt - this.time.now)
    this.tweens.add({ targets: pop.c, alpha: 0, duration: Math.max(150, remaining * 0.7), delay: remaining * 0.3, ease: 'Sine.in' })
  }

  private dropRewardPop() {
    this.rewardPop?.c.destroy()
    this.rewardPop = undefined
  }

  clearFloats() {
    this.floats = {}
    this.victoryText = null
    this.victoryObjs.forEach(o => o.destroy()); this.victoryObjs = []
    for (const k of ['hero', 'monster', 'banner'] as const) this.floatObjs[k]?.destroy()
    this.floatObjs = {}
  }

  private drawFloats(animate: boolean) {
    for (const k of ['hero', 'monster', 'banner'] as const) if (this.floats[k]) this.drawFloat(k, animate)
  }

  private drawFloat(slot: 'hero' | 'monster' | 'banner', animate: boolean) {
    const f = this.floats[slot]
    this.floatObjs[slot]?.destroy()
    if (!f) return
    const { width } = this.scale
    const big = slot !== 'banner'
    const x = slot === 'banner' ? Math.round(width / 2) : (slot === 'hero' ? this.heroHome : this.monsterHome).x
    const y = slot === 'banner' ? Math.round(this.scale.height - 14) : (slot === 'hero' ? this.heroHome : this.monsterHome).y - 24 * this.actorScale - 6
    const num = this.add.text(0, 0, f.text, {
      fontFamily: 'monospace', fontSize: big ? '20px' : '14px', fontStyle: 'bold', color: f.color,
      stroke: '#0d1220', strokeThickness: 5, align: 'center', wordWrap: { width: Math.max(120, width - 24) }
    }).setOrigin(0.5)
    const parts: Phaser.GameObjects.Text[] = [num]
    if (f.caption) {
      parts.push(this.add.text(0, -num.height / 2 - 7, f.caption, {
        fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: '#0d1220', strokeThickness: 4, backgroundColor: slot === 'hero' ? '#a3323acc' : '#b8893fcc', padding: { x: 4, y: 1 }
      }).setOrigin(0.5))
    }
    // keep the label inside the scene horizontally
    const half = Math.max(...parts.map(t => t.width)) / 2 + 4
    const cx = Phaser.Math.Clamp(x, half, width - half)
    const c = this.add.container(cx, y, parts).setDepth(10)
    this.floatObjs[slot] = c
    if (animate) {
      c.setScale(0.5).setAlpha(0.2).setY(y + 14)
      this.tweens.add({ targets: c, scale: 1, alpha: 1, y, duration: 260, ease: 'Back.out', delay: slot === 'hero' ? 160 : 90 })
    }
  }

  // ---- combo counter (top-left of the scene) -----------------------------------------------

  setCombo(n: number) {
    const grew = n > this.combo
    this.combo = n
    if (this.ready) this.drawCombo(grew)
  }

  private drawCombo(pop: boolean) {
    this.comboObj?.destroy(); this.comboObj = undefined
    if (this.combo < 2 || this.defeated) return
    const t = this.add.text(6, 3, `COMBO ×${this.combo}`, {
      fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffd166', stroke: '#0d1220', strokeThickness: 5
    }).setOrigin(0, 0).setDepth(11)
    this.comboObj = t
    if (pop) { t.setScale(1.5); this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.out' }) }
  }

  // ---- defeat -------------------------------------------------------------------------------

  /** The hero collapses, the scene turns red and "YOU DIED" stays on screen until the run is left. */
  showDefeat(animate = true) {
    this.defeated = true
    this.comboObj?.destroy(); this.comboObj = undefined
    if (this.ready) this.applyDefeat(animate)
  }

  private applyDefeat(animate: boolean) {
    const { width, height } = this.scale
    this.defeatObjs.forEach(o => o.destroy()); this.defeatObjs = []
    const veil = this.add.rectangle(0, 0, width, height, 0x8b1020, animate ? 0 : 0.32).setOrigin(0).setDepth(8)
    const size = Phaser.Math.Clamp(Math.round(this.floorY * 0.55), 18, 40)
    const title = this.add.text(Math.round(width / 2), Math.round(this.floorY * 0.5), 'YOU DIED', {
      fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color: '#ff5a6a', stroke: '#1a0508', strokeThickness: 7
    }).setOrigin(0.5).setDepth(12)
    this.defeatObjs.push(veil, title)
    const hero = this.hero
    if (hero instanceof Phaser.GameObjects.Sprite) { hero.anims.stop(); hero.setFrame(0) }
    if (hero) { this.tweens.killTweensOf(hero); hero.setOrigin(0.5, 1).setY(this.heroHome.y); if (hero instanceof Phaser.GameObjects.Sprite) hero.setTint(0x7a7f8c) }
    if (animate) {
      this.tweens.add({ targets: veil, fillAlpha: 0.32, duration: 500, delay: 250 })
      this.tweens.add({ targets: hero, angle: -90, duration: 420, delay: 200, ease: 'Bounce.out' })
      title.setScale(0.4).setAlpha(0)
      this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, delay: 450, ease: 'Back.out' })
    } else if (hero) hero.setAngle(-90)
  }

  resetMonster() {
    this.monsterAlive = true; this.showingChest = false
    this.chest?.destroy(); this.chest = undefined
    if (!this.ready || !this.monster) return
    this.monster.setVisible(true).setAlpha(1).setScale(this.monsterScale())
    this.tweens.add({ targets: this.monster, scale: { from: this.monsterScale() * 0.4, to: this.monsterScale() }, alpha: { from: 0, to: 1 }, duration: 250 })
  }

  /** The kill: white flash, pixel burst, little shake, then the monster fades into a chest. */
  hideMonster() {
    this.monsterAlive = false
    if (!this.ready || !this.monster) return
    const m = this.monster
    if (m instanceof Phaser.GameObjects.Sprite) { m.setTintFill(0xffffff); this.time.delayedCall(130, () => m.active && m.clearTint()) }
    this.cameras.main.shake(180, 0.006)
    this.burst(this.monsterHome.x, this.monsterHome.y - 8 * this.monsterScale())
    this.tweens.add({
      targets: m, alpha: 0, scale: this.actorScale * 0.5, y: this.monsterHome.y + 4, duration: 260, delay: 200,
      onComplete: () => { if (this.monsterAlive) return; this.monster?.setVisible(false); this.monster && (this.monster.y = this.monsterHome.y); this.showChest(true) }
    })
  }

  private burst(x: number, y: number) {
    const colors = [0xffd166, 0xffffff, 0xff9d6e, 0xf4d58c]
    for (let i = 0; i < 14; i++) {
      const size = Phaser.Math.Between(4, 7)
      const p = this.add.rectangle(x, y, size, size, colors[i % colors.length]).setDepth(13)
      const ang = (i / 14) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2), dist = Phaser.Math.Between(26, 52) + this.actorScale * 6
      this.tweens.add({ targets: p, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist * 0.8, alpha: 0, duration: 650, ease: 'Quad.out', onComplete: () => p.destroy() })
    }
  }

  /** Persistent gold banner mid-floor (the counterpart of YOU DIED) until the next fight starts. */
  showVictory(text: string, animate = true) {
    this.victoryText = text
    if (this.ready && !this.defeated) this.applyVictory(animate)
  }

  private applyVictory(animate: boolean) {
    this.victoryObjs.forEach(o => o.destroy()); this.victoryObjs = []
    if (!this.victoryText) return
    const { width, height } = this.scale
    const label = this.victoryText.replace('ENEMY SLAIN!', 'VICTORY').replace('ELITE SLAIN!', 'ELITE VICTORY')
    // Keep the victory cue in the top-centre safe area: small enough to leave the
    // hero, enemy, combo counter and floating damage numbers unobstructed.
    const size = Phaser.Math.Clamp(Math.round(this.floorY * 0.15), 10, 12)
    const plaqueW = Math.min(width - 28, Math.max(104, label.length * size * 0.62 + 20))
    const plaqueY = Math.max(13, Math.round(this.floorY * 0.095))
    const plaque = this.add.rectangle(Math.round(width / 2), plaqueY, plaqueW, size + 12, 0x172437, 0.88)
      .setStrokeStyle(1, 0xd0a852, 0.9).setDepth(11)
    const t = this.add.text(Math.round(width / 2), plaqueY, label, {
      fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color: '#ffd77d', stroke: '#1d1405', strokeThickness: 2
    }).setOrigin(0.5).setDepth(12)
    this.victoryObjs.push(plaque, t)
    if (animate) {
      plaque.setScale(0.7).setAlpha(0)
      t.setScale(0.7).setAlpha(0)
      this.tweens.add({ targets: [plaque, t], scale: 1, alpha: 1, duration: 260, delay: 250, ease: 'Back.out' })
    }
  }

  private showChest(pop: boolean) {
    this.showingChest = true
    if (!this.assetsOk) return
    this.chest?.destroy()
    this.chest = this.add.sprite(this.monsterHome.x, this.monsterHome.y, 'chest', 0).setOrigin(0.5, 1).setScale(this.monsterScale())
    if (!pop) { this.chest.setFrame(1); return }
    this.tweens.add({ targets: this.chest, scale: { from: 0.1, to: this.monsterScale() }, duration: 180, ease: 'Back.out' })
    this.time.delayedCall(420, () => this.chest?.active && this.chest.setFrame(1))
  }
}
