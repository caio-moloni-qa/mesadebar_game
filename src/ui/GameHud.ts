import Phaser from 'phaser';
import { FONT_FAMILY } from '../config/fonts';

interface SafeArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
}

export interface BuildIcon {
  textureKey: string;
  count: number;
}

export class GameHud {
  private readonly healthText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly healthIcon: Phaser.GameObjects.Image;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  private readonly healthBorder: Phaser.GameObjects.Image;
  private readonly expBar: Phaser.GameObjects.Graphics;
  private readonly expBarFill: Phaser.GameObjects.Image;
  private readonly expBarFillMask: Phaser.GameObjects.Graphics;
  private readonly expBarEffectTop: Phaser.GameObjects.Graphics;
  private readonly expBarEffectBottom: Phaser.GameObjects.Graphics;
  private readonly expBorder: Phaser.GameObjects.Image;
  private expEffectOffset = 0;
  private readonly currencyIcon: Phaser.GameObjects.Image;
  private readonly currencyText: Phaser.GameObjects.Text;
  private readonly rottenHealIcon: Phaser.GameObjects.Image;
  private readonly rottenHealArrow: Phaser.GameObjects.Text;
  private readonly rottenHpLabel: Phaser.GameObjects.Text;
  private readonly rottenHpArrow: Phaser.GameObjects.Text;
  private buildIcons: Phaser.GameObjects.Container[] = [];
  private visible = true;

