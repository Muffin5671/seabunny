const BASE_MIN_COINS = 1
const BASE_MAX_COINS = 4
const BASE_COIN_SPEED = 15
const BASE_MINS_AWAKE = 60
const BASE_MOVE_SPEED = 60
const BASE_FALL_SPEED = 100

const BASE_BUY_PRICE = 40
const BUY_PRICE_RATE = 60
const BUY_PRICE_EXPONENT = 80

const UPGRADE_SPEED_AMOUNT = 1.5
const UPGRADE_SLEEP_AMOUNT = 30

const SELL_MULTIPLIER = 0.5

const MAX_UPGRADE_LEVEL = 8
const UPGRADE_TYPES = ["min", "max", "time", "sleep"]
const UPGRADE_PRICE_RATES = [15, 20, 30, 45, 60, 80, 100, 120]
const UPGRADE_PRICE_INTERVAL = 4
const UPGRADE_PRICES = []
const CUMULATIVE_PRICES = []

const REROLL_COLOR_PRICE = 100
const REROLL_TRAIT_PRICE = 200

const MOVE_SECS_MIN = 1
const MOVE_SECS_MAX = 7
const MOVE_CHANCE = 2

const MOVE_FRAME_SPEED = 150
const MOVE_FRAMES = 4

const DRAG_EDGE = 60
const WAKE_DISTANCE = 90

const IDLE_TYPES = ["idle", "loaf", "spike"]
const SPIRTE_SCALE = 0.25
const SHADOW_OFFSET = [15, 50]
const SHADOW_SCALE = 0.5
const SHADOW_ALPHA = 0.15

for (let i = 0; i < MAX_UPGRADE_LEVEL * UPGRADE_TYPES.length; i++) {
    let priceIndex = Math.floor(i / UPGRADE_PRICE_INTERVAL)
    let nextPrice = (UPGRADE_PRICES[i - 1] || 0) + UPGRADE_PRICE_RATES[priceIndex]
    UPGRADE_PRICES.push(nextPrice)
    CUMULATIVE_PRICES.push((CUMULATIVE_PRICES[i - 1] || 0) + nextPrice)
}

class Creature {
    constructor(cfg={}) {
        let now = Date.now()
        
        this.name = ""

        this.upgrades = {}
        UPGRADE_TYPES.forEach(x => this.upgrades[x] = 0)
        
        this.totalUpgrades = 0
        if (cfg.upgrades) this.loadUpgrades(cfg.upgrades)

        this.buyPrice = cfg.buyPrice || Math.round(BASE_BUY_PRICE / 2)
        this.coinsEarned = cfg.coinsEarned || 0

        this.nextCoins = 0
        this.visualCoins = 0

        this.rollColors(false, cfg.col1, cfg.col2)
        
        this.sprite = new PIXI.Container()
        this.texture = "idle"
        this.textures = new PIXI.Container({ interactive: true, cursor: "pointer" })
        this.shadowContainer = new PIXI.Container({ zIndex: -10 })
        this.layers = [
            new PIXI.Sprite({ texture: bunnySheet["idle_1.png"], tint: this.col1, scale: SPIRTE_SCALE, anchor: 0.5, zIndex: 10 }),
            new PIXI.Sprite({ texture: bunnySheet["idle_2.png"], tint: this.col2, scale: SPIRTE_SCALE, anchor: 0.5, zIndex: 11 })
        ]
        this.shadow = new PIXI.Sprite({ texture: cached_textures.shadow, alpha: SHADOW_ALPHA, anchor: 0.5, scale: SHADOW_SCALE, x: SHADOW_OFFSET[0], y: SHADOW_OFFSET[1], zIndex: -1 })
        this.nameTag = new PIXI.Text({
            visible: false,
            anchor: 0.5,
            y: -70,
            text: this.name,
            style: nameTagStyle
        })
        this.sleepIcon = new PIXI.Sprite({ texture: cached_textures.zzz, scale: 0.2, y: -62, anchor: 0.5, visible: false })

        this.layers.forEach(x => this.textures.addChild(x))
        this.textures.addChild(this.shadowContainer)
        this.shadowContainer.addChild(this.shadow)
        this.sprite.addChild(this.textures)
        this.sprite.addChild(this.nameTag)
        this.sprite.addChild(this.sleepIcon)
        this.sprite.class_data = this

        this.idleFrame = 0
        this.rollTrait(false, cfg.traitName)

        this.textures.on('pointerdown', e => this.startDrag(e))
        this.textures.on('pointerup', e => this.finishDrag(e))
        this.textures.on('pointerupoutside', e => this.finishDrag(e))
        this.textures.on('pointerenter', e => this.onHover(true, e))
        this.textures.on('pointerleave', e => this.onHover(false, e))

        this.coinOffset = rng(1, 10) * 100
        this.setNextCoin(now)
        this.nextCoins += this.coinOffset

        this.moving = false
        this.walking = false
        this.movedRecently = false

        this.facingLeft = true
        this.falling = false
        this.sleeping = false
        this.idleType = 0
        this.walkFrame = 0
        this.setFallLocation()

        if (cfg.name) this.setName(cfg.name)

        if (!isNaN(cfg.sleep)) this.nextSleep = Number(cfg.sleep)
        else this.setNextSleep(now)
    }

