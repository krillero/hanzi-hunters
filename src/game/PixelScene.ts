import Phaser from 'phaser'

export class PixelScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Container
  private monster!: Phaser.GameObjects.Container
  private floatText?: Phaser.GameObjects.Text

  constructor() {
    super('PixelScene')
  }

  create() {
    const { width, height } = this.scale
    const g = this.add.graphics()

    // Dungeon stone floor
    g.fillGradientStyle(0x182333, 0x182333, 0x101827, 0x101827, 1)
    g.fillRect(0, 0, width, height)
    g.lineStyle(1, 0x344256, 0.45)
    const tile = 32
    for (let x = 0; x < width; x += tile) {
      for (let y = 0; y < height; y += tile) {
        g.strokeRect(x + 1, y + 1, tile - 2, tile - 2)
      }
    }

    // Moss and stone details
    for (let i = 0; i < 24; i++) {
      const x = Phaser.Math.Between(8, width - 8)
      const y = Phaser.Math.Between(8, height - 8)
      g.fillStyle(i % 3 === 0 ? 0x42634c : 0x273548, 0.7)
      g.fillRect(x, y, Phaser.Math.Between(2, 5), Phaser.Math.Between(2, 5))
    }

    // Torch lights
    ;[width * 0.18, width * 0.82].forEach((x) => {
      g.fillStyle(0x8b5b36)
      g.fillRect(x - 3, 18, 6, 20)
      g.fillStyle(0xffc15c)
      g.fillRect(x - 4, 12, 8, 8)
      g.fillStyle(0xff7b39, 0.6)
      g.fillCircle(x, 16, 11)
    })

    this.hero = this.makeHero(width * 0.27, height * 0.62)
    this.monster = this.makeSlime(width * 0.72, height * 0.62)

    this.add.text(width / 2, 18, 'DUNGEON • FLOOR 01', {
      fontFamily: 'monospace', fontSize: '12px', color: '#c6d5e6',
      backgroundColor: '#101827cc', padding: { x: 8, y: 5 }
    }).setOrigin(0.5, 0)

    this.tweens.add({
      targets: this.monster, y: this.monster.y - 4, duration: 850,
      yoyo: true, repeat: -1, ease: 'Sine.inOut'
    })
    this.tweens.add({
      targets: this.hero, y: this.hero.y - 2, duration: 1200,
      yoyo: true, repeat: -1, ease: 'Sine.inOut'
    })
    this.scale.on('resize', this.handleResize, this)
  }

  private makeHero(x: number, y: number) {
    const c = this.add.container(x, y)
    const g = this.add.graphics()
    // Pixel-art adventurer: shadow, boots, body, cloak, face, hair, sword
    g.fillStyle(0x070b12, 0.45); g.fillEllipse(0, 24, 42, 10)
    g.fillStyle(0x273b65); g.fillRect(-13, 3, 10, 17); g.fillRect(3, 3, 10, 17)
    g.fillStyle(0x172238); g.fillRect(-15, 17, 13, 5); g.fillRect(2, 17, 13, 5)
    g.fillStyle(0x3e78b8); g.fillRect(-16, -16, 32, 23)
    g.fillStyle(0x244e85); g.fillRect(-20, -9, 7, 19); g.fillRect(13, -9, 7, 19)
    g.fillStyle(0xf1c49a); g.fillRect(-10, -35, 20, 20)
    g.fillStyle(0x563a32); g.fillRect(-11, -39, 22, 8); g.fillRect(-10, -34, 4, 5)
    g.fillStyle(0x202b3e); g.fillRect(-5, -28, 3, 3); g.fillRect(5, -28, 3, 3)
    g.fillStyle(0xc7d9e8); g.fillRect(17, -9, 5, 22); g.fillRect(14, -13, 11, 4)
    g.fillStyle(0xf2c14e); g.fillRect(-3, -12, 6, 6)
    c.add(g)
    return c
  }

  private makeSlime(x: number, y: number) {
    const c = this.add.container(x, y)
    const g = this.add.graphics()
    g.fillStyle(0x070b12, 0.4); g.fillEllipse(0, 22, 46, 10)
    g.fillStyle(0x4eb879); g.fillRoundedRect(-22, -22, 44, 42, 12)
    g.fillStyle(0x80e09a); g.fillRect(-13, -19, 10, 5)
    g.fillStyle(0x163b35); g.fillRect(-11, -4, 5, 7); g.fillRect(7, -4, 5, 7)
    g.fillStyle(0xffffff); g.fillRect(-10, -4, 2, 2); g.fillRect(8, -4, 2, 2)
    g.fillStyle(0x2d7e5c); g.fillRect(-7, 8, 14, 3)
    c.add(g)
    return c
  }

  playHit(target: 'hero' | 'monster', damage: number) {
    const obj = target === 'hero' ? this.hero : this.monster
    const originalX = obj.x
    this.tweens.add({
      targets: obj, x: originalX + (target === 'monster' ? 9 : -9),
      duration: 55, yoyo: true, repeat: 2, onComplete: () => { obj.x = originalX }
    })
    if (target === 'monster') {
      obj.setAlpha(0.45)
      this.time.delayedCall(110, () => obj.setAlpha(1))
    }
    this.floatText?.destroy()
    this.floatText = this.add.text(obj.x, obj.y - 55, `-${damage}`, {
      fontFamily: 'monospace', fontSize: '18px', color: target === 'monster' ? '#ffd166' : '#ff7777',
      stroke: '#101827', strokeThickness: 4
    }).setOrigin(0.5)
    this.tweens.add({
      targets: this.floatText, y: this.floatText.y - 26, alpha: 0, duration: 650,
      onComplete: () => this.floatText?.destroy()
    })
  }

  resetMonster() {
    this.monster.setVisible(true).setAlpha(1)
    this.tweens.add({ targets: this.monster, scale: { from: 0.4, to: 1 }, alpha: { from: 0, to: 1 }, duration: 250 })
  }

  hideMonster() {
    this.tweens.add({ targets: this.monster, alpha: 0, scale: 0.5, duration: 220 })
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const { width, height } = gameSize
    this.cameras.resize(width, height)
    this.scene.restart()
  }
}