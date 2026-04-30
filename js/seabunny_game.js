import * as PIXI from '../libraries/pixi.js'
window.PIXI = PIXI  // global

// config
const GAME_WIDTH = 2048
const GAME_HEIGHT = 720

const PARALLAX = [2, 3, 4]  // bg, far, near
const G_HEIGHT = 300

const RIPPLE_SPEED = 1
const RIPPLE_STRENGTH = 80
const COIN_SPEED = 2

const COIN_MIN_TIME = 800
const COIN_MAX_TIME = 4000
const COIN_CHANCE_SCALE = 100
const COIN_5_CHANCE = 8
const COIN_LIFETIME = 6

const BG_DRAG_STRENGTH = 0.7

// create app
const app = new PIXI.Application()

await app.init({ width: GAME_WIDTH, height: GAME_HEIGHT, backgroundAlpha: 0, resolution: 2, antialias: true })

app.ticker.maxFPS = 60
app.stage.eventMode = "static"
gameBox.appendChild(app.canvas)
window.app = app

app.canvas.oncontextmenu = () => false;

if (PIXI.isMobile.any) document.querySelectorAll(".nomobile").forEach(x => x.remove())
else document.querySelectorAll(".yesmobile").forEach(x => x.remove())

// easy variables
let nextBubble = 0
let nextFloatingCoin = 0
let lastTick = 0

window.gameSize = { width: GAME_WIDTH, height: GAME_HEIGHT }
window.groundHeight = G_HEIGHT

// load textures
window.cached_textures = await PIXI.Assets.load([
    { alias: "bunny_sheet", src: "./assets/bunny_sheet.json" },

    { alias: "bg", src: "./assets/bg.png" },
    { alias: "mg_far", src: "./assets/mg_far.png" },
    { alias: "mg_near", src: "./assets/mg_near.png" },
    { alias: "ground", src: "./assets/ground.png" },

    { alias: "bubble", src: "./assets/bubble.png" },
    { alias: "coin", src: "./assets/coin.png" },
    { alias: "coin_5", src: "./assets/coin_5.png" },
    { alias: "water_map", src: "./assets/water_map.png" },
    { alias: "shadow", src: "./assets/shadow.png" },
    { alias: "zzz", src: "./assets/zzz.png" }
])

window.bunnySheet = cached_textures.bunny_sheet.textures

function randomX() {
    return rng(100, GAME_WIDTH - 100)
}

// ===== BACKGROUND ===== //

const bg_layer = new PIXI.Container({ zIndex: -10, interactive: true })
app.stage.addChild(bg_layer)
window.bg_layer = bg_layer

const bg = new PIXI.Sprite({ texture: cached_textures.bg, scale: 2, zIndex: -10  })
const mgf = new PIXI.Sprite({ texture: cached_textures.mg_far, scale: 2, zIndex: -9 })
const mgn = new PIXI.Sprite({ texture: cached_textures.mg_near, scale: 2, zIndex: -8 })

// filter

let displacementSprite = new PIXI.Sprite({ texture: cached_textures.water_map })

displacementSprite.texture.source.addressMode = 'repeat';

bg_layer.addChild(displacementSprite);

let waterFilter = new PIXI.DisplacementFilter({
    sprite: displacementSprite,
    scale: { x: Math.round(bg.width / RIPPLE_STRENGTH), y: Math.round(bg.height / RIPPLE_STRENGTH) }
})
if (!settings.noWaterShader) bg_layer.filters = [waterFilter]

window.bg = bg
window.waterFilter = waterFilter

bg_layer.addChild(bg)
bg_layer.addChild(mgf)
bg_layer.addChild(mgn)

window.updateBG = function() {
    let posOff = (gameBox.scrollWidth <= gameBox.clientWidth) ? 0 : 40
    bg.position.x =  (gameBox.scrollLeft / PARALLAX[0]) - (posOff)
    mgf.position.x = (gameBox.scrollLeft / PARALLAX[1]) - (posOff * 0.75)
    mgn.position.x = (gameBox.scrollLeft / PARALLAX[2]) - (posOff * 0.5)
}

// load ground

const ground = new PIXI.Sprite({
    texture: cached_textures.ground,
    zIndex: -2,
    scale: 2,
    eventMode: "none",
    x: 0
})
app.stage.addChild(ground)

// bg interactivity
bg_layer.on('pointerdown', e => {
    deselectCreature()
    bgDrag = { global: e.global.x, scroll: gameBox.scrollLeft }
})

bg_layer.on('pointerup', () => bgDrag = null)
bg_layer.on('pointerupoutside', () => bgDrag = null)

bg_layer.on('pointermove', e => {
    if (!settings.noCursorTrail) createBubble(e.global.x, e.global.y)

    if (bgDrag) {
        let diff = bgDrag.global - e.global.x
        cameraScroll(bgDrag.scroll + (diff * BG_DRAG_STRENGTH), true, true)
    }
})

// ===== BUBBLES ===== //

const bubbles = new PIXI.Container({ interactiveChildren: false })
app.stage.addChild(bubbles)

function createBubble(x, y) {
    let now = Date.now()
    if (now < nextBubble) return
    nextBubble = now + rng(40, 80)
    let size = rng(5, 10)
    let bSprite = new PIXI.Sprite({ texture: cached_textures.bubble, width: size, height: size, x, y })
    bSprite.data_speed = rng(2, 4) / 1.5
    bubbles.addChild(bSprite)
}