    setTexture(frame) {
        this.texture = frame
        this.layers[0].texture = bunnySheet[`${frame}_1.png`]
        this.layers[1].texture = bunnySheet[`${frame}_2.png`]
    }

    idle() {
        this.setTexture(IDLE_TYPES[this.idleFrame])
        this.idleType = 0
    }

    idleSpecial() {
        this.idleType = choose([0, 1, 2].filter(x => x != this.idleType))
        this.setTexture(IDLE_TYPES[this.idleType])
    }

    faceLeft(left) {
        this.facingLeft = !!left
        let scale = Math.abs(this.textures.scale.x)
        this.textures.scale.x = left ? scale : -scale
    }

    rollColors(update, c1, c2) {
        if (c1) c1 = clamp(c1, 1, 0xffffff)
        if (c2) c2 = clamp(c2, 1, 0xffffff)
            
        this.col1 = c1 || hsv(rng(0, 359), rng(0, 80), a_rng(100, 60))   // random light color
        this.col2 = c2 || hsv(rng(0, 359), rng(30, 80), rng(0, 90))      // random almost any color

        if (update) {
            this.layers[0].tint = this.col1
            this.layers[1].tint = this.col2
            this.drawIcon()
        }
    }

    rollTrait(update, name) {
        let oldTrait = this.trait || {}

        if (name) this.trait = traits.find(x => x.name == name) || choose(traits)
        else this.trait = choose(traits.filter(x => x.name != (this.trait || {}).name))

        let isRight = !this.facingLeft
        this.textures.scale.set(this.tt("scale"))
        this.setZIndex()
        if (isRight) this.faceLeft(false)

        if (!this.moving && (this.trait.data.idleFrame || (oldTrait.data || {}).idleFrame)) {
            this.idleFrame = this.trait.data.idleFrame || 0 
            this.idle()
        }

        if (update) this.updateInfo(true)

        return this.trait
    }

    loadUpgrades(upg) {
        Object.keys(this.upgrades).forEach(x => {
            if (upg[x]) {
                let amt = clamp(upg[x], 0, MAX_UPGRADE_LEVEL) || 0
                this.upgrades[x] = amt
                this.totalUpgrades += amt
            }
        })
    }

    // trait mulitpliers
    tt(key, fallback=1) {
        let t = this.trait ? this.trait.data : {}
        return t[key] || fallback
    }

    getCoinRange() {
        let minCoins = BASE_MIN_COINS + this.upgrades.min + this.tt("min", 0)
        let maxCoins = BASE_MAX_COINS + this.upgrades.max + this.tt("max", 0)
        if (minCoins < maxCoins) return [minCoins, maxCoins]
        else return [minCoins, minCoins]
    }

    getCoinSpeed() { return (BASE_COIN_SPEED - (this.upgrades.time * UPGRADE_SPEED_AMOUNT)) * this.tt("speed") }

    getMinsAwake() { return (BASE_MINS_AWAKE + (this.upgrades.sleep * UPGRADE_SLEEP_AMOUNT)) * this.tt("sleep") }

