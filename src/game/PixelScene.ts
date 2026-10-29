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
  private floatText?: Phaser.GameObjects.Text
  private heroHome = { x: 0, y: 0 }
  private monsterHome = { x: 0, y: 0 }
  private actorScale = 3

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
    this.floatText?.destroy()
    this.layer = this.add.container(0, 0)
    this.cameras.main.setSize(width, height)

    const tileScale = height >= 250 ? 3 : 2
    const step = TILE * tileScale
    const wallRows = Math.max(2, Math.round(height * 0.34 / step))
    const floorY = wallRows * step
    this.actorScale = Phaser.Math.Clamp(Math.floor(height / 62), 2, 5)
    const feetY = floorY + (height - floorY) * 0.72
    this.heroHome = { x: Math.round(width * 0.27), y: Math.round(feetY) }
    this.monsterHome = { x: Math.round(width * 0.73), y: Math.round(feetY) }

    if (this.assetsOk) this.buildTextured(width, height, tileScale, step, wallRows, floorY)
    else this.buildFallback(width, height, floorY)
    this.spawnActors()
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

  private spawnActors() {
    const s = this.actorScale
    this.hero?.destroy(); this.monster?.destroy(); this.chest?.destroy()
    const shadow = (x: number, w: number) => this.layer!.add(this.add.ellipse(x, this.heroHome.y, w, w * 0.22, 0x070b12, 0.45))
    shadow(this.heroHome.x, 24 * s * 0.9); shadow(this.monsterHome.x, 16 * (s + 1) * 0.9)

    if (this.assetsOk) {
      this.hero = this.add.sprite(this.heroHome.x, this.heroHome.y, 'hero').setOrigin(0.5, 1).setScale(s).play('hero:idle')
      this.monster = this.add.sprite(this.monsterHome.x, this.monsterHome.y, this.enemyKey).setOrigin(0.5, 1).setScale(s + 1).play(`${this.enemyKey}:idle`)
    } else {
      this.hero = this.add.rectangle(this.heroHome.x, this.heroHome.y, 10 * s, 18 * s, 0x3e78b8).setOrigin(0.5, 1)
      this.monster = this.add.rectangle(this.monsterHome.x, this.monsterHome.y, 12 * s, 12 * s, 0x4eb879).setOrigin(0.5, 1)
    }
    this.monster.setVisible(this.monsterAlive)
    if (this.showingChest) this.showChest(false)
    this.tweens.add({ targets: this.hero, y: this.heroHome.y - s, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  }

  // ---- public API used by React ------------------------------------------------------

  setEnemy(key: EnemySprite) {
    this.enemyKey = key
    if (this.ready) this.build()
  }

  playHit(target: 'hero' | 'monster', damage: number) {
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
    this.floatText?.destroy()
    this.floatText = this.add.text(home.x, home.y - 24 * this.actorScale, `-${damage}`, {
      fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: target === 'monster' ? '#ffd166' : '#ff7777',
      stroke: '#0d1220', strokeThickness: 4
    }).setOrigin(0.5)
    this.tweens.add({ targets: this.floatText, y: this.floatText.y - 26, alpha: 0, duration: 700, delay: 120, onComplete: () => this.floatText?.destroy() })
  }

  resetMonster() {
    this.monsterAlive = true; this.showingChest = false
    this.chest?.destroy(); this.chest = undefined
    if (!this.ready || !this.monster) return
    this.monster.setVisible(true).setAlpha(1).setScale(this.actorScale + 1)
    this.tweens.add({ targets: this.monster, scale: { from: (this.actorScale + 1) * 0.4, to: this.actorScale + 1 }, alpha: { from: 0, to: 1 }, duration: 250 })
  }

  hideMonster() {
    this.monsterAlive = false
    if (!this.ready || !this.monster) return
    this.tweens.add({
      targets: this.monster, alpha: 0, scale: this.actorScale * 0.5, y: this.monsterHome.y + 4, duration: 260, delay: 200,
      onComplete: () => { if (this.monsterAlive) return; this.monster?.setVisible(false); this.monster && (this.monster.y = this.monsterHome.y); this.showChest(true) }
    })
  }

  private showChest(pop: boolean) {
    this.showingChest = true
    if (!this.assetsOk) return
    this.chest?.destroy()
    this.chest = this.add.sprite(this.monsterHome.x, this.monsterHome.y, 'chest', 0).setOrigin(0.5, 1).setScale(this.actorScale + 1)
    if (!pop) { this.chest.setFrame(1); return }
    this.tweens.add({ targets: this.chest, scale: { from: 0.1, to: this.actorScale + 1 }, duration: 180, ease: 'Back.out' })
    this.time.delayedCall(420, () => this.chest?.active && this.chest.setFrame(1))
  }
}