  constructor(private readonly scene: Phaser.Scene) {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#f7f1dc', stroke: '#14101c', strokeThickness: 4 };
    this.healthText = scene.add.text(0, 0, '', style).setScrollFactor(0).setDepth(23);
    this.levelText = scene.add.text(0, 0, '', style).setScrollFactor(0).setDepth(20);
    this.timerText = scene.add.text(0, 0, '', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);
    this.killsText = scene.add.text(0, 0, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
    this.healthIcon = scene.add.image(0, 0, 'hp-icon').setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.healthBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
    this.healthBorder = scene.add.image(0, 0, 'hp-bar-border').setOrigin(0, 0).setScrollFactor(0).setDepth(21);
    this.expBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
    this.expBarFill = scene.add.image(0, 0, 'exp-bar-fill-new').setOrigin(0, 0).setScrollFactor(0).setDepth(20.05).setVisible(false);
    this.expBarFillMask = scene.add.graphics().setScrollFactor(0).setDepth(20.04).setVisible(false);
    this.expBarFill.setMask(this.expBarFillMask.createGeometryMask());
    this.expBarEffectTop = scene.add.graphics().setScrollFactor(0).setDepth(20.1).setVisible(false);
    this.expBarEffectBottom = scene.add.graphics().setScrollFactor(0).setDepth(20.15).setVisible(false);
    this.expBorder = scene.add.image(0, 0, 'exp-bar-border').setOrigin(0, 0).setScrollFactor(0).setDepth(21);
    this.currencyIcon = scene.add.image(0, 0, 'gem').setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.currencyText = scene.add.text(0, 0, '', style).setOrigin(0, 0).setScrollFactor(0).setDepth(20);
    const arrowStyle: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#ff5c5c', stroke: '#160d22', strokeThickness: 3 };
    const statusLabelStyle: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#f7f1dc', stroke: '#14101c', strokeThickness: 3 };
    this.rottenHealIcon = scene.add.image(0, 0, 'upgrade-life-steal-icon').setOrigin(0, 0.5).setScrollFactor(0).setDepth(23).setVisible(false);
    this.rottenHealArrow = scene.add.text(0, 0, '↓', arrowStyle).setOrigin(0, 0.5).setScrollFactor(0).setDepth(23).setVisible(false);
    this.rottenHpLabel = scene.add.text(0, 0, 'HP', statusLabelStyle).setOrigin(0, 0.5).setScrollFactor(0).setDepth(23).setVisible(false);
    this.rottenHpArrow = scene.add.text(0, 0, '↓', arrowStyle).setOrigin(0, 0.5).setScrollFactor(0).setDepth(23).setVisible(false);
  }

  update(health: number, maxHealth: number, level: number, experience: number, needed: number, elapsedMs: number, kills: number, currency: number, isRotten: boolean): void {
    const safe = this.safeArea();
    const left = safe.left + 26;
    const top = safe.top + 22;
    const healthIconX = left;
    const healthBarX = healthIconX + 32;
    const healthBarY = top + 32;

    this.healthText.setPosition(healthBarX + 140, healthBarY + 16).setOrigin(0.5).setDepth(23);
    this.levelText.setPosition(left, top + 70);
    this.timerText.setPosition(safe.centerX, top);
    this.killsText.setPosition(safe.right - 26, top);
    this.currencyIcon.setPosition(left, top + 102).setDisplaySize(24, 24);
    this.currencyText.setPosition(left + 32, top + 100);

    // Rotten Aura status row: heal-reduction (life-steal icon + down arrow) then "HP" (down arrow), same row as
    // currency but shifted right so they don't collide with it. Only visible while the player is rotten.
    const statusY = top + 100;
    const statusStartX = left + 90;
    this.rottenHealIcon.setPosition(statusStartX, statusY).setDisplaySize(22, 22).setVisible(isRotten);
    this.rottenHealArrow.setPosition(statusStartX + 26, statusY).setVisible(isRotten);
    this.rottenHpLabel.setPosition(statusStartX + 52, statusY).setVisible(isRotten);
    this.rottenHpArrow.setPosition(statusStartX + 80, statusY).setVisible(isRotten);

    this.healthText.setText(`${Math.ceil(health)} / ${maxHealth}`);
    this.levelText.setText(`Nível ${level}`);
    this.timerText.setText(`Sobreviva: ${this.formatTime(elapsedMs)}`);
    this.killsText.setText(`Eliminações: ${kills}`);
    this.currencyText.setText(`${currency}`);
    this.healthIcon.setPosition(healthIconX, healthBarY+2).setDisplaySize(32, 32);
    this.drawBar(this.healthBar, healthBarX + 15, healthBarY+2 + 10, 250, 12, health / maxHealth, 0xd94d59, 4);
    this.healthBorder.setPosition(healthBarX, healthBarY+2).setDisplaySize(280, 32);
    const expWidth = safe.right - safe.left;
    const expScale = expWidth / 1800;
    const expX = safe.left + 76 * expScale;
    const expY = safe.bottom - 24;
    const expHeight = 14;
    const expAreaWidth = expWidth - 152 * expScale;
    const expRatio = Phaser.Math.Clamp(experience / needed, 0, 1);
    this.expEffectOffset = (this.expEffectOffset + this.scene.game.loop.delta * 0.01) % 2048;
    this.drawExpBar(expX, expY, expAreaWidth, expHeight, expRatio);
    this.expBorder.setPosition(safe.left, safe.bottom - 32).setDisplaySize(expWidth, 32);
    this.layoutBuildIcons(healthBarX, healthBarY, left);
  }

  setBuild(items: BuildIcon[]): void {
    this.buildIcons.forEach((icon) => icon.destroy());
    this.buildIcons = items.map(({ textureKey, count }) => this.createBuildIcon(textureKey, count));
    this.buildIcons.forEach((icon) => icon.setVisible(this.visible));
  }

  /** Hides/shows every HUD element, including build icons created later while hidden (e.g. during the starting-upgrade picker). */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.healthText.setVisible(visible);
    this.levelText.setVisible(visible);
    this.timerText.setVisible(visible);
    this.killsText.setVisible(visible);
    this.healthIcon.setVisible(visible);
    this.healthBar.setVisible(visible);
    this.healthBorder.setVisible(visible);
    this.expBar.setVisible(visible);
    this.expBarFill.setVisible(visible);
    this.expBarFillMask.setVisible(visible);
    this.expBarEffectTop.setVisible(visible);
    this.expBarEffectBottom.setVisible(visible);
    this.expBorder.setVisible(visible);
    this.currencyIcon.setVisible(visible);
    this.currencyText.setVisible(visible);
    this.buildIcons.forEach((icon) => icon.setVisible(visible));
    // Only force these off — their "on" state is conditional on isRotten and gets set by the next update() call.
    if (!visible) {
      this.rottenHealIcon.setVisible(false);
      this.rottenHealArrow.setVisible(false);
      this.rottenHpLabel.setVisible(false);
      this.rottenHpArrow.setVisible(false);
    }
  }