    getUpgradePrice() { return Math.floor(UPGRADE_PRICES[this.totalUpgrades] * this.tt("upgradePrice")) }

    getBulkUpgradePrice(n=1, untilCoins) {
        let sum = 0;
        let count = 0;
        for (let i = 0; i < n; i++) {
            let nextPrice = UPGRADE_PRICES[this.totalUpgrades + i]
            if (!nextPrice || (untilCoins && i > 0 && coins < sum + nextPrice)) break;
            count++;
            sum += nextPrice
        }
        return { price: Math.floor(sum * this.tt("upgradePrice")), count }
    }

    getTraitPrice() { return REROLL_TRAIT_PRICE * this.tt("rerollPrice") }

    getColorPrice() { return REROLL_COLOR_PRICE * this.tt("rerollPrice") }

    getSellPrice() {
        let upgradeCost = CUMULATIVE_PRICES[this.totalUpgrades - 1] || 0
        return Math.floor((upgradeCost + this.buyPrice) * SELL_MULTIPLIER * this.tt("sellPrice"));
    }

    selected() {
        return selectedCreature == this
    }

    dragging() {
        return draggedCreature == this
    }

    tick(time) {
        if (!this.sprite || !time) return

        this.checkSleep(time)
        
        if (!this.sleeping) {
            this.checkEarn(time)
            this.checkMovement(time)
        }

        if (this.visualCoins > 0) {
            
            if (document.hidden) {
                this.earnCoins(this.visualCoins)
                this.visualCoins = 0
            }

            else {
                this.visualCoins -= 1
                this.spawnCoin()
            }

        }
        
        this.updateInfo()

        if (this.lockRecolor) this.updateColor()
    }

    rangeIsEqual() {
        let coinRange = this.getCoinRange()
        return coinRange[0] == coinRange[1]
    }

    rollCoins() {
        let rolls = this.tt("rerolls", 0)
        let range = this.getCoinRange()
        return rolls <= 1 ? rng(range[0], range[1]) : a_rng(range[1], range[0], rolls + 1)
    }

    earn(time) {
        let amt = this.rollCoins()
        let doubleChance = this.tt("doubleChance", 0)
        if (doubleChance > 0 && rng(1, 100) <= doubleChance) amt *= 2
        if (this.selected()) playSound("coins", { pitch: rng(90, 110) / 100, volume: 0.2 })

        this.visualCoins += amt
        this.setNextCoin(time)
    }

    checkEarn(time) {
        if (time >= this.nextCoins) this.earn(time)
    }

    setNextCoin(time) {
        this.nextCoins = time + (this.getCoinSpeed() * 1000)
        return this.nextCoins
    }

    spawnCoin() {
        let coinSprite = new PIXI.Sprite({ texture: cached_textures.coin, scale: 0.125, anchor: 0.5, alpha: 0.66 })
        coinSprite.position.set(this.sprite.x, this.sprite.y)
        coinParticles.addChild(coinSprite)
        this.earnCoins(1)
    }

    earnCoins(amount) {
        coins += amount
        this.coinsEarned += amount
    }

    setNextMove(time) {
        if (!time) return;
        let nextMoveTime = time + (rng(MOVE_SECS_MIN, MOVE_SECS_MAX) * 1000)

        // chance to do something else instead of moving
        if (this.movedRecently || rng(1, 2) == MOVE_CHANCE) {
            this.movedRecently = false
            this.nextMove = { time: nextMoveTime, position: -1 }
            return;
        }
        
        let dir = this.sprite.x <= 250 ? 1 : (this.sprite.x >= (gameSize.width - 250)) ? -1 : choose([1, -1])
        let target = clamp(this.sprite.x + (rng(50, 400) * dir), 60, gameSize.width - 60)
        if (target) this.nextMove = {
            time: nextMoveTime,
            position: target
        }
    }

