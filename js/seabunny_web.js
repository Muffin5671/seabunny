const ease = Ease.ease
const get = (x) => document.getElementById(x)
const AUTOSAVE_INTERVAL = 8
const HOUR = 3600000
const MINUTE = 60000

const GAME_VERSION = "1.0.1 Mod"

const audioSource = new AudioContext();
const audioCache = {}

// undefined = not stringifed in save file
const settings = {
    muted: undefined,
    noWaterShader: undefined,
    noCursorTrail: undefined,
}

const currentlyFetching = {}
async function fetchSound(name) {
    currentlyFetching[name] = true
    let sound = await fetch(`./sfx/${name}.mp3`).then(res => res.arrayBuffer()).then(buffer => audioSource.decodeAudioData(buffer))
    delete currentlyFetching[name]
    audioCache[name] = sound
    return sound
}

async function playSound(name, config={}) {
    if (settings.muted || document.hidden && !config.force) return
    let soundData = audioCache[name] || await fetchSound(name)
    let sound = new AudioBufferSourceNode(audioSource, { buffer: soundData, playbackRate: config.pitch || 1 })
    let vol = new GainNode(audioSource, { gain: !isNaN(config.volume) ? config.volume : 0.5 })
    vol.connect(audioSource.destination)
    sound.connect(vol)
    sound.start()

    sound.addEventListener("ended", () => {
        sound.disconnect()
        vol.disconnect()
    })
}

const session = Date.now()
localStorage.setItem("seabunny_session", session)

// elements
let creatures = []

const gameBox = get("game_box")
const upgradeBox = get("upgrade_menu")
const upgradeImage = get("upgrade_image_data")
const topRight = get("top_right")
const buyBtn = get("buy_button")
const buyPrice = get("buy_price")
const muteBtn = get("mute_button")
const muteIcon = get("mute_icon")
const creditsBtn = get("credits_button")
const creditsBox = get("credits_container")
const resetBox = get("reset_container")

const upgradeMenu = {
    name: get("upgrade_name"),
    info: get("coin_info"),
    range: get("coin_range"),
    time: get("coin_time"),
    total: get("coin_total"),
    trait: get("trait_name"),
    traitDesc: get("trait_desc"),
    sleep: get("sleep_remaining"),
    sleepTotal: get("sleep_total"),
    upgrade: get("upgrade_button"),
    upgradePrice: get("upgrade_price"),
    upgradePrice5: get("upgrade_price_5"),
    upgradeText: get("upgrade_text"),
    upgradeText5: get("upgrade_text_5"),
    unmaxxed: get("upgrade_unmaxxed"),
    maxxed: get("upgrade_maxxed"),
    sellPrice: get("sell_price"),
    traitBtn: get("reroll_trait"),
    traitPrice: get("reroll_trait_price"),
    colorBtn: get("reroll_colors"),
    colorPrice: get("reroll_colors_price"),
    sellBtn: get("sell_button"),
    sellAmount: get("sell_amount"),
    sellConfirm: get("confirm_sell"),
    sellCancel: get("cancel_sell"),
    sleepFooter: get("sleep_footer"),
    sellFooter: get("sell_footer")
}
get("version_number").innerHTML = "v" + GAME_VERSION

const nameTagStyle = {
    fontFamily: ["Lato", "Arial", "sans-serif"],
    fontSize: 26,
    fill: 0xffffff,
    align: "center",
    stroke: { color: 0, width: 2, join: "round", alpha: 0.5 }
}