  private createBuildIcon(textureKey: string, count: number): Phaser.GameObjects.Container {
    const isWeapon = textureKey.startsWith('weapon-');
    const strokeColor = isWeapon ? 0xc7c7c7 : 0x9a7bca;
    const background = this.scene.add.rectangle(0, 0, 42, 42, 0x171222, 0.9).setStrokeStyle(2, strokeColor, 0.92);
    const icon = this.scene.add.image(0, 0, textureKey).setDisplaySize(34, 34);
    const counterBackground = this.scene.add.circle(15, -15, 11, 0x382353, 0.98).setStrokeStyle(2, 0xf5dc91, 0.92);
    const counter = this.scene.add.text(15, -15, `×${count}`, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#fff7d8', stroke: '#160d22', strokeThickness: 3 })
      .setOrigin(0.5);
    const showCounter = count > 1;
    counterBackground.setVisible(showCounter);
    counter.setVisible(showCounter);
    return this.scene.add.container(0, 0, [background, icon, counterBackground, counter]).setScrollFactor(0).setDepth(24);
  }

  private layoutBuildIcons(healthBarX: number, healthBarY: number, left: number): void {
    const spacing = 48;
    const startX = left + 26;
    const y = healthBarY - 22;
    this.buildIcons.forEach((icon, index) => icon.setPosition(startX + index * spacing, y));
  }

  private drawExpBar(x: number, y: number, width: number, height: number, ratio: number): void {
    const safeRatio = Phaser.Math.Clamp(ratio, 0, 1);
    const fillWidth = Math.max(0, width * safeRatio);
    this.expBar.clear();
    this.expBar.fillStyle(0x0b0d14, 0.95).fillRect(x, y, width, height);

    if (fillWidth > 0) {
      this.expBarFill.setPosition(x, y).setDisplaySize(width, height).setVisible(this.visible);
      this.expBarFillMask.clear();
      if (this.visible) {
        this.expBarFillMask.fillStyle(0xffffff, 1).fillRect(x, y, fillWidth, height);
      }

      this.expBarEffectTop.clear();
      this.expBarEffectTop.fillStyle(0xffffff, 0.14);
      this.expBarEffectTop.fillRect(x, y, fillWidth, Math.max(2, height * 0.2));
      this.expBarEffectTop.fillStyle(0xffffff, 0.08);
      const effectWidth = Math.max(16, fillWidth * 0.14);
      const effectX = x + (Math.sin(this.expEffectOffset * 0.006) * fillWidth * 0.2);
      this.expBarEffectTop.fillRect(effectX, y, effectWidth, Math.max(2, height * 0.5));

      this.expBarEffectBottom.clear();
      this.expBarEffectBottom.fillStyle(0xffffff, 0.08);
      this.expBarEffectBottom.fillRect(x, y + height - Math.max(2, height * 0.2), fillWidth, Math.max(2, height * 0.2));
      this.expBarEffectBottom.fillStyle(0xffffff, 0.05);
      this.expBarEffectBottom.fillRect(effectX * 0.9 + x * 0.1, y + height * 0.35, Math.max(10, fillWidth * 0.1), Math.max(2, height * 0.45));

      this.expBarFillMask.setVisible(this.visible);
      this.expBarEffectTop.setVisible(this.visible);
      this.expBarEffectBottom.setVisible(this.visible);
    } else {
      this.expBarFill.setVisible(false);
      this.expBarFillMask.clear().setVisible(false);
      this.expBarEffectTop.clear().setVisible(false);
      this.expBarEffectBottom.clear().setVisible(false);
    }
  }

  private drawBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, ratio: number, color: number, radius: number): void {
    const fillWidth = Math.max(0, width * Phaser.Math.Clamp(ratio, 0, 1));
    graphics.clear().fillStyle(0x0b0d14, 0.8);
    if (radius > 0) graphics.fillRoundedRect(x, y, width, height, radius).fillStyle(color).fillRoundedRect(x, y, fillWidth, height, radius);
    else graphics.fillRect(x, y, width, height).fillStyle(color).fillRect(x, y, fillWidth, height);
  }

  private safeArea(): SafeArea {
    const gameWidth = this.scene.scale.gameSize.width;
    const gameHeight = this.scene.scale.gameSize.height;
    const parentWidth = this.scene.scale.parentSize.width || gameWidth;
    const parentHeight = this.scene.scale.parentSize.height || gameHeight;
    const scale = Math.max(parentWidth / gameWidth, parentHeight / gameHeight);
    const visibleWidth = parentWidth / scale;
    const visibleHeight = parentHeight / scale;
    const left = Math.max(0, (gameWidth - visibleWidth) / 2);
    const top = Math.max(0, (gameHeight - visibleHeight) / 2);

    return {
      left,
      top,
      right: gameWidth - left,
      bottom: gameHeight - top,
      centerX: gameWidth / 2
    };
  }

  private formatTime(ms: number): string {
    const seconds = Math.max(0, Math.ceil((180000 - ms) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