    checkMovement(time) {
        if (!this.sleeping && !this.falling && this.nextMove && time > this.nextMove.time && !this.dragging()) {

            if (this.isAboveGround()) {
                this.stopMovement()
                this.startFalling()
                this.sprite.scale.set(1)
                return;
            }

            let duration = 500

            // other effects
            if (this.nextMove.position == -1) {
                let roll = rng(1, 2)
                
                switch(roll) {
                    // change direction
                    case 1: this.faceLeft(!this.facingLeft); break;

                    // special idle
                    case 2: this.idleSpecial(); break;
                }
            }

            // movement
            else {
                let targetPos = this.nextMove.position
                let length = Math.abs(this.sprite.x - targetPos)
                let speedVariance = rng(80, 120) / 100
                let speedMultiplier = this.tt("movement") * speedVariance
                duration = length / (BASE_MOVE_SPEED * speedMultiplier  / 1000)
                if (duration <= 0) duration = 100 // should never run i hope
                this.moving = true
                this.walking = true
                this.movedRecently = true
                this.stopMovement()
                this.faceLeft(this.sprite.x > targetPos)
                this.startWalkCycle(speedMultiplier)
                this.movement = ease.add(this.sprite, { x: targetPos }, { duration, ease: 'linear' })
                setTimeout(() => {  // fixes desync when tabbing off the page, so better than the ease complete event
                    if (this.walking) {
                        this.stopMovement()
                        this.idle()
                    }
                }, duration);
            }

            this.setNextMove(time + duration + 500)
        }
    }

    startWalkCycle(speedMultiplier=1) {
        this.walkFrame = 0
        this.updateWalkFrame()
        this.walkCycle = setInterval(() => {
            this.walkFrame = (this.walkFrame + 1) % MOVE_FRAMES
            this.updateWalkFrame()
        }, MOVE_FRAME_SPEED / speedMultiplier);
    }

    updateWalkFrame() {
        this.setTexture(`walk${this.walkFrame + 1}`)
    }

    setZIndex(pos=this.sprite.position.y) {
        this.sprite.zIndex = pos + (45 * this.textures.scale.y)  // accounts for different sizes
    }

    stopMovement() {
        if (this.movement) {
            clearInterval(this.walkCycle)
            this.walking = false
            this.falling = false
            this.moving = false
            this.movement.remove()
            this.movement = null
            this.idleType = 0
        }
    }

    setName(str) {
        let newName = str.slice(0, 100)
        if (newName === this.name) return;

        this.name = newName
        this.nameTag.text = newName.trim()

        let nameCheck = newName.toLowerCase().replace(/\s/g, "")
        let egg = topSecretEasterEggNames[nameCheck]
        this.easterEgg(egg)
        return
    }

    isAboveGround() {
        return this.sprite.position.y < (gameSize.height - groundHeight)
    }

    centerOnScreen() {
        this.stopMovement()
        let safeWidth = Math.floor(gameBox.clientWidth / 6)
        this.sprite.position.x = (gameSize.width / 2) + rng(-safeWidth, safeWidth)
    }

    checkSleep(time) {
        if (time >= this.nextSleep) {
            this.toggleSleep(!this.dragging())
        }
    }

    toggleSleep(sleeping) {
        this.sleeping = sleeping
        this.sleepIcon.visible = sleeping
        this.nameTag.alpha = sleeping ? 0 : 1

        if (sleeping) {
            this.stopMovement()
            this.setTexture("sleep")
        }

        else {
            let now = Date.now()
            this.setNextSleep(now)
            this.setNextMove(now)
            this.setNextCoin(now)
            this.idle()
        }

        this.updateInfo(true)
    }

    setNextSleep(time) {
        this.nextSleep = time + (this.getMinsAwake() * MINUTE)
    }

    wakeUp() {
        this.toggleSleep(false)

        // wake up all in a certain distance
        creatures.forEach(x => {
            if (!x.sleeping) return
            if (Math.abs(this.sprite.position.x - x.sprite.position.x) <= WAKE_DISTANCE && Math.abs(this.sprite.position.y - x.sprite.position.y) <= WAKE_DISTANCE) x.toggleSleep(false)
        })
    }

    upgradeRandom() {
        let isEqual = this.rangeIsEqual(); // never upgrade min if it's equal with max
        let upgradeTypes = Object.entries(this.upgrades).filter(x => x[1] < MAX_UPGRADE_LEVEL && !(isEqual && x[0] == "min")).map(x => x[0])
        if (!upgradeTypes.length) return
        let key = choose(upgradeTypes)
        this.upgrades[key]++
        this.totalUpgrades++
        this.updateInfo(true)
        return key
    }

