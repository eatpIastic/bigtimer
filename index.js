/// <reference types="../CTAutocomplete" />

import { getRoomData, rooms } from "../roomsAPI/utils/utils";
import Dungeon from "../BloomCore/dungeons/Dungeon";
import PogObject from "../PogData";

const customData = new PogObject("bigtimer", {}, "customCompletions.json");
const pbData = new PogObject("bigtimer", {}, "pbs.json");

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");

const tabCompletions = [];
const roomToSecretCount = new Map();

let currentRoom = null;
let soloRun = false;
let lastChestClicked = null;
let completedRooms = new Set();

register("worldLoad", () => completedRooms = new Set());


register("step", () => {
    if (!Dungeon.inDungeon || soloRun || Date.now() - Dungeon.runStarted > 5000) return;

    soloRun = Scoreboard.getLines().some(line => line.getName().removeFormatting() == "Solo🎁");
}).setFps(1);


register("command", (...args) => {
    if (!args?.[0]) {
        ChatLib.chat(`Incorrect Usage. Example: /bigtimer Pirate 5 or /bigtimer pb`);
        return;
    }

    if (args[0] == "pb" || args[0] == "pbs") {
        if (!args?.[1]) {
            printPBS();
        } else {
            let roomName = args.splice(1).join(" ");
            let PBstr = `&7> &9PBs for &f${roomName}: `;

            if (pbData?.["solo"]?.[roomName]) {
                PBstr += `solo: ${(pbData["solo"][roomName]).toFixed(2)} `;
            }
            if (pbData?.["realrun"]?.[roomName]) {
                PBstr += `realrun: ${(pbData["realrun"][roomName]).toFixed(2)}`;
            }

            ChatLib.chat(PBstr);
        }
        
        return;
    }

    if (!args?.[1]) {
        ChatLib.chat(`Incorrect Usage. Example: /bigtimer Pirate 5 or /bigtimer pb`);
        return;
    }
    
    let room = "";
    for (let i = 0; i < args.length - 1; i++) {
        room += args[i] + " ";
    }
    room = room.trim();
    
    let numSecrets = parseInt(args[args.length-1]);

    if (isNaN(numSecrets)) {
        ChatLib.chat(`Incorrect Usage. Example: /bigtimer Pirate 5`);
        return;
    }

    customData[room] = numSecrets;
    customData.save();
}).setTabCompletions( (args) => {
    if (!args || args.length == 0 || args?.[0]?.trim() == "") {
        return tabCompletions;
    }

    let namesThatStartWith = [];

    tabCompletions.forEach(i => {
        if (i.startsWith((args[args.length - 1]))) {
            namesThatStartWith.push(i);
        }
    });

    return namesThatStartWith;
}).setName("bigtimer");


register("playerInteract", (action, pos, event) => {
    if (!Dungeon.inDungeon || action.toString() !== "RIGHT_CLICK_BLOCK") {
        return;
    }

    let block = World.getBlockAt(pos.getX(), pos.getY(), pos.getZ());
    if (!block?.type) return;

    if (block.type.getName() == "Chest") {
        let posStr = `${pos.getX()},${pos.getY()},${pos.getZ()}`;
        lastChestClicked = posStr;
        if (currentRoom != null) {
            if (currentRoom.fakeAt.has(posStr)) {
                currentRoom.removeFakeSecret();
            }
        }
    }
});


register("packetReceived", (packet, event) => {
    if (!Dungeon.inDungeon) return;

    if (packet.func_179841_c() == 2) {
        DungeonRoom.secretUpdate(packet);
        // if (currentRoom != null) currentRoom.print();
        return;
    } else if (packet.func_179841_c() == 0) {
        // // That chest is locked!
        const chatComponent = packet.func_148915_c();
        const text = new String(chatComponent.func_150254_d().removeFormatting());
        if (text == "That chest is locked!") {
            if (currentRoom == null) {
                let roomData = getRoomData();
                let maxSecrets = roomData?.secrets;
                if (!maxSecrets) return;

                let fakeMaxSecrets = customData?.[roomData?.name] ?? maxSecrets;
    
                currentRoom = new DungeonRoom(0, maxSecrets, roomData.name, fakeMaxSecrets);
                currentRoom.addFakeSecret();
            } else {
                if (!currentRoom.fakeAt.has(lastChestClicked)) {
                    currentRoom.addFakeSecret();
                }
            }
        } // "You hear the sound of something opening..."
    }


}).setFilteredClass(S02PacketChat);

class DungeonRoom {
    static secretUpdate = (packet) => {
        let unformattedText = packet.func_148915_c().text.removeFormatting();
        let secretMatch = unformattedText.match(/.+(\d+)\/(\d+) Secrets.*/);
        if (!secretMatch) return;

        let roomName = getRoomData()?.name;
        if (!roomName) return;
    
        let secretsDone = parseInt(secretMatch[1]);
        let maxSecrets = parseInt(secretMatch[2]);
        let fakeMaxSecrets = customData?.[roomName] ?? maxSecrets;

        if (currentRoom != null && roomName != currentRoom.roomName) {
            currentRoom = null;
        }
    
        if (secretsDone == 0 && (maxSecrets == 1 || fakeMaxSecrets == 1) && currentRoom == null) {
            currentRoom = new DungeonRoom(0, 1, roomName, fakeMaxSecrets);
            return;
        } else if (secretsDone == 0 && currentRoom == null) {
            return;
        }
        
        if (secretsDone == 1 && currentRoom == null && maxSecrets != 1) {
            currentRoom = new DungeonRoom(secretsDone, maxSecrets, roomName, fakeMaxSecrets);
        }
    
        if (currentRoom != null) {
            currentRoom.checkCompleted(secretsDone);
        }
    }

    constructor(currentSecrets, maxSecrets, roomName, fakeMaxSecrets) {
        if (completedRooms.has(roomName)) {
            currentRoom = null;
        }
        this.currentSecrets = currentSecrets;
        this.fakeSecrets = 0;
        this.fakeMaxSecrets = fakeMaxSecrets;
        this.maxSecrets = maxSecrets;
        this.roomName = roomName;
        this.startedAt = Date.now();
        this.fakeAt = new Set();
        this.fakeCompleted = false;
    }

    print() {
        console.log(`${this.roomName} ${this.currentSecrets} ${this.fakeSecrets} ${this.maxSecrets} ${this.fakeAt.size}`);
    }

    addFakeSecret() {
        if (lastChestClicked == null) return;
        
        if (this.fakeAt.has(lastChestClicked)) {
            return;
        }

        this.fakeSecrets++;
        this.checkCompleted(this.currentSecrets);
        this.fakeAt.add(lastChestClicked);
    }

    removeFakeSecret() {
        this.fakeSecrets--;
        this.fakeAt.delete(lastChestClicked);
        this.checkCompleted(this.currentSecrets);
    }

    checkCompleted(secretsDone) {
        this.currentSecrets = secretsDone;

        if (this.fakeMaxSecrets != this.maxSecrets && !this.fakeCompleted && this.currentSecrets + this.fakeSecrets >= this.fakeMaxSecrets) {
            this.fakeCompleted = true;
            ChatLib.chat(`&7> &b${this.roomName} &fdone in &b${this.formatTime()} &fseconds &7(${this.currentSecrets + (this.fakeSecrets / 2)}/${this.fakeMaxSecrets})`);

            let beatsPB = (pbData?.[this.roomName] || 100000000000) > this.doneTime;
            if (beatsPB) {
                if (!pbData?.["solo"]) pbData["solo"] = {};
                if (!pbData?.["realrun"]) pbData["realrun"] = {};
                pbData[soloRun ? "solo" : "realrun"][this.roomName] = this.doneTime;
                pbData.save();
            }
        } else if (this.currentSecrets + this.fakeSecrets >= this.maxSecrets) {
            ChatLib.chat(`&7> &b${this.roomName} &fdone in &b${this.formatTime()} &fseconds &7(${this.currentSecrets + (this.fakeSecrets / 2)}/${this.maxSecrets})`);
            
            let beatsPB = (pbData?.[this.roomName] || 100000000000) > this.doneTime;
            if (beatsPB) {
                if (!pbData?.["solo"]) pbData["solo"] = {};
                if (!pbData?.["realrun"]) pbData["realrun"] = {};
                pbData[soloRun ? "solo" : "realrun"][this.roomName] = this.doneTime;
                pbData.save();
            }
            
            completedRooms.add(this.roomName);
            currentRoom = null;
        }
    }

    formatTime() {
        this.doneTime = Date.now() - this.startedAt;
        this.doneTime /= 1000.0;
        return `${(this.doneTime).toFixed(2)}`;
    }
}


const setupTabCompletion = () => {
    for (let i = 0; i < rooms.length; i++) {
        tabCompletions.push(rooms[i].name);
        roomToSecretCount.set(rooms[i].name, rooms[i]?.secrets ?? 0);
    }
}

const printPBS = () => {
    let pbKeys = Object.keys(pbData);
    for(let i = 0; i < pbKeys.length; i++) {
        ChatLib.chat(`&8-----  &9&l${pbKeys[i]} pbs`);
        let roomKeys = Object.keys(pbData[pbKeys[i]]);
        for (let j = 0; j < roomKeys.length; j++) {
            ChatLib.chat(`&7> &9${roomKeys[j]}&f: ${(pbData[pbKeys[i]][roomKeys[j]]).toFixed(2)} &7(${customData?.[roomKeys[j]] ?? roomToSecretCount.get(roomKeys[j])})`);
        }
    }
}

setupTabCompletion();