const traits = [
    { name: "Simple", desc: "No effects", data: { } },
    { name: "Handsome", desc: "No effects", data: { } },
    { name: "Quiet", desc: "No effects", data: { } },
    
    { name: "Grandpa", desc: "20% larger", data: { scale: 1.2 } },
    { name: "Smol", desc: "20% smaller", data: { scale: 0.8 } },
    { name: "Hyperactive", desc: "Moves 50% faster", data: { movement: 1.5 } },
    { name: "Spiky", desc: "Easily startled", data: { idleFrame: 2 } },

    { name: "Active", desc: "Stays awake 10% longer", data: { sleep: 1.1 } },
    { name: "Energetic", desc: "Stays awake 20% longer", data: { sleep: 1.2 } },
    { name: "Savvy", desc: "Earns +1 min coin", data: { min: 1 } },
    { name: "Trustworthy", desc: "Earns +1 max coin", data: { max: 1 } },
    { name: "Loyal", desc: "Earns +2 max coins", data: { max: 2 } },
    { name: "Brilliant", desc: "Earns +3 max coins", data: { max: 3 } },
    { name: "Dynamic", desc: "Earns +1 coin", data: { min: 1, max: 1 } },
    { name: "Productive", desc: "Earns +2 coins", data: { min: 2, max: 2 } },
    { name: "Dedicated", desc: "Generates coins 10% faster", data: { speed: 0.9 } },
    { name: "Focused", desc: "Generates coins but also falls asleep 20% faster", data: { speed: 0.8, sleep: 0.8 } },
    { name: "Careless", desc: "Stays awake 25% longer but generates coins 25% slower", data: { speed: 1.25, sleep: 1.25 } },

    { name: "Clever", desc: "Upgrades are 10% cheaper", data: { upgradePrice: 0.9 } },
    { name: "Adaptive", desc: "Rerolls are 50% cheaper", data: { rerollPrice: 0.5 } },
    { name: "Precious", desc: "Sells for 2.1x more", data: { sellPrice: 2.1 } },
    { name: "Lucky", desc: "Rolls for coins twice and picks the larger amount", data: { rerolls: 1 } },
    { name: "Shiny", desc: "5% chance to generate double coins", data: { doubleChance: 5 } },
    { name: "Shy", desc: "Generates coins 25% faster while offline", data: { offlineMultiplier: 0.75 } },

    { name: "Eepy", desc: "Falls asleep 15% faster", data: { sleep: 0.85, idleFrame: 1 } },
    { name: "Confused", desc: "Earns -1 max coins", data: { max: -1 } },
    { name: "Unproductive", desc: "Earns -2 max coins", data: { max: -2 } },
    { name: "Lazy", desc: "Generates coins 10% slower", data: { speed: 1.1 } },
    { name: "Demotivated", desc: "Generates coins 20% slower", data: { speed: 1.2 } },
    { name: "Stubborn", desc: "Upgrades are 10% more expensive", data: { upgradePrice: 1.1 } },
]


// selection
let selectedCreature = null;
let draggedCreature = null;
let dragStartPos = null;
let bgDrag = null;
let nextBuyPrice = 0;
let bulkBuyAmount = 0;

// man this sure is easy to edit
let coins = 0

// load save data
let dataLoaded = false
let enableSaving = false
function loadSaveData() {
    let localSave = localStorage.getItem("seabunny")
    if (localSave) {
        try {
            let now = Date.now()
            let data = JSON.parse(localSave)
            let offlineSince = +data.time || now

            if (!isNaN(data.coins)) coins = data.coins

            if (typeof data.settings == "object") {
                Object.keys(data.settings).forEach(x => {
                    if (settings.hasOwnProperty(x) && data.settings[x]) {
                        settings[x] = true
                        updateSettingSlider(x)
                    }
                })
                updateSettings()
            }

            if (Array.isArray(data.creatures)) data.creatures.forEach(x => {
                if (!x || typeof(x.name) != "string") return
                let c = addCreature(x)
                c.faceLeft(rng(1, 2) == 1)
                let earned = c.calculateOffline(offlineSince, now)
                if (earned) {
                    c.coinsEarned += earned
                    coins += earned
                }
            })
        }
        catch(e) {
            console.warn("Couldn't load save data!")
            console.error(e)    
        }    
    }

    document.querySelectorAll('.unloaded').forEach(x => x.classList.remove('unloaded'))
    if (!creatures.length) addCreature({ traitName: "Simple", col1: 0xffffff, col2: 1 })
    dataLoaded = true
    updateBuyPrice()
    updateCoinCounter() 

    cameraScroll((gameBox.scrollWidth - gameBox.clientWidth) / 2, true)
    choose(creatures).centerOnScreen()

    enableSaving = true
}