    onClick() {
        if (this.sleeping) this.wakeUp()
        else this.showUpgradeInfo()
    }

    onHover(hovering, event) {
        this.nameTag.visible = this.selected() || hovering
    }

    showUpgradeInfo() {
        if (this.selected()) return
        selectedCreature = this
        this.nameTag.visible = true

        this.drawIcon().then(() => {
            toggleSidebar(true)
            this.updateInfo(true)
        })
    }

    getIcon() {
        return app.renderer.extract.base64(this.textures)
    }

    async drawIcon() {
        upgradeBox.style.setProperty("--col1", hexCode(this.layers[0].tint))
        upgradeBox.style.setProperty("--col2", hexCode(this.layers[1].tint))
        upgradeImage.src = ""
        upgradeImage.src = await this.getIcon()
    }

    updateInfo(full) {
        if (!this.selected()) return
        let maxxed = this.totalUpgrades >= MAX_UPGRADE_LEVEL * 4
        let upgradePrice = this.getUpgradePrice()
        let traitPrice = this.getTraitPrice()
        let colorPrice = this.getColorPrice()

        // constantly updating
        upgradeMenu.total.innerHTML = commafy(this.coinsEarned)
        upgradeMenu.sleep.innerHTML = this.sleeping ? "Asleep" : "Falls asleep in " + commafy(minTimestamp(this.nextSleep - Date.now()))
        upgradeMenu.upgrade.toggleAttribute("disabled", maxxed || (coins < upgradePrice))
        upgradeMenu.traitBtn.toggleAttribute("disabled", coins < traitPrice)
        upgradeMenu.colorBtn.toggleAttribute("disabled", coins < colorPrice || !!this.lockRecolor)

        // not that often
        if (full) {
            let coinRange = this.getCoinRange()
            let equalCoins = coinRange[0] == coinRange[1]
            this.updateBulkInfo()

            upgradeMenu.name.value = this.name
            upgradeMenu.trait.innerHTML = this.trait.name
            upgradeMenu.traitDesc.innerHTML = this.trait.desc
            upgradeMenu.range.innerHTML = equalCoins ? coinRange[0] : coinRange.join("-")
            upgradeMenu.time.innerHTML = pluralS(+this.getCoinSpeed().toFixed(2), "sec")
            upgradeMenu.sleepTotal.innerHTML = minTimestamp(this.getMinsAwake() * MINUTE, 1)
            upgradeMenu.upgradePrice.innerHTML = commafy(upgradePrice)
            upgradeMenu.sellPrice.innerHTML = commafy(this.getSellPrice())
            upgradeMenu.sellAmount.innerHTML = upgradeMenu.sellPrice.innerHTML

            upgradeMenu.traitPrice.innerHTML = traitPrice
            upgradeMenu.colorPrice.innerHTML = colorPrice

            upgradeMenu.unmaxxed.style.display = maxxed ? "none" : ""
            upgradeMenu.maxxed.style.display = maxxed ? "" : "none"

            if (this.sleeping) upgradeMenu.info.classList.add("inactive")
            else upgradeMenu.info.classList.remove("inactive")

            upgradeMenu.sellBtn.toggleAttribute("disabled", creatures.length <= 1)

            upgradeMenu.sleepFooter.style.display = ""
            upgradeMenu.sellFooter.style.display = "none"

            // upgrade squares
            document.querySelectorAll('.upgrade_squares').forEach(x => {
                let stat = x.getAttribute("statName")
                let statLvl = this.upgrades[stat] || 0
                let str = ""
                for (let i = 1; i <= MAX_UPGRADE_LEVEL; i++) {
                    str += (statLvl >= i) ? `<div class="upg"></div>` : `<div></div>`
                }
                x.innerHTML = str
            })
        }

    }

    updateBulkInfo() {
        let bulkPrice = this.getBulkUpgradePrice(5, true)
        bulkBuyAmount = bulkPrice.count
        upgradeMenu.upgradePrice5.innerHTML = commafy(bulkPrice.price)
        upgradeMenu.upgradeText5.innerHTML = `Upgrade x${bulkBuyAmount}`
    }