// ===== COINS ===== //

const coinParticles = new PIXI.Container()
window.coinParticles = coinParticles
app.stage.addChild(coinParticles)

const floatingCoins = new PIXI.Container()
app.stage.addChild(floatingCoins)

function queueFloatingCoin() {
    let max = Math.max(COIN_MIN_TIME * 1.25, COIN_MAX_TIME - (COIN_CHANCE_SCALE * creatures.length))
    nextFloatingCoin = Date.now() + rng(COIN_MIN_TIME, max)
}

function checkFloatingCoin(t) {
    if (t > nextFloatingCoin) {
        spawnFloatingCoin()
        queueFloatingCoin()
    }
}

function spawnFloatingCoin() {
    let is5 = rng(1, COIN_5_CHANCE) == 1
    let randomY = rng(50, GAME_HEIGHT - G_HEIGHT - 25)
    let coinSprite = new PIXI.Sprite({
        texture: cached_textures[is5 ? "coin_5" : "coin"],
        scale: is5 ? 0.2 : 0.12,
        resolution: 100,
        interactive: true,
        cursor: "pointer",
        alpha: 0,
        anchor: 0.5,
        x: randomX(),
        y: randomY
    })

    // coin movement
    let coinEase = new Ease.Ease()
    let collected = false
    let dur = COIN_LIFETIME * rng(95, 105) / 100
    coinEase.add(coinSprite, { y: randomY - 60 }, { duration: dur * 1000, ease: 'easeOutSine' })
    coinEase.add(coinSprite, { alpha: 1 }, { duration: 500, ease: 'linear' })
    setTimeout(() => { if (!collected) coinEase.add(coinSprite, { alpha: 0 }, { duration: 1000, ease: 'linear' }) }, (dur * 1000) - 1000);
    coinEase.on("complete", () => {
        coinEase.destroy()
        coinSprite.destroy()
    })

    // collect coin
    coinSprite.on('pointerdown', e => {
        coins += (is5 ? 5 : 1)
        coinEase.removeAll()
        coinSprite.alpha = 1
        coinSprite.interactive = false
        coinEase.add(coinSprite, { y: coinSprite.position.y - 40, scaleX: -coinSprite.scale.x / 1.5, alpha: 0 }, { duration: 300, ease: 'easeOutSine' })
        playSound("coin_pop", { pitch: (rng(90, 110) - (is5 ? 25 : 0)) / 100, volume: 0.3 })
        if (is5) playSound("coins", { pitch: 0.7, volume: 0.3 })
    })

    floatingCoins.addChild(coinSprite)
}
window.spawnFloatingCoin = spawnFloatingCoin

queueFloatingCoin()

// ====== CREATURE ===== //

function addCreature(config, isNew) {
    let c = new Creature(config)
    creatures.push(c)
    spawn_creature(c, isNew)
    return c
}
window.addCreature = addCreature

const creatureSprites = new PIXI.Container({ sortableChildren: true, zIndex: 10 })
window.creatureSprites = creatureSprites
app.stage.addChild(creatureSprites)

window.activeShadows = new PIXI.Container({ zIndex: 1 })
app.stage.addChild(activeShadows)

loadSaveData()

// ===== DRAGGING ===== //

app.stage.on("pointermove", e => {
    if (draggedCreature) draggedCreature.onDrag(e)
})

// ====== EVERY FRAME ===== //

app.ticker.add(() => {
    displacementSprite.x = (displacementSprite.x + RIPPLE_SPEED) % displacementSprite.width;

    bubbles.children.forEach(b => {
        b.position.y -= b.data_speed
        b.alpha -= 0.025
        if (b.alpha <= 0 || b.position.y < -20) b.destroy()
    })

    coinParticles.children.forEach(c => {
        c.position.y -= COIN_SPEED
        c.alpha -= 0.01
        if (c.alpha <= 0) c.destroy()
    })

    updateCoinCounter()
});

// check creatures 0.08 seconds
window.gameTick = 0
setInterval(() => {
    let now = Date.now()

    // if for whatever reason the game doesn't tick for 30 seconds, offline generation kicks in
    if (lastTick > 100) {
        let tickDiff = (now - lastTick)
        if (tickDiff > 30_000) {
            creatures.forEach(x => {
                let earned = x.calculateOffline(lastTick, now)
                if (earned) {
                    x.coinsEarned += earned
                    coins += earned
                }
            })
        }
    }

    creatures.forEach(x => x.tick(now))
    lastTick = now

    checkFloatingCoin(now)
    window.gameTick = (window.gameTick + 1) % 360
}, 80);

// ====== MISC ===== //

function spawn_creature(x, newlySpawned) {
    x.sprite.position.y = !newlySpawned ? GAME_HEIGHT - rng(50, G_HEIGHT) : rng(DRAG_EDGE + 30, GAME_HEIGHT - G_HEIGHT - DRAG_EDGE)
    x.sprite.position.x = !newlySpawned ? randomX() : getCameraCenter(0.12)
    x.setZIndex()
    creatureSprites.addChild(x.sprite)

    x.faceLeft(rng(1, 2) == 2)

    if (newlySpawned) x.startFalling()
    else x.setNextMove(Date.now())
}

get("loading").remove()