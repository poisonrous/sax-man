import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

const Game = () => {
  const gameRef = useRef(null);

  useEffect(() => {
    // Prevent multiple Phaser game instances
    if (gameRef.current) return;

    // Phaser game configuration
    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'phaser-container',
      backgroundColor: '#1a1a1a',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 1500 },
          debug: false
        }
      },
      scene: {
        preload: preload,
        create: create,
        update: update
      }
    };

    // Create Phaser game instance
    const game = new Phaser.Game(config);
    gameRef.current = game;

    // --- GLOBAL VARIABLES ---
    let player;
    let playerRect;
    let cursors;
    let platforms;
    let enemies;
    let emitter;

    // Game state variables
    let momentum = 0;
    let baseSpeed = 300;
    let maxMomentum = 1200;
    let isBunnyHopping = false;
    let combo = 0;
    let killSpeedThreshold = 350;
    let lives = 3;
    let isInvulnerable = false;
    let totalXP = 0;

    // Infinite level generation variables
    let nextChunkX = 0;
    const chunkSize = 1200;

    // Biome definitions for level chunks
    const BIOMES = [
      { name: 'Forest', plat: 0x00ff00, bg: '#1a1a1a' },
      { name: 'Corruption', plat: 0x9370DB, bg: '#2a002a' },
      { name: 'Hell', plat: 0xff4500, bg: '#330000' },
      { name: 'Ice', plat: 0x00ffff, bg: '#002233' }
    ];

    // --- AUDIO VARIABLES ---
    let sfxFail, sfxJump;
    let bgmNoise, bgmSaxLayer; // Background music layers
    let melodySounds = [];

    // UI elements
    let speedText, comboText, livesText, xpText, distText;

    // Preload assets (graphics and audio)
    function preload() {
      // Create a red pixel texture for particles
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(0xff0000, 1);
      graphics.fillRect(0, 0, 4, 4);
      graphics.generateTexture('pixel_red', 4, 4);

      // Load sound effects
      this.load.audio('fail', '/assets/sounds/fail.wav');

      // Load background music
      this.load.audio('noise', '/assets/sounds/white_noise.wav');
      this.load.audio('sax_layer', '/assets/sounds/sax_layer.wav');

      // Load melody notes
      this.load.audio('note1', '/assets/sounds/note1.wav');
      this.load.audio('note2', '/assets/sounds/note2.wav');
      this.load.audio('note3', '/assets/sounds/note3.wav');
      this.load.audio('note4', '/assets/sounds/note4.wav');
    }

    // Create game objects and set up scene
    function create() {
      this.physics.world.setFPS(120);

      // --- AUDIO SETUP ---
      sfxFail = this.sound.add('fail', { volume: 0.2 });

      // Background music layers (crossfade system)
      bgmNoise = this.sound.add('noise', { volume: 0.2, loop: true });
      bgmSaxLayer = this.sound.add('sax_layer', { volume: 0, loop: true });

      // Play music after unlock (required by some browsers)
      if (!this.sound.locked) {
        bgmNoise.play();
        bgmSaxLayer.play();
      } else {
        this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
          bgmNoise.play();
          bgmSaxLayer.play();
        });
      }

      // Melody sequence for combo actions
      melodySounds = [
        { key: 'note1', detune: 0 },
        { key: 'note2', detune: 0 },
        { key: 'note3', detune: 0 },
        { key: 'note4', detune: 0 },
        { key: 'note3', detune: 200 },
        { key: 'note4', detune: 500 }
      ];

      // --- GAME OBJECTS SETUP ---
      this.physics.world.setBounds(0, 0, 1000000, 800);
      platforms = this.physics.add.staticGroup();
      enemies = this.physics.add.group();

      // Player setup
      playerRect = this.add.rectangle(100, 400, 32, 32, 0x00ffff);
      this.physics.add.existing(playerRect);
      player = playerRect.body;
      player.setCollideWorldBounds(false);
      player.setBounce(0.0);
      player.setDragX(1000);

      // Camera follows player
      this.cameras.main.setBounds(0, 0, 1000000, 800);
      this.cameras.main.startFollow(playerRect, true, 0.1, 0.1);

      // Particle emitter for effects
      emitter = this.add.particles(0, 0, 'pixel_red', {
        speed: { min: 100, max: 300 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0 },
        blendMode: 'ADD',
        lifespan: 500,
        gravityY: 800,
        emitting: false
      });

      // Collisions
      this.physics.add.collider(playerRect, platforms, onLand, null, this);
      this.physics.add.collider(enemies, platforms);
      this.physics.add.collider(playerRect, enemies, handlePhysicalCollision, processCollision, this);

      // Input setup
      cursors = this.input.keyboard.createCursorKeys();

      // UI setup
      livesText = this.add.text(16, 16, 'LIVES: ♥♥♥', { fontSize: '24px', fill: '#ff0000', fontStyle: 'bold' }).setScrollFactor(0);
      speedText = this.add.text(16, 45, 'SPEED: 0', { fontSize: '24px', fill: '#fff', fontFamily: 'monospace' }).setScrollFactor(0);
      comboText = this.add.text(16, 75, 'COMBO: 0', { fontSize: '24px', fill: '#ffff00', fontFamily: 'monospace' }).setScrollFactor(0);
      distText = this.add.text(780, 16, 'DIST: 0m', { fontSize: '24px', fill: '#fff', align: 'right', fontFamily: 'monospace' }).setOrigin(1, 0).setScrollFactor(0);
      xpText = this.add.text(780, 45, 'XP: 0', { fontSize: '24px', fill: '#00ff00', align: 'right', fontFamily: 'monospace' }).setOrigin(1, 0).setScrollFactor(0);

      // Initial chunk generation
      generateChunk.call(this, 200, true);
      generateChunk.call(this, 200 + chunkSize, false);
      nextChunkX = 200 + chunkSize * 2;
    }

    // Play next melody note for combo actions
    function playNextNote() {
      const index = combo % melodySounds.length;
      const noteConfig = melodySounds[index];
      this.sound.play(noteConfig.key, { detune: noteConfig.detune, volume: 1.0 });
    }

    // Show floating text for feedback (XP, crits, etc.)
    function showFloatingText(x, y, message, color) {
      const text = this.add.text(x, y, message, {
        fontSize: '24px', fontFamily: 'monospace', fontStyle: 'bold',
        fill: color, stroke: '#000', strokeThickness: 4
      });
      this.tweens.add({
        targets: text, y: y - 100, alpha: 0, duration: 1000,
        onComplete: () => text.destroy()
      });
    }

    // Generate a level chunk (platforms and enemies)
    function generateChunk(startX, isSafeZone) {
      const chunkIndex = Math.floor(startX / (chunkSize * 3));
      const currentBiome = BIOMES[chunkIndex % BIOMES.length];
      this.cameras.main.setBackgroundColor(currentBiome.bg);

      // Helper to add platforms
      const addPlat = (x, y, w) => {
        const p = this.add.rectangle(startX + x, y, w, 32, currentBiome.plat);
        this.physics.add.existing(p, true);
        platforms.add(p);
      };
      // Helper to add enemies
      const addEnemy = (x, y) => {
        const e = this.add.rectangle(startX + x, y, 40, 40, 0xff0000);
        this.physics.add.existing(e);
        e.body.setGravityY(1500);
        e.body.setImmovable(true);
        enemies.add(e);
      };

      // Safe zone chunk (no enemies)
      if (isSafeZone) { addPlat(0, 550, chunkSize); return; }

      // Random pattern for platforms/enemies
      const pattern = Phaser.Math.Between(0, 3);
      if (pattern === 0) {
        addPlat(0, 550, 300); addPlat(400, 450, 200); addEnemy(450, 400); addPlat(700, 350, 200); addPlat(1000, 550, 200); addEnemy(1050, 500);
      } else if (pattern === 1) {
        addPlat(0, 550, 200); addPlat(300, 550, 200); addEnemy(350, 500); addPlat(700, 550, 200); addEnemy(750, 500); addPlat(1100, 500, 100);
      } else if (pattern === 2) {
        addPlat(0, 550, 1200); addEnemy(400, 500); addEnemy(800, 500);
      } else {
        addPlat(0, 550, 200); addPlat(300, 400, 100); addEnemy(300, 350); addPlat(500, 300, 100); addPlat(700, 200, 100); addPlat(900, 550, 300); addEnemy(1000, 500);
      }
    }

    // Determine if collision should be processed (player vs enemy)
    function processCollision(playerObj, enemyObj) {
      if (!enemyObj.active) return false;

      const isFalling = player.velocity.y > 0;
      const isAbove = playerObj.y < (enemyObj.y - 30);
      const isPogoing = cursors.down.isDown;

      // Pogo attack (down key + falling)
      if (isFalling && isAbove) {
        if (isPogoing) {
          killEnemy.call(this, enemyObj, true);
          return false;
        } else {
          return true;
        }
      }
      // Kill enemy if momentum is high enough
      if (momentum >= killSpeedThreshold) {
        killEnemy.call(this, enemyObj, false);
        return false;
      }
      return true;
    }

    // Handle physical collision (player vs enemy)
    function handlePhysicalCollision(playerObj, enemyObj) {
      const hitFromAbove = enemyObj.body.touching.up && playerObj.body.touching.down;
      if (hitFromAbove) {
        player.setVelocityY(-900);
        combo++;
        playNextNote.call(this);
        enemyObj.fillColor = 0xffffff;
        this.time.delayedCall(100, () => enemyObj.fillColor = 0xff0000);
        updateUI();
      } else {
        if (!isInvulnerable) takeDamage.call(this);
      }
    }

    // Kill enemy and handle effects (XP, particles, etc.)
    function killEnemy(enemyObj, isPogo) {
      if (!enemyObj.active) return;
      enemyObj.destroy();
      emitter.emitParticleAt(enemyObj.x, enemyObj.y, 20);
      this.cameras.main.shake(100, 0.01);

      this.sound.play('note4', { detune: isPogo ? 200 : 0, volume: 1.0 });

      if (isPogo) {
        const xpGained = 300; totalXP += xpGained;
        showFloatingText.call(this, enemyObj.x, enemyObj.y - 50, `CRIT! +${xpGained} XP`, '#ff00ff');
        player.setVelocityY(-800);
      } else {
        const xpGained = 100; totalXP += xpGained;
        showFloatingText.call(this, enemyObj.x, enemyObj.y - 50, `+${xpGained} XP`, '#00ff00');
        momentum = Math.floor(momentum / 2);
      }
      updateUI();
    }

    // Handle player taking damage
    function takeDamage() {
      if (lives <= 0) return;
      lives--;
      sfxFail?.play();

      momentum = 0;
      combo = 0;
      bgmSaxLayer.setVolume(0);

      playerRect.setFillStyle(0xff0000);
      this.cameras.main.shake(200, 0.02);
      player.setVelocityY(-400);
      const knockbackDir = player.x < enemies.children.entries[0]?.x ? -1 : 1;
      player.setVelocityX(-300);

      isInvulnerable = true;
      this.tweens.add({
        targets: playerRect, alpha: 0.2, duration: 100, repeat: 5, yoyo: true,
        onComplete: () => { isInvulnerable = false; playerRect.setFillStyle(0x00ffff); playerRect.alpha = 1; }
      });
      updateUI();
      // Restart game if out of lives
      if (lives <= 0) {
        this.time.delayedCall(1000, () => {
          lives = 3; totalXP = 0; this.scene.restart();
        });
      }
    }

    // Called when player lands on a platform
    function onLand() {
      isBunnyHopping = true;
      const isLethal = momentum >= killSpeedThreshold;
      playerRect.setFillStyle(isLethal ? 0xffaa00 : 0x00ff00);
      this.time.delayedCall(300, () => {
        if (!player || !player.touching) return;
        if (player.touching.down) {
          isBunnyHopping = false;
          const stillLethal = momentum >= killSpeedThreshold;
          playerRect.setFillStyle(stillLethal ? 0xffaa00 : 0x00ffff);
          if (momentum > 0 && combo > 0) {
            combo = 0;
            updateUI();
          }
        }
      });
    }

    // Main game loop (update per frame)
    function update() {
      // --- CROSSFADE AUDIO ---
      const progress = Math.min(momentum / 800, 1);

      // Adjust sax layer volume based on momentum
      const saxVol = progress * 0.2;
      if (bgmSaxLayer) bgmSaxLayer.setVolume(saxVol);

      // Adjust noise layer volume inversely
      const noiseVol = (1 - progress) * 0.2;
      if (bgmNoise) bgmNoise.setVolume(noiseVol);

      // Generate new chunks as player moves forward
      if (playerRect.x > nextChunkX - 800) { generateChunk.call(this, nextChunkX, false); nextChunkX += chunkSize; }
      // Reduce momentum when grounded
      if (player.touching.down) { if (momentum > 0) momentum -= 2; if (momentum < 0) momentum = 0; }

      let currentSpeed = baseSpeed + momentum;
      // Handle left/right movement
      if (!isInvulnerable || Math.abs(player.velocity.x) < 50) {
        if (cursors.left.isDown) player.setVelocityX(-currentSpeed);
        else if (cursors.right.isDown) player.setVelocityX(currentSpeed);
      }

      // Down key for fast fall / "pogo" attack
      if (cursors.down.isDown && !player.touching.down) {
        player.setGravityY(4000); playerRect.scaleX = 0.6; playerRect.scaleY = 1.4;
      } else {
        player.setGravityY(1500); playerRect.scaleX = 1; playerRect.scaleY = 1;
      }

      // Change player color based on momentum/lethality
      if (!isInvulnerable && !isBunnyHopping) {
        if (momentum >= killSpeedThreshold) playerRect.setFillStyle(0xffaa00);
        else playerRect.setFillStyle(0x00ffff);
      }

      // Jump logic
      if (Phaser.Input.Keyboard.JustDown(cursors.up)) {
        if (player.touching.down) {
          if (isBunnyHopping) {
            player.setVelocityY(-1000);
            momentum = Math.min(momentum + 150, maxMomentum);
            combo++;
            playNextNote.call(this);
          } else {
            player.setVelocityY(-700);
            combo = 0;
          }
        }
        updateUI();
      }

      // Update UI text
      speedText.setText('SPEED: ' + Math.floor(Math.abs(momentum)));
      const distance = Math.floor(playerRect.x / 100);
      distText.setText('DIST: ' + Math.max(0, distance) + 'm');
      xpText.setText('XP: ' + totalXP);

      // Handle falling out of bounds
      if (playerRect.y > 800) {
        takeDamage.call(this); if (lives > 0) { playerRect.y = 400; player.setVelocity(0, 0); }
      }
    }

    // Update UI elements (combo, lives, etc.)
    function updateUI() {
      comboText.setText('COMBO: ' + combo);
      comboText.setColor(combo > 3 ? '#ff0000' : '#ffff00');
      livesText.setText('LIVES: ' + "♥".repeat(Math.max(0, lives)));
    }

    // Cleanup Phaser game instance on unmount
    return () => {
      game.sound.stopAll();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Container for Phaser game canvas
  return <div id="phaser-container" />;
};

export default Game;