// force horizontal scroll
const scrollContainer = get("game_box");

function cameraScroll(delta, set, isDrag) {
    gameBox.scrollLeft = (set ? delta : gameBox.scrollLeft + delta)
    if (!isDrag) bgDrag = null
    if (updateBG) updateBG()
}

scrollContainer.addEventListener("wheel", e => {
    cameraScroll((e.deltaX || e.deltaY) / 3);
}, { passive: true });

let touchStartX = 0;
scrollContainer.addEventListener("touchstart", e => {
    touchStartX = e.touches[0].clientX;
}, { passive: true });

scrollContainer.addEventListener("touchmove", e => {
    if (draggedCreature) return
    const touchEndX = e.touches[0].clientX;
    const delta = touchStartX - touchEndX;
    cameraScroll(delta);
    touchStartX = touchEndX;
}, { passive: true });


// approximate x pos of camera center in game world

function getCameraCenter(variance=0) {
    let halfWidth = gameBox.clientWidth / 2
    let scrollPercent = ((gameBox.scrollLeft + halfWidth) / gameBox.scrollWidth) * gameSize.width
    if (variance) {
        let v = Math.floor(gameBox.clientWidth * variance)
        scrollPercent = clamp(scrollPercent + rng(-v, v), 30, gameSize.width - 30)
    }
    return scrollPercent
}

// ===== GAME UI ===== //

function click() {
    playSound("click", { pitch: rng(90, 110) / 100 })
}

// shows/hides sidebar with animation
function toggleSidebar(enabled) {
    if (enabled) {
        upgradeBox.style.display = ""
        creatures.forEach(x => x.onHover(false))
    }
    else {
        setTimeout(() => {
            if (!upgradeBox.classList.contains("active")) upgradeBox.style.display = "none"
        }, 200);
    }
    upgradeBox.classList.toggle("active", enabled)
    topRight.classList.toggle("covered", enabled)
}

// close selection box
function deselectCreature() {
    toggleSidebar(false)
    if (selectedCreature) {
        selectedCreature.nameTag.visible = false
    }
    selectedCreature = null
}

// coin display
const coinCointer = get("coins")
function updateCoinCounter() {
    coins = Math.floor(coins)
    coinCointer.innerHTML = coins >= 1000 ? commafy(coins) : coins
    buyBtn.toggleAttribute("disabled", coins < nextBuyPrice)
}

// buy price display, updates on buy/sell
function updateBuyPrice() {
    let len = (creatures.length - 1)
    nextBuyPrice = BASE_BUY_PRICE + (BUY_PRICE_RATE * len) + (BUY_PRICE_EXPONENT * len * len)
    buyPrice.innerHTML = commafy(nextBuyPrice)
    saveData()
}

// creature naming
upgradeMenu.name.addEventListener("input", e => {
    if (!selectedCreature) return
    selectedCreature.setName(e.target.value)
})

// upgrades
upgradeMenu.upgrade.addEventListener("click", e => {
    if (!selectedCreature) return
    let price = selectedCreature.getUpgradePrice()
    let timesToUpgrade = (e.shiftKey ? bulkBuyAmount : 1)
    let i = 0
    while (i < timesToUpgrade && coins >= price && selectedCreature.upgradeRandom()) {
        coins -= price
        updateCoinCounter()
        if (i == 0) {
            click()
            playSound("coins", { pitch: rng(75, 85) / 100, volume: 0.15 })
        }
        i++
        if (timesToUpgrade > 1) price = selectedCreature.getUpgradePrice()
    }
    saveData()
})

// reroll trait
upgradeMenu.traitBtn.addEventListener("click", e => {
    if (!selectedCreature) return
    let price = selectedCreature.getTraitPrice()
    if (coins < price) return
    coins -= price
    selectedCreature.rollTrait(true)
    saveData()
    click()
})

