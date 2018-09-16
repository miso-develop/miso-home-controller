"use strict"

// Entities
const entity = require("./entity")
// config
const config = require("./config")

// firebase
const firebase = require("firebase")
firebase.initializeApp(config.firebaseConfig)

// wol
const wol = require("wol")

// eRemote mini
const broadlink = require("./broadlink")
const irlist = require("./irlist")
let rm = {}
const timer = setInterval(() => {
	rm = broadlink({host: config.rmMac})
	if (rm) {clearInterval(timer)}
}, 100)



//////////////// functions ////////////////////////////////////////////////

// wait
const wait = ms => new Promise(res => setTimeout(res, ms))

// コマンド実行
const run = command => {
	return (new Promise(resolve => {
		const exec = require("child_process").exec
		exec(command, (err, stdout, stderr) => {
			resolve()
		})
	}))
}

// Entityから値取得
const getWord = value => {
	for (let word of entity) {
		for (let synonym of word.synonyms) {
			if (value === synonym) return word.value
		}
	}
}

// eRemote mini run
const rmRun = ir => {
	const hexDataBuffer = new Buffer(ir, "hex")
	rm.sendData(hexDataBuffer)
}

// テレビ電源オン
const tvOn = option => {
	if (typeof config.tvHdmiId !== "undefined") {
		run(`echo "on ${config.tvHdmiId}" | cec-client -s -d 1`)
	} else {
		rmRun(irlist.tv[option])
	}
}

// テレビ電源オフ
const tvOff = () => {
	if (typeof config.tvHdmiId !== "undefined") {
		run(`echo "standby ${config.tvHdmiId}" | cec-client -s -d 1`)
	} else {
		rmRun(irlist.tv[option])
	}
}

// テレビで次のHDMI入力に切り替え
const tvNextInput = () => {
	rmRun(irlist.tv.input)
	setTimeout(() => rmRun(irlist.tv.down), 1000)
	setTimeout(() => rmRun(irlist.tv.decision), 2000)
}

// テレビで前のHDMI入力に切り替え
const tvPrevInput = () => {
	rmRun(irlist.tv.input)
	setTimeout(() => rmRun(irlist.tv.up), 1000)
	setTimeout(() => rmRun(irlist.tv.decision), 2000)
}

// PS4オフ時にテレビの電源も一緒にオフ
const ps4Off = () => {
	run("sudo npm run ps4-waker standby")
	tvOff("power")
}

// 全消し
const allOff = async () => {
	ps4Off()
	rmRun(irlist.light.off)
	rmRun(irlist.aircon.off)
	db.ref(config.firebasePath).set("pc スリープ")
}

// 全起動
const allOn = () => {
	rmRun(irlist.light.on)
	rmRun(irlist.aircon.on)
	wol.wake(config.pcMac)
}



//////////////// firebase ////////////////////////////////////////////////

// database更新時
const db = firebase.database()
db.ref(config.firebasePath).on("value", async snapshot => {
	// 値取得
	let value = snapshot.val()
	if (!value) return
	
	// 家電操作
	await controll(value)
})



// 家電操作
const controll = async value => {
	console.log(value)
	
	// 助詞を除外
	value = value.replace(/ ([がのをへとでや]|から|より)/g, "")
	
	// 繰り返し文言があったら回数取得
	const loopNumMatch = value.match(/ \d+ [回つ] /)
	const loopNum = loopNumMatch ? loopNumMatch[0].match(/\d+/)[0] : 1
	value = value.replace(/ \d+ [回つ] /g, " ")
	
	// option word index
	let index = 1
	
	
	
	// コマンド定義
	const command = {
		"general": generalHandler(value, index),
		"light": lightHandler(value, index),
		"ps": psHandler(value, index),
		"tv": tvHandler(value, index),
		"aircon": airconHandler(value, index),
		"pc": pcHandler(value, index),
	}[value.split(" ")[0]]
	
	// コマンド実行
	if (!command) return
	for (let i = 0; i < loopNum; i ++) await command()
	
	// firebase clear
	db.ref(config.firebasePath).set("")
}



//////////////// handler ////////////////////////////////////////////////

// 汎用
const generalHandler = (value, index) => {
	return {
		"おやすみ": allOff,
		"ただいま": allOn,
	}[getWord(value.split(" ")[index])]
}

// 照明
const lightHandler = (value, index) => {
	const option = {
		"起動": "full",
		"停止": "off",
		"エコ": "eco",
		"楽見え": "easy",
		"節電": "save",
		"おやすみ": "sleep",
		"保安灯": "security",
		"a": "a",
		"b": "b",
		"c": "c",
		"d": "d",
		"1": "a",
		"2": "b",
		"3": "c",
		"4": "d",
	}[getWord(value.split(" ")[index])]
	return option ? () => rmRun(irlist.light[option]) : false
}

// PS4
const psHandler = (value, index) => {
	// 4を削除
	value = value.replace("4 ", "")
	const option = {
		"起動": " ",
		"停止": ps4Off,
		"スタンバイ": ps4Off,
		"ホーム": "remote ps",
		"enter": "remote enter",
		"選択": "remote enter",
		"戻る": "remote back",
		"オプション": "remote options",
		"上": "remote up",
		"下": "remote down",
		"左": "remote left",
		"右": "remote right",
		"トルネ": "sudo npm run ps4-waker start CUSA00442",
		"メディア": "sudo npm run ps4-waker start CUSA02012",
	}[getWord(value.split(" ")[index])]
	return typeof option === "string" ? () => run(`sudo npm run ps4-waker ${option}`) : option
}

// TV
const tvHandler = (value, index) => {
	const option = {
		"起動": () => tvOn("power"),
		"停止": () => tvOff("power"),
		"スタンバイ": () => tvOff("power"),
		"入力切替": "input",
		"入力": {
			"上": tvPrevInput,
			"下": tvNextInput,
		}[getWord(value.split(" ")[index + 1])],
		"次": {
			"入力": tvNextInput,
		}[getWord(value.split(" ")[index + 1])],
		"前": {
			"入力": tvPrevInput,
		}[getWord(value.split(" ")[index + 1])],
		"放送切替": "broadcast",
		"音量": {
			"アップ": "volup",
			"ダウン": "voldown",
		}[getWord(value.split(" ")[index + 1])],
		"上": "up",
		"下": "down",
		"左": "left",
		"右": "right",
		"決定": "decision",
		"戻る": "back",
		"メニュー": "menu",
		"番組表": "schedule",
		"d": "d",
		"青": "blue",
		"赤": "red",
		"緑": "green",
		"黄色": "yellow",
		"1": "1",
		"2": "2",
		"3": "3",
		"4": "4",
		"5": "5",
		"6": "6",
		"7": "7",
		"8": "8",
		"9": "9",
		"10": "10",
		"11": "11",
		"12": "12",
	}[getWord(value.split(" ")[index])]
	return typeof option === "string" ? () => rmRun(irlist.tv[option]) : option
}

// エアコン
const airconHandler = (value, index) => {
	const option = {
		"起動": "auto",
		"自動": "auto",
		"停止": "off",
		"冷房": "cool",
		"暖房": "heat",
		"除湿": "dry",
		"加湿": "humidify",
		"送風": "fan",
		"温度": {
			"アップ": "temp-up",
			"ダウン": "temp-down",
		}[getWord(value.split(" ")[index + 1])],
		"湿度": {
			"アップ": "humidify-up",
			"ダウン": "humidify-down",
		}[getWord(value.split(" ")[index + 1])],
		"風速": "speed",
		"風量": "speed",
	}[getWord(value.split(" ")[index])]
	return option ? () => rmRun(irlist.aircon[option]) : false
}

// Windows
const pcHandler = (value, index) => {
	return {
		"起動": () => wol.wake(config.pcMac)
	}[getWord(value.split(" ")[index])]
}