    sell() {
        let sellPrice = this.getSellPrice()
        coins += sellPrice
        this.stopMovement()
        this.sprite.destroy()
        creatures = creatures.filter(x => x != selectedCreature)
        deselectCreature()
        updateBuyPrice()
        click()
        playSound("grab", { pitch: 0.7, volume: 0.8 })
        playSound("coins", { pitch: 0.7, volume: 0.15 })
    }

    attachShadow(attached) {
        if (attached) {
            activeShadows.removeChild(this.shadow)
            this.shadowContainer.addChild(this.shadow)
            this.shadow.position.set(SHADOW_OFFSET[0], SHADOW_OFFSET[1])
            this.shadow.scale.set(SHADOW_SCALE)
            this.shadow.alpha = SHADOW_ALPHA
        }

        else {
            let globalPos = this.shadow.getGlobalPosition()
            this.shadowContainer.removeChild(this.shadow)
            activeShadows.addChild(this.shadow)
            this.shadow.position.set(globalPos.x, globalPos.y)
        }
    }

    updateShadowPos() {
        this.shadow.position.set(this.sprite.x + (SHADOW_OFFSET[0] * (this.facingLeft ? 1 : -1)), this.fallTo + SHADOW_OFFSET[1])
        let dist = this.shadow.position.y - this.sprite.position.y - 49
        let distPercent = Math.min(0.9, dist / 600)
        this.shadow.alpha = SHADOW_ALPHA - (distPercent * SHADOW_ALPHA / 2)
        this.shadow.scale.set(Math.max(SHADOW_SCALE - (distPercent * SHADOW_SCALE), 0.01))
    }

    setFallLocation() {
        this.fallTo = (gameSize.height - a_rng(groundHeight - 2, groundHeight / 2, 2))
    }
    
    startDrag(e) {
        if (this.sleeping) this.wakeUp()
        if (draggedCreature && draggedCreature != this) draggedCreature.finishDrag()
        draggedCreature = this;
        dragStartPos = { x: this.sprite.position.x, y: this.sprite.position.y };
        this.sprite.scale.set(1.05)
        this.sprite.zIndex = gameSize.height
        playSound("grab", { pitch: rng(80, 110) / 100, volume: 0.65 })
        if (this.moving && !this.falling) this.idle()
        this.stopMovement()
        this.attachShadow(!this.isAboveGround())
    }

    onDrag(e) {
        let moveDiff = this.sprite.x - e.global.x
        if (moveDiff < -5 || moveDiff > 5) this.faceLeft(moveDiff > 0)
        this.sprite.parent.toLocal(e.global, null, draggedCreature.sprite.position)
        this.sprite.x = clamp(this.sprite.x, DRAG_EDGE, gameSize.width - DRAG_EDGE)
        this.sprite.y = clamp(this.sprite.y, DRAG_EDGE, gameSize.height - DRAG_EDGE)
        let grabbing = (this.texture == "grab")
        if (this.isAboveGround()) {
            if (!grabbing) {
                this.setFallLocation();
                this.setTexture("grab");
                this.attachShadow(false);
            }
            this.updateShadowPos()
        }
        else if (grabbing) {
            this.setTexture("spike");
            this.attachShadow(true)
        }
    }

    finishDrag(e) {
        if (this.dragging()) {
            let dist = distance(this.sprite.position, dragStartPos)
            draggedCreature = null
            dragStartPos = null
            this.sprite.scale.set(1)
            this.setZIndex()
            if (dist <= 30) this.onClick()

            if (this.isAboveGround()) this.startFalling()
            else {
                if (this.texture == "grab") this.idle()
                this.setNextMove(Date.now())
                this.attachShadow(true)
            }
        }
    }

    startFalling() {
        this.falling = true
        this.attachShadow(false)
        let yPos = this.sprite.position.y
        let targetPos = this.fallTo

        let fallLength = Math.abs(yPos - targetPos)
        let duration = Math.max(1200, fallLength / (BASE_FALL_SPEED / 1000))
        this.setZIndex(targetPos)

        let landed = false
        let timesLanded = 0

        this.lastPos = 0
        this.moving = true
        this.movement = ease.add(this.sprite, { y: targetPos }, { duration, ease: 'easeOutBounce' })
        this.movement.on('each', () => {
            if (this.sprite.position.y >= targetPos - 5) {
                if (this.lastPos > this.sprite.position.y) {  // moving up
                    if (!landed) {
                        timesLanded++;
                        this.setTexture("spike")
                        playSound("drop", { pitch: (rng(90, 100) - (10 * timesLanded)) / 100, volume: 0.35 - (0.09 * timesLanded) })
                    }
                    landed = true
                }
                else landed = false
                this.lastPos = this.sprite.position.y
            }
            this.updateShadowPos()
        })
        this.movement.on('complete', () => {
            this.falling = false
            this.moving = false
            this.movement = null     
            this.sprite.position.y = targetPos
            this.idle()   
            this.setNextMove(Date.now() + 750)
            this.attachShadow(true)
        })
    }

    easterEgg(egg) {

        if (!egg && !this.active_easteregg) return delete this.active_easteregg
        this.active_easteregg = egg

        // clear all effects
        if (!egg || egg.type != "flip") {
            this.layers[0].scale.y = SPIRTE_SCALE
            this.layers[1].scale.y = SPIRTE_SCALE
        }
        delete this.lockRecolor
        this.layers[0].alpha = 1
        if (!egg) return this.updateColor()

        switch (egg.type) {
            case "color": case "strobe": case "rainbow":
                this.lockRecolor = egg
                break;

            case "invisible":
                this.lockRecolor = egg
                this.layers[0].alpha = 0.1;
                break;

            case "flip":
                this.layers[0].scale.y = -SPIRTE_SCALE
                this.layers[1].scale.y = -SPIRTE_SCALE
                break;

            case "death":
                this.setName("")
                window.location.reload()
                break;
        }

        this.updateColor()
        this.updateInfo()
        this.drawIcon()
    }

    updateColor() {

        if (!this.lockRecolor) {
            this.layers[0].tint = this.col1
            this.layers[1].tint = this.col2
            this.drawIcon();
            return;
        }
        
        switch (this.lockRecolor.type) {
            case "color":
                this.layers[0].tint = this.lockRecolor.colors[0]
                this.layers[1].tint = this.lockRecolor.colors[1]
                break;

            case "strobe":
                this.layers[0].tint = this.lockRecolor.colors[Math.floor(window.gameTick / 2) % this.lockRecolor.colors.length]
                if (this.lockRecolor.ncbg) {
                    let bgID = window.gameTick % 5
                    this.layers[1].tint = bgID > 1 ? 0 : this.lockRecolor.ncbg[bgID]
                }
                else this.layers[1].tint = 0
                break;

            case "rainbow":
                this.layers[0].tint = hsv(window.gameTick * 5, 100, 100)
                this.layers[1].tint = hsv(window.gameTick * 5, 100, 50)
                break;

            case "invisible":
                this.layers[0].tint = 0xffffff;
                this.layers[1].tint = 0;
                break;
        }
    }

    // calculate how much was earned while away, damn
    calculateOffline(time, now=Date.now()) {

        if (this.nextSleep) now = Math.min(now, this.nextSleep)

        let diff = (now - time)
        if (diff < 5000 || time < 5000) return     // if you were only offline for like 5 secs do nothing

        let eepy = this.getMinsAwake() * MINUTE

        if (eepy < diff) {
            diff = eepy
            this.nextSleep = now
        }

        let speed = this.getCoinSpeed() * 1000 * this.tt("offlineMultiplier")
        let timesGenerated = Math.floor(diff / speed)
        if (timesGenerated < 1) return

        let coinRoll = this.rollCoins()
        let grandTotal = Math.floor(coinRoll * timesGenerated)

        return grandTotal
    }

    // for saving
    toJSON() {
        return {
            name: this.name,
            col1: this.col1,
            col2: this.col2,
            sleep: this.nextSleep,
            traitName: this.trait.name,
            upgrades: this.upgrades,
            buyPrice: this.buyPrice,
            coinsEarned: this.coinsEarned
        }
    }
}