// reroll color
upgradeMenu.colorBtn.addEventListener("click", e => {
    if (!selectedCreature || selectedCreature.lockRecolor) return
    let price = selectedCreature.getColorPrice()
    if (coins < price) return
    coins -= price
    selectedCreature.rollColors(true)
    saveData()
    // click()
    playSound("pop", { pitch: rng(150, 200) / 100, volume: 0.4 })
    playSound("pop", { pitch: rng(50, 75) / 100, volume: 0.3 })
})

// buy
buyBtn.addEventListener("click", e => {
    updateBuyPrice()
    if (selectedCreature || coins < nextBuyPrice) return
    coins -= nextBuyPrice
    addCreature({ buyPrice: nextBuyPrice }, true)
    updateBuyPrice()
    playSound("grab", { pitch: 0.9, volume: 0.5 })
    playSound("pop", { pitch: rng(90, 110) / 100, volume: 0.8 })
})

// sell
upgradeMenu.sellBtn.addEventListener("click", e => {
    if (!selectedCreature || creatures.length <= 1) return
    if (e.shiftKey) return selectedCreature.sell()
    click()
    upgradeMenu.sleepFooter.style.display = "none"
    upgradeMenu.sellFooter.style.display = ""
})

upgradeMenu.sellCancel.addEventListener("click", e => {
    click()
    upgradeMenu.sleepFooter.style.display = ""
    upgradeMenu.sellFooter.style.display = "none"
})

upgradeMenu.sellConfirm.addEventListener("click", e => {
    if (!selectedCreature || creatures.length <= 1) return
    selectedCreature.sell()
})

// credits
creditsBtn.addEventListener("click", showCredits)
function showCredits() { click(); creditsBox.style.display = ""; resetBox.style.display = "none" }
function hideCredits() { creditsBox.style.display = "none"; resetBox.style.display = "none" }

creditsBox.addEventListener("click", e => { if (e.target.id == "credits_container") hideCredits() })
resetBox.addEventListener("click", e => { if (e.target.id == "reset_container") hideCredits() })

// mute
muteBtn.addEventListener("click", e => {
    if (selectedCreature) return
    settings.muted = !settings.muted ? true : undefined
    if (!settings.muted) click();
    updateSettings()
    saveData()
})

// other settings
function toggleSetting(el) {
    let settingName = el.getAttribute("setting")
    if (settings.hasOwnProperty(settingName)) {
        settings[settingName] = el.checked ? undefined : true
        click()
        updateSettings()
        saveData()
    }
}

function updateSettings() {
    muteIcon.setAttribute("src", `./icons/vol_${settings.muted ? "off" : "on"}.svg`)
    if (window.waterFilter) bg_layer.filters = settings.noWaterShader ? [] : [waterFilter]
}

function updateSettingSlider(id) {
    let foundInput = document.querySelector(`.setting input[setting="${id}"]`)
    if (foundInput) foundInput.checked = !settings[id]
}

// reset all
get("reset_everything").addEventListener("click", e => {
    click()
    creditsBox.style.display = "none"
    resetBox.style.display = ""
})

get("confirm_reset").addEventListener("click", e => {
    resetAllData(resetBox.style.display === "")
})

// bulk buy
function toggleBulkBuy(shift) {
    if (shift) selectedCreature.updateBulkInfo()
    upgradeMenu.upgradeText.style.display = (shift ? "none" : "")
    upgradeMenu.upgradeText5.style.display = (shift ? "" : "none")
    upgradeMenu.upgradePrice.style.display = (shift ? "none" : "")
    upgradeMenu.upgradePrice5.style.display = (shift ? "" : "none")
}

// esc
document.onkeydown = function(e) {
    if (e.repeat) return;

    if (e.key == "Escape") {
        if (selectedCreature) deselectCreature()
        else if (creditsBox.style.display == "") hideCredits()
        else showCredits()
    }

    if (selectedCreature) toggleBulkBuy(e.shiftKey)
};

document.onkeyup = function(e) {
    toggleBulkBuy(e.shiftKey)
}

// ===== SAVING ===== //

function saveData(exit) {
    if (!dataLoaded || !enableSaving) return

    // if multiple tabs are open, prioritize most recent to prevent data loss
    let currentSession = exit ? null : localStorage.getItem("seabunny_session")
    if (currentSession && +currentSession > session) {
        enableSaving = false;
        gameBox.remove()
        app.destroy()
        creatures = []
        return alert("You opened the game in a new tab! This tab has been deactivated to prevent conflicts.");
    }

    let saveData = {
        time: Date.now(),
        coins,
        settings,
        creatures: creatures.map(x => x.toJSON())
    }

    localStorage.setItem("seabunny", JSON.stringify(saveData));
}

window.addEventListener('beforeunload', function(event) {
    saveData(true)
});

setInterval(() => {
    saveData()
}, AUTOSAVE_INTERVAL * 1000);

function resetAllData(confirmation) {
    if (confirmation !== true) return
    enableSaving = false
    localStorage.removeItem("seabunny")
    localStorage.removeItem("seabunny_session")
    window.location.reload()
}

// ===== MISC FUNCTIONS ===== //

// rng
function rng(min, max) {
    if (max == undefined && +min) { max = min; min = 1 } // rng(5) is the same as rng(1, 5)
    return Math.floor(Math.random() * (max - min + 1)) + min
}

// roll n times and choose the higher or lower number
function a_rng(min, max, n=2) {
    let rolls = []
    let useMax = (min > max)
    if (useMax) [min, max] = [max, min]
    for (let i = 0; i < n; i++) rolls.push(rng(min, max))
    return useMax ? Math.max(...rolls) : Math.min(...rolls)
}

// randomly pick from array
function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// add commas to big numbers
function commafy(num, locale="en-US") {
    return num.toLocaleString(locale, { maximumFractionDigits: 10 })
}

// round to nearest multiple of N
function roundTo(num, n) {
    return Math.round(num / n) * n
}

// limit number between two values
function clamp(num, min, max) {
    return Math.min(Math.max(num , min), max)
};

// distance between two points
function distance(pos1, pos2) {
    return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2);
}

// adds an extra s for plurals (e.g. 1 egg, 2 eggs)
function pluralS(count, msg,) {
    return `${this.commafy(count)} ${msg}${count == 1 ? "" : "s"}`
}

// convert timestamp to 'x minutes and x seconds'
function minTimestamp(ms=0) {
    let hours = Math.floor(ms / HOUR)
    let remainder = ms - (hours * HOUR)
    let minutes = Math.floor(remainder / MINUTE)
    let seconds = 0
    let minRemainder = ms - (minutes * MINUTE)
    seconds = Math.ceil(minRemainder / 1000)

    if (!hours && !minutes) return pluralS(Math.ceil(ms / 1000), "sec")
    else if (!hours) {
        if (seconds) return `${pluralS(minutes, "min")} and ${pluralS(seconds, "sec")}`
        else return pluralS(minutes, "min")
    }
    else if (!minutes) return pluralS(hours, "hour")
    else return `${pluralS(hours, "hour")} and ${pluralS(minutes, "min")}`
}

// decimal to hex code
function hexCode(dec) {
    return "#" + dec.toString(16).padStart(6, 0)
}

// https://stackoverflow.com/a/54024653
function hsv(h, s, v) {
    v /= 100
    let f = (n, k = (n + h / 60) % 6) => 255 * (v - v * (s / 100) * Math.max(Math.min(k, 4 - k, 1), 0));
    return (f(5) << 16) + (f(3) << 8) + (f(1) << 0)
}   


// ===== DEBUG AND SECRETS ===== //

// if you're reading this
// hi
const topSecretEasterEggNames = {
    "grumm": { type: "flip" },
    "dinnerbone": { type: "flip" },
    "jeb_": { type: "rainbow" },

    "ninecircles":      { type: "strobe", colors: [0xff0000, 0xec8100, 0xffe900, 0xbaff00], ncbg: [0xff0000, 0x990000] },
    "jawbreaker":       { type: "strobe", colors: [0x0a00fc, 0x009dff, 0x00e9ff, 0x00ffd8], ncbg: [0x0e00e0, 0x080086] },
    "problematic":      { type: "strobe", colors: [0x3aff25, 0x25ff9b, 0x25ffe9, 0x25c1ff], ncbg: [0x00bc6e, 0x007142] },
    "fairydust":        { type: "strobe", colors: [0x6a25ff, 0xd625ff, 0xff25d5, 0xff2555], ncbg: [0xb500ee, 0x6d008f] },
    "poltergeist":      { type: "strobe", colors: [0xffffff, 0x928ea4, 0x464553, 0x202023], ncbg: [0x949498, 0x59595b] },
    "sonicwave":        { type: "strobe", colors: [0x2b98ab, 0x346a96, 0x296090, 0x355396], ncbg: [0x001323, 0x000b15] },
    "downbass":         { type: "strobe", colors: [0x689300, 0x8bc900, 0xbaff00, 0xddff88], ncbg: [0xbaff00, 0x001323] },
    "crimsonclutter":   { type: "strobe", colors: [0x7E0013, 0x782900, 0x720900, 0x330000], ncbg: [0x3d0600, 0x280400] },
    "astronaut13":      { type: "strobe", colors: [0x4f4f4f, 0x353535, 0x1e1e1e, 0x111111], ncbg: [0x131313, 0x0c0c0c] },
    "paracosmcircles":  { type: "strobe", colors: [0x5a00b5, 0x6400c9, 0xb267ff, 0xdbb8ff], ncbg: [0x450c7e, 0x2D0852] },
    "aquaticauroras":   { type: "strobe", colors: [0x47bbcc, 0x428791, 0x305c63, 0x173034], ncbg: [0x355459, 0x203235] },
    "arcticlights":     { type: "strobe", colors: [0x6262c3, 0x444195, 0x474678, 0x363476], ncbg: [0x37376c, 0x212141] },

    "piapro":           { type: "strobe", colors: [0x29ccb2, 0xf3e84e, 0xf5b543, 0xf2b5c8, 0x6b94e3, 0xff4f5a] },
    "bisexuallighting": { type: "strobe", colors: [0xd60070, 0xa10e7f, 0x6b1b8d, 0x36289b, 0x0035a9, 0x36289b, 0x6b1b8d, 0xa10e7f] },
    "kesenaifire":      { type: "strobe", colors: [0xea170a, 0xf03208, 0xf54c05, 0xfa6603, 0xff8000, 0xfa6603, 0xf54c05, 0xf03208] },

    "ilovegdcologne": { type: "color", colors: [0x404040, 0xff8000] },
    "inkybuns": { type: "color", colors: [0xffffff, 0] },
    "zhenmuron": { type: "color", colors: [0x7d00ff, 0x00ffff] },
    "aviequaverie": { type: "color", colors: [0xf7474d, 0x29d1e8] },
    "youhavenotwin": { type: "color", colors: [0x001400, 0x00ff00] },
    "thechallenge": { type: "color", colors: [0x200000, 0xff0000] },
    "itsmethedevil": { type: "color", colors: [0, 0] },
    "weedcat": { type: "color", colors: [0xd4f4ac, 0x86bb56] },
    "kenodiac": { type: "color", colors: [0x9e2c50, 0xcc8af2] },
    "emotik0n": { type: "color", colors: [0xf0f0f0, 0xffb2eb] },

    "transrights": { type: "color", colors: [0xf6aab7, 0x55cefd] },
    "birights": { type: "color", colors: [0xd60070, 0x0035a9] },
    "nbrights": { type: "color", colors: [0x9b59d0, 0xfff433] },
    "acerights": { type: "color", colors: [0x800080, 0xa3a3a3] },

    "alphatrigger": { type: "invisible" },
    "gaster": { type: "death" }
}

function sleepyTime() {
    creatures.forEach(x => {
        x.setNextSleep(1)
    })
}

function wakeUpBabe() {
    creatures.forEach(x => {
        x.toggleSleep(false)
    })
}

function iCanFly() {
    creatures.forEach(x => {
        x.startDrag()
        x.sprite.position.y = rng(50, 200)
        x.finishDrag()
    })
}

function giveMeYourMoney(n=100) {
    for (let i = 0; i < n; i++) spawnFloatingCoin()
}