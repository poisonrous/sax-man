import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

const Game = () => {
  const gameRef = useRef(null);

  useEffect(() => {
    if (gameRef.current) return;

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 400,
      parent: 'phaser-container',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 1000 },
          debug: true
        }
      },
      scene: {
        preload: preload,
        create: create,
        update: update
      }
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    function preload() {
      // TODO add sounds and sprites here
    }

    let player;
    let cursors;
    let platforms;

    function create() {
      // Floor
      platforms = this.physics.add.staticGroup();
      const ground = this.add.rectangle(400, 380, 800, 50, 0x00ff00);
      this.physics.add.existing(ground, true); // true = estático
      platforms.add(ground);

      // Player
      const playerRect = this.add.rectangle(100, 250, 32, 32, 0x0000ff);
      this.physics.add.existing(playerRect);
      player = playerRect.body;

      // Physics properties
      player.setCollideWorldBounds(true);
      player.setBounce(0.1);
      player.setDragX(500);

      // Collisions
      this.physics.add.collider(playerRect, platforms);

      // Cursors
      cursors = this.input.keyboard.createCursorKeys();
    }

    function update() {
      // Movement
      if (cursors.left.isDown) {
        player.setVelocityX(-200);
      } else if (cursors.right.isDown) {
        player.setVelocityX(200);
      }

      // Jump
      if (cursors.up.isDown && player.touching.down) {
        player.setVelocityY(-600);
      }
    }

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="phaser-container"/>;
};

export default Game;