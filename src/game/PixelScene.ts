import type { BossId } from '../data'
import Phaser from 'phaser'

export type EnemySprite = 'slime' | 'imp' | 'bat' | 'golem' | 'wraith' | 'scribe' | 'trickster'
const ENEMY_SPRITES: EnemySprite[] = ['slime', 'imp', 'bat', 'golem', 'wraith', 'scribe', 'trickster']
const BOSS_GLOW: Record<string, number> = { golem: 0x6fb5e8, wraith: 0xcfe9f2, scribe: 0x6f86e0, trickster: 0xd77be8, warden: 0xffd166 }

const BASE = import.meta.env.BASE_URL
const TILE = 16
// Frame order in tiles/dungeon.png
const FLOOR_A = 0, FLOOR_B = 1, FLOOR_MOSS = 2, WALL = 3, WALL_TOP = 4

/**
 * Decorative encounter scene. React owns the hearts, enemy HP, enemy identity and progression; this scene only
 * draws and animates. Art lives in public/assets (see ASSET_PIPELINE.md and ASSET_CREDITS.md).
 */
export class PixelScene extends Phaser.Scene {
  private assetsOk = true
  private ready = false
  private enemyKey: EnemySprite = 'slime'
  private boss: BossId | null = null
  private monsterAlive = true
  private showingChest = false
  private layer?: Phaser.GameObjects.Container
  private hero?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle
  private monster?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle
  private chest?: Phaser.GameObjects.Sprite
  private defeated = false
  private defeatObjs: Phaser.GameObjects.GameObject[] = []
  private floorY = 0
  private heroHome = { x: 0, y: 0 }
  private monsterHome = { x: 0, y: 0 }
  private actorScale = 3

  constructor() { super('PixelScene') }

  preload() {
    this.load.setPath(BASE)
    this.load.on('loaderror', () => { this.assetsOk = false })
    this.load.spritesheet('hero', 'assets/characters/hero.png', { frameWidth: 24, frameHeight: 24 })
    for (const k of ENEMY_SPRITES) this.load.spritesheet(k, `assets/enemies/${k}.png`, { frameWidth: TILE, frameHeight: TILE })
    this.load.spritesheet('tiles', 'assets/tiles/dungeon.png', { frameWidth: TILE, frameHeight: TILE })
    this.load.spritesheet('torch', 'assets/props/torch.png', { frameWidth: TILE, frameHeight: TILE })
    this.load.spritesheet('chest', 'assets/props/chest.png', { frameWidth: TILE, frameHeight: TILE })
  }

  create() {
    if (this.assetsOk) {
      const loop = (key: string, frames: number[], rate: number) =>
        this.anims.create({ key, frames: frames.map(frame => ({ key: key.split(':')[0], frame })), frameRate: rate, repeat: -1 })
      loop('hero:idle', [0, 1], 3)
      for (const k of ENEMY_SPRITES) loop(`${k}:idle`, [0, 1], k === 'bat' || k === 'wraith' ? 6 : 2.5)
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
    this.defeatObjs.forEach(o => o.destroy()); this.defeatObjs = []
    this.layer = this.add.container(0, 0)
    this.cameras.main.setSize(width, height)

    const tileScale = height >= 250 ? 3 : 2
    const step = TILE * tileScale
    const compact = height < 170
    const wallRows = Math.max(compact ? 1 : 2, Math.round(height * 0.34 / step))
    const floorY = wallRows * step
    this.floorY = floorY
    this.actorScale = compact ? (height >= 108 ? 3 : 2) : Phaser.Math.Clamp(Math.floor(height / 62), 2, 5)
    const feetY = floorY + (height - floorY) * (compact ? 0.84 : 0.72)
    this.heroHome = { x: Math.round(width * 0.27), y: Math.round(feetY) }
    this.monsterHome = { x: Math.round(width * 0.73), y: Math.round(feetY) }

    if (this.assetsOk) this.buildTextured(width, height, tileScale, step, wallRows, floorY)
    else this.buildFallback(width, height, floorY)
    this.buildArenaFrame(width, height, floorY, step)
    this.spawnActors()
    if (this.defeated) this.applyDefeat(false)
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
    if (this.boss && this.monsterAlive) {   // a slow-pulsing aura marks the boss
      const aura = this.add.circle(this.monsterHome.x, this.monsterHome.y - 7 * this.monsterScale(), 10 * this.monsterScale(), BOSS_GLOW[this.boss], 0.16)
      this.layer!.add(aura)
      this.tweens.add({ targets: aura, alpha: { from: 0.1, to: 0.26 }, scale: { from: 0.92, to: 1.08 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    }

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

  private monsterScale() { return this.actorScale + 1 + (this.boss ? 1 : 0) }

  setEnemy(key: EnemySprite, boss: BossId | null = null) {
    this.enemyKey = key
    this.boss = boss
    if (this.ready) this.build()
  }

  playHit(target: 'hero' | 'monster') {
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
  }

  // ---- defeat -------------------------------------------------------------------------------

  /** The hero collapses and the scene turns red until the run is left (the "YOU DIED" text is HTML, see App.tsx). */
  showDefeat(animate = true) {
    this.defeated = true
    if (this.ready) this.applyDefeat(animate)
  }

  private applyDefeat(animate: boolean) {
    const { width, height } = this.scale
    this.defeatObjs.forEach(o => o.destroy()); this.defeatObjs = []
    const veil = this.add.rectangle(0, 0, width, height, 0x8b1020, animate ? 0 : 0.32).setOrigin(0).setDepth(8)
    this.defeatObjs.push(veil)
    const hero = this.hero
    if (hero instanceof Phaser.GameObjects.Sprite) { hero.anims.stop(); hero.setFrame(0) }
    if (hero) { this.tweens.killTweensOf(hero); hero.setOrigin(0.5, 1).setY(this.heroHome.y); if (hero instanceof Phaser.GameObjects.Sprite) hero.setTint(0x7a7f8c) }
    if (animate) {
      this.tweens.add({ targets: veil, fillAlpha: 0.32, duration: 500, delay: 250 })
      this.tweens.add({ targets: hero, angle: -90, duration: 420, delay: 200, ease: 'Bounce.out' })
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
  /** A brief freeze at the moment of impact (skipped with reduced motion). Real-time timer: the scene clock is what gets paused. */
  private hitStop(ms: number) {
    try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return } catch { /* default: animate */ }
    this.tweens.timeScale = 0.03; this.time.timeScale = 0.03
    window.setTimeout(() => { if (this.sys?.isActive()) { this.tweens.timeScale = 1; this.time.timeScale = 1 } }, ms)
  }

  hideMonster(big = false) {
    this.monsterAlive = false
    if (!this.ready || !this.monster) return
    this.hitStop(big ? 170 : 90)
    if (big) this.cameras.main.flash(160, 255, 255, 255)
    const m = this.monster
    if (m instanceof Phaser.GameObjects.Sprite) { m.setTintFill(0xffffff); this.time.delayedCall(130, () => m.active && m.clearTint()) }
    this.cameras.main.shake(big ? 320 : 220, big ? 0.012 : 0.008)
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
