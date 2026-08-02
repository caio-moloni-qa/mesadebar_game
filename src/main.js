import Phaser from 'phaser';
import './style.css';

const WIDTH = 960;
const HEIGHT = 540;

class BarScene extends Phaser.Scene {
  constructor() {
    super('bar');
    this.score = 0;
  }

  create() {
    this.cameras.main.setBackgroundColor('#1b1028');
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH - 52, HEIGHT - 52, 0x3c2150, 1)
      .setStrokeStyle(5, 0xf0b35a, 0.65);

    this.add.text(32, 24, 'MESA DE BAR', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '28px',
      color: '#ffe6b5'
    });
    this.scoreText = this.add.text(WIDTH - 32, 27, 'Pontos: 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#ffffff'
    }).setOrigin(1, 0);

    this.add.text(WIDTH / 2, HEIGHT - 35, 'Setas ou WASD para jogar · Pegue as moedas!', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      color: '#d9c7e8'
    }).setOrigin(0.5);

    this.table = this.add.ellipse(WIDTH / 2, HEIGHT / 2 + 25, 590, 330, 0x9e5927)
      .setStrokeStyle(10, 0xe8a967);
    this.add.ellipse(WIDTH / 2, HEIGHT / 2 + 25, 520, 270, 0xbc7239, 0.9)
      .setStrokeStyle(2, 0x6c3519, 0.6);

    this.player = this.add.circle(WIDTH / 2, HEIGHT / 2 + 25, 19, 0x62d5ff)
      .setStrokeStyle(4, 0xffffff);
    this.physics.add.existing(this.player);
    this.player.body.setCircle(19);
    this.player.body.setCollideWorldBounds(true);

    this.coins = this.physics.add.group();
    [
      [360, 220], [570, 190], [675, 300], [550, 400], [345, 370], [465, 285]
    ].forEach(([x, y]) => this.createCoin(x, y));

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);
  }

  createCoin(x, y) {
    const coin = this.add.circle(x, y, 12, 0xffd54a).setStrokeStyle(3, 0xfff1a8);
    this.physics.add.existing(coin);
    coin.body.setCircle(12);
    this.coins.add(coin);
    this.tweens.add({ targets: coin, scale: 1.16, duration: 650, yoyo: true, repeat: -1 });
  }

  collectCoin(_player, coin) {
    coin.destroy();
    this.score += 10;
    this.scoreText.setText(`Pontos: ${this.score}`);

    if (this.coins.countActive(true) === 0) {
      this.add.text(WIDTH / 2, 100, 'Rodada completa!', {
        fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '32px', color: '#fff3b0'
      }).setOrigin(0.5);
    }
  }

  update() {
    const speed = 230;
    const body = this.player.body;
    body.setVelocity(0);

    if (this.cursors.left.isDown || this.keys.A.isDown) body.setVelocityX(-speed);
    if (this.cursors.right.isDown || this.keys.D.isDown) body.setVelocityX(speed);
    if (this.cursors.up.isDown || this.keys.W.isDown) body.setVelocityY(-speed);
    if (this.cursors.down.isDown || this.keys.S.isDown) body.setVelocityY(speed);
    body.velocity.normalize().scale(speed);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#1b1028',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [BarScